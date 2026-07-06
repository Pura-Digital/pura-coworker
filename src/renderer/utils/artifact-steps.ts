import type { TraceStep } from '../types';
import { resolveArtifactPath } from './artifact-path';
import { extractFilePathFromToolInput, extractFilePathFromToolOutput } from './tool-output-path';

const FILE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'Write',
  'Edit',
  'write',
  'edit',
  'NotebookEdit',
  'notebook_edit',
]);

function isReliablePathToolName(toolName: string | undefined): boolean {
  if (!toolName) {
    return false;
  }
  if (FILE_TOOL_NAMES.has(toolName)) {
    return true;
  }

  const normalized = toolName.trim().toLowerCase();
  return /(?:^|__|_)(?:screenshot|take_screenshot|capture_screenshot)(?:$|__|_)/.test(normalized);
}

type ArtifactStepResult = {
  artifactSteps: TraceStep[];
  fileSteps: TraceStep[];
  displayArtifactSteps: TraceStep[];
};

export function getArtifactLabel(pathValue: string, name?: string): string {
  const trimmedName = name?.trim();
  const trimmedPath = pathValue.trim();
  if (trimmedPath) {
    const normalized = trimmedPath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || trimmedPath;
  }

  return trimmedName ?? '';
}

export type ArtifactIconKey =
  | 'slides'
  | 'table'
  | 'doc'
  | 'code'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'file';

export type ArtifactIconComponent =
  | 'presentation'
  | 'table'
  | 'document'
  | 'code'
  | 'image'
  | 'text'
  | 'audio'
  | 'video'
  | 'archive'
  | 'file';

const extensionIconMap: Record<string, ArtifactIconKey> = {
  pptx: 'slides',
  ppt: 'slides',
  key: 'slides',
  keynote: 'slides',
  xlsx: 'table',
  xls: 'table',
  csv: 'table',
  tsv: 'table',
  docx: 'doc',
  doc: 'doc',
  pdf: 'doc',
  md: 'code',
  markdown: 'code',
  js: 'code',
  jsx: 'code',
  ts: 'code',
  tsx: 'code',
  py: 'code',
  java: 'code',
  go: 'code',
  rs: 'code',
  c: 'code',
  cpp: 'code',
  h: 'code',
  hpp: 'code',
  css: 'code',
  scss: 'code',
  html: 'code',
  json: 'code',
  lock: 'code',
  yaml: 'code',
  yml: 'code',
  txt: 'text',
  log: 'text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  ogg: 'audio',
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  webm: 'video',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
};

export function getArtifactIconKey(filename: string): ArtifactIconKey {
  const normalized = filename.trim().toLowerCase();
  const lastDot = normalized.lastIndexOf('.');
  if (lastDot === -1 || lastDot === normalized.length - 1) {
    return 'file';
  }

  const ext = normalized.slice(lastDot + 1);
  return extensionIconMap[ext] ?? 'file';
}

export function getArtifactIconComponent(filename: string): ArtifactIconComponent {
  const key = getArtifactIconKey(filename);
  switch (key) {
    case 'slides':
      return 'presentation';
    case 'table':
      return 'table';
    case 'doc':
      return 'document';
    case 'code':
      return 'code';
    case 'image':
      return 'image';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    case 'archive':
      return 'archive';
    case 'text':
      return 'text';
    default:
      return 'file';
  }
}

export type ArtifactKind = 'output' | 'util';

export type ArtifactCatalogItem = {
  label: string;
  path: string;
  kind: ArtifactKind;
};

export type ArtifactCatalog = {
  outputs: ArtifactCatalogItem[];
  utils: ArtifactCatalogItem[];
};

const UTIL_EXTENSIONS = new Set([
  'py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'rb', 'pl', 'php', 'java', 'go', 'rs', 'cpp', 'c', 'h', 'hpp',
  'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'log', 'lock', 'sql',
]);

const OUTPUT_EXTENSIONS = new Set([
  'docx', 'doc', 'pdf', 'pptx', 'ppt', 'key',
  'xlsx', 'xls', 'csv', 'tsv', 'ods', 'odt',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff',
  'mp4', 'mov', 'mkv', 'webm', 'avi',
  'mp3', 'wav', 'm4a', 'ogg', 'flac',
  'zip', 'rar', '7z', 'tar', 'gz',
  'epub', 'mobi', 'html', 'htm', 'md', 'markdown', 'txt', 'rtf',
]);

const UTIL_PATH_PATTERNS = [
  /\/(?:tmp|temp|scratch|cache|\.cache|__pycache__|\.venv|venv|node_modules)(?:\/|$)/i,
  /\/scripts?\//i,
  /\/(?:utils?|helpers?|tools?)\//i,
];

type ArtifactSource = 'artifact' | 'file' | 'recent';

