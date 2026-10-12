"""Read-only extraction contracts for the packaged worker; no neural model required."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('aiden_worker', root / 'resources/anonymization/worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class ExtractionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)

    def path(self, name):
        return Path(self.directory.name) / name

    def test_plain_utf8(self):
        path = self.path('test.txt')
        path.write_text('Cliente: Mario Rossi 😀', encoding='utf-8')
        self.assertEqual(worker.extract_document(path), 'Cliente: Mario Rossi 😀')

    def test_word_preserves_adjacent_runs_and_paragraphs(self):
        path = self.path('test.docx')
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('word/document.xml', '<document><p><r><t>Mario </t></r><r><t>Rossi</t></r></p><p><t>Seconda riga</t></p></document>')
        self.assertEqual(worker.extract_document(path), 'Mario Rossi\nSeconda riga')

    def test_spreadsheet_resolves_shared_strings_to_cells(self):
        path = self.path('test.xlsx')
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('xl/sharedStrings.xml', '<sst><si><t>Mario Rossi</t></si></sst>')
            archive.writestr('xl/worksheets/sheet1.xml', '<worksheet><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row></worksheet>')
        extracted = worker.extract_document(path)
        self.assertIn('A1: Mario Rossi', extracted)
        self.assertIn('B1: 42', extracted)

    def test_mixed_media_requires_human_decision(self):
        path = self.path('test.docx')
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('word/media/image1.png', b'image')
        with self.assertRaises(ValueError):
            worker.extract_document(path)

    def test_text_pdf_and_blank_pdf(self):
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
        writer = PdfWriter()
        page = writer.add_blank_page(300, 300)
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
        contents = DecodedStreamObject()
        contents.set_data(b'BT /F1 12 Tf 10 100 Td (Mario Rossi) Tj ET')
        page[NameObject('/Contents')] = contents
        readable = self.path('text.pdf')
        writer.write(readable)
        self.assertIn('Mario Rossi', worker.extract_document(readable))
        blank = PdfWriter()
        blank.add_blank_page(300, 300)
        unreadable = self.path('scan.pdf')
        blank.write(unreadable)
        with self.assertRaises(ValueError):
            worker.extract_document(unreadable)


if __name__ == '__main__':
    unittest.main()
