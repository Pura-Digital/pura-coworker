import { getAidenArtifactsDirRelative } from './aiden-workspace';

/** Deliverable extensions shown under Artifacts → Output. */
export const OUTPUT_ARTIFACT_EXTENSIONS = new Set([
  'docx',
  'doc',
  'pdf',
  'pptx',
  'ppt',
  'key',
  'xlsx',
  'xls',
  'csv',
  'tsv',
  'ods',
  'odt',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'tiff',
  'mp4',
  'mov',
  'mkv',
  'webm',
  'avi',
  'mp3',
  'wav',
  'm4a',
  'ogg',
  'flac',
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'epub',
  'mobi',
  'html',
  'htm',
  'md',
  'markdown',
  'txt',
  'rtf',
]);

export function isUnderAidenArtifactsPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const marker = `/${getAidenArtifactsDirRelative().toLowerCase()}/`;
  return normalized.includes(marker) || normalized.endsWith(marker.slice(0, -1));
}

export function isOutputArtifactExtension(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  const lastDot = normalized.lastIndexOf('.');
  if (lastDot === -1 || lastDot === normalized.length - 1) {
    return false;
  }
  return OUTPUT_ARTIFACT_EXTENSIONS.has(normalized.slice(lastDot + 1));
}