function parseArtifactMeta(toolOutput?: string): { path: string; name?: string; type?: string } | null {
  if (!toolOutput) {
    return null;
  }
  try {
    const parsed = JSON.parse(toolOutput) as Record<string, unknown>;
    const path = typeof parsed.path === 'string' ? parsed.path : '';
    if (!path) {
      return null;
    }
    return {
      path,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      type: typeof parsed.type === 'string' ? parsed.type : undefined,
    };
  } catch {
    return null;
  }
}

export function classifyArtifactKind(
  pathValue: string,
  options?: {
    explicitType?: string;
    source?: ArtifactSource;
    toolName?: string;
  }
): ArtifactKind {
  if (options?.explicitType) {
    const normalizedType = options.explicitType.trim().toLowerCase();
    if (['util', 'utility', 'intermediate', 'script', 'tool'].includes(normalizedType)) {
      return 'util';
    }
    if (['output', 'deliverable', 'result', 'final'].includes(normalizedType)) {
      return 'output';
    }
  }

  if (options?.source === 'artifact') {
    return 'output';
  }

  const normalizedPath = pathValue.replace(/\\/g, '/').toLowerCase();
  const fileName = normalizedPath.split('/').pop() || '';
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1) : '';

  if (UTIL_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath))) {
    return 'util';
  }

  if (UTIL_EXTENSIONS.has(ext)) {
    return 'util';
  }

  if (OUTPUT_EXTENSIONS.has(ext)) {
    return 'output';
  }

  if (options?.toolName && /screenshot/i.test(options.toolName)) {
    return 'output';
  }

  return 'output';
}

export function getArtifactCatalog(
  steps: TraceStep[],
  recentFiles: Array<{ path: string }>,
  cwd?: string | null
): ArtifactCatalog {
  const { artifactSteps, fileSteps } = getArtifactSteps(steps);
  const seenPaths = new Set<string>();
  const outputs: ArtifactCatalogItem[] = [];
  const utils: ArtifactCatalogItem[] = [];

  const addItem = (pathValue: string, label: string, kind: ArtifactKind) => {
    const resolvedPath = resolveArtifactPath(pathValue, cwd);
    const key = resolvedPath.trim();
    if (!key || seenPaths.has(key)) {
      return;
    }

    seenPaths.add(key);
    const item: ArtifactCatalogItem = {
      label: label || getArtifactLabel(pathValue),
      path: resolvedPath,
      kind,
    };

    if (kind === 'util') {
      utils.push(item);
    } else {
      outputs.push(item);
    }
  };

  for (const step of artifactSteps) {
    const meta = parseArtifactMeta(step.toolOutput);
    if (!meta?.path) {
      continue;
    }
    const kind = classifyArtifactKind(meta.path, {
      explicitType: meta.type,
      source: 'artifact',
    });
    addItem(meta.path, meta.name || getArtifactLabel(meta.path), kind);
  }

  for (const step of fileSteps) {
    const pathValue = extractFilePathFromToolOutput(step.toolOutput)
      || extractFilePathFromToolInput(step.toolInput);
    if (!pathValue) {
      continue;
    }
    const kind = classifyArtifactKind(pathValue, {
      source: 'file',
      toolName: step.toolName,
    });
    addItem(pathValue, getArtifactLabel(pathValue), kind);
  }

  for (const file of recentFiles) {
    const kind = classifyArtifactKind(file.path, { source: 'recent' });
    addItem(file.path, getArtifactLabel(file.path), kind);
  }

  return { outputs, utils };
}

export function getArtifactSteps(steps: TraceStep[]): ArtifactStepResult {
  const artifactSteps = steps.filter(
    (step) => step.type === 'tool_result' && step.toolName === 'artifact'
  );

  const rawFileSteps = steps.filter((step) => {
    if (step.status !== 'completed') {
      return false;
    }
    if (!isReliablePathToolName(step.toolName)) {
      return false;
    }
    const pathFromOutput = extractFilePathFromToolOutput(step.toolOutput);
    const pathFromInput = extractFilePathFromToolInput(step.toolInput);
    if (!pathFromOutput && !pathFromInput) {
      return false;
    }
    return step.type === 'tool_result' || step.type === 'tool_call';
  });

  // Keep only one entry per file path to avoid noisy duplicates.
  const seenPaths = new Set<string>();
  const fileSteps: TraceStep[] = [];
  for (let i = rawFileSteps.length - 1; i >= 0; i -= 1) {
    const step = rawFileSteps[i];
    const pathValue = extractFilePathFromToolOutput(step.toolOutput)
      || extractFilePathFromToolInput(step.toolInput)
      || '';
    const key = pathValue.trim();
    if (!key || seenPaths.has(key)) {
      continue;
    }
    seenPaths.add(key);
    fileSteps.unshift(step);
  }

  return {
    artifactSteps,
    fileSteps,
    displayArtifactSteps: fileSteps,
  };
}
