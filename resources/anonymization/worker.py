"""Aiden's private, offline JSON-lines inference worker. No HTTP server or mapping files."""
import contextlib
import json
import os
from pathlib import Path
import sys
import zipfile
import xml.etree.ElementTree as ET

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
sys.path.insert(0, str(Path(__file__).parent / 'vendor'))


def extract_document(filename):
    path = Path(filename)
    suffix = path.suffix.lower()
    if path.stat().st_size > 50 * 1024 * 1024:
        raise ValueError('document_too_large')
    if suffix in {'.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.html', '.log'}:
        return path.read_text(encoding='utf-8-sig')
    if suffix == '.pdf':
        from pypdf import PdfReader
        reader = PdfReader(path)
        if reader.is_encrypted:
            raise ValueError('encrypted_document')
        if any(len(page.images) for page in reader.pages):
            raise ValueError('document_contains_nontext_content')
        pages = [page.extract_text() or '' for page in reader.pages]
        if any(not page.strip() for page in pages):
            raise ValueError('page_without_extractable_text')
        return '\n\n'.join(pages)
    if suffix in {'.docx', '.pptx', '.xlsx'}:
        with zipfile.ZipFile(path) as archive:
            if sum(i.file_size for i in archive.infolist()) > 50 * 1024 * 1024:
                raise ValueError('document_too_large')
            if any(any(part in name for part in ['/media/', '/embeddings/', '/charts/', '/diagrams/']) for name in archive.namelist()):
                raise ValueError('document_contains_nontext_content')
            if suffix == '.docx':
                names = [n for n in archive.namelist() if n.startswith('word/') and n.endswith('.xml')
                         and ('document' in n or 'header' in n or 'footer' in n or 'notes' in n)]
            elif suffix == '.pptx':
                names = [n for n in archive.namelist() if n.endswith('.xml') and
                         (n.startswith('ppt/slides/slide') or n.startswith('ppt/notesSlides/notesSlide'))]
            else:
                names = [n for n in archive.namelist() if n.endswith('.xml') and
                         (n == 'xl/sharedStrings.xml' or n.startswith('xl/worksheets/sheet'))]
            texts = []
            shared = []
            if suffix == '.xlsx' and 'xl/sharedStrings.xml' in archive.namelist():
                shared_root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
                shared = [''.join(n.text or '' for n in item.iter() if n.tag.rsplit('}', 1)[-1] == 't')
                          for item in shared_root]
            for name in sorted(names):
                if suffix == '.xlsx' and name == 'xl/sharedStrings.xml':
                    continue
                root = ET.fromstring(archive.read(name))
                if suffix == '.xlsx':
                    rows = []
                    for row in root.iter():
                        if row.tag.rsplit('}', 1)[-1] != 'row':
                            continue
                        cells = []
                        for cell in row:
                            parts = {n.tag.rsplit('}', 1)[-1]: n.text or '' for n in cell}
                            value = parts.get('v', '')
                            if cell.attrib.get('t') == 's':
                                value = shared[int(value)]
                            elif cell.attrib.get('t') == 'inlineStr':
                                value = ''.join(n.text or '' for n in cell.iter() if n.tag.rsplit('}', 1)[-1] == 't')
                            if 'f' in parts:
                                value = '=' + parts['f'] + ' (cached: ' + value + ')'
                            cells.append(cell.attrib.get('r', '') + ': ' + value)
                        rows.append('\t'.join(cells))
                    texts.append(name + '\n' + '\n'.join(rows))
                else:
                    paragraphs = []
                    for paragraph in root.iter():
                        if paragraph.tag.rsplit('}', 1)[-1] != 'p':
                            continue
                        fragments = []
                        for node in paragraph.iter():
                            tag = node.tag.rsplit('}', 1)[-1]
                            if tag == 't':
                                fragments.append(node.text or '')
                            elif tag in {'tab', 'br'}:
                                fragments.append('\t' if tag == 'tab' else '\n')
                        paragraphs.append(''.join(fragments))
                    texts.append('\n'.join(paragraphs))
            return '\n\n'.join(texts)
    raise ValueError('unsupported_document')


def emit(value):
    sys.stdout.write(json.dumps(value, ensure_ascii=False) + '\n')
    sys.stdout.flush()


def main():
    # Library progress and diagnostics must never enter the protocol stream.
    with contextlib.redirect_stdout(sys.stderr):
        from transformers import pipeline
        import inference
        inference.nlp = pipeline('token-classification', model=sys.argv[1], tokenizer=sys.argv[1],
                                 aggregation_strategy='simple', device=-1,
                                 model_kwargs={'attn_implementation': 'eager'})
    emit({'ready': True})
    for line in sys.stdin:
        request_id = None
        failure_kind = 'complex'
        try:
            request = json.loads(line)
            request_id = request['id']
            with contextlib.redirect_stdout(sys.stderr):
                if request['method'] == 'extract':
                    extracted = extract_document(request['path'])
                    if len(extracted) > 2_000_000:
                        raise ValueError('text_too_large')
                    result = {'text': extracted}
                else:
                    text = request['text']
                    if len(text) > 2_000_000:
                        raise ValueError('text_too_large')
                    failure_kind = 'service'
                    chunks = inference.bounded_chunks(text, inference.nlp.tokenizer)
                    entities, _ = inference.detect_model(text, chunks)
                    inference.complete_time(entities, text)
                    entities = inference._merge(entities + inference.detect_regex(text), text)
                    result = {'entities': entities,
                              'complex': any(e['source'] == 'modello' and e['score'] < 0.6 for e in entities)}
            emit({'id': request_id, 'result': result})
        except Exception:
            # Do not echo library exceptions: some include document text or paths.
            emit({'id': request_id, 'error': 'local_processing_failed', 'kind': failure_kind})


if __name__ == '__main__':
    main()
