import { resolveArtifactPath } from './artifact-path';
import {
  decodePathSafely,
  isUncPath,
  isWindowsDrivePath,
  localPathFromFileUrl,
} from '../../shared/local-file-path';

const markdownInlineLinkPattern = /(?<!!)\[([^\]]+)\]\(\s*([\s\S]*?)\s*\)/g;
const unixAbsolutePathPattern = /^\//;
const webLikeUrlPattern = /^(?:https?:\/\/|mailto:|file:\/\/|#)/i;
const httpLikeUrlPattern = /^(?:https?:\/\/|mailto:|#)/i;
const explicitUrlSchemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const protocolRelativeWebPattern =
  /^\/\/(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[:/]|$)/i;
const domainHostPattern =
  /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const commonFileExtensionTlds = new Set([
  'c',
  'cc',
  'cpp',
  'css',
  'csv',
  'doc',
  'docx',
  'gif',
  'gz',
  'heic',
  'html',
  'jpeg',
  'jpg',
  'js',
  'json',
  'jsx',
  'log',
  'md',
  'mov',
  'mp3',
  'mp4',
  'pdf',
  'png',
  'ppt',
  'pptx',
  'py',
  'rb',
  'rs',
  'scss',
  'sh',
  'sql',
  'svg',
  'tar',
  'ts',
  'tsx',
  'txt',
  'webp',
  'xls',
  'xlsx',
  'xml',
  'yaml',
  'yml',
  'zip',
]);

function isDomainLikeHost(segment: string): boolean {
  return domainHostPattern.test(segment);
}

function normalizePathCandidate(value: string): string {
  return value.replace(/\r/g, '').replace(/\n+/g, '').trim();
}

function encodeFilePath(pathValue: string): string {
  return encodeURI(pathValue).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

function toFileUrl(pathValue: string): string | null {
  const normalizedPathValue = normalizePathCandidate(pathValue);
  if (!normalizedPathValue) {
    return null;
  }

  if (webLikeUrlPattern.test(normalizedPathValue)) {
    return null;
  }

  if (unixAbsolutePathPattern.test(normalizedPathValue)) {
    return `file://${encodeFilePath(normalizedPathValue)}`;
  }

  if (isWindowsDrivePath(normalizedPathValue)) {
    const normalized = normalizedPathValue.replace(/\\/g, '/');
    return `file:///${encodeFilePath(normalized)}`;
  }

  if (isUncPath(normalizedPathValue)) {
    const normalized = normalizedPathValue.replace(/^\\\\+/, '').replace(/\\/g, '/');
    return `file://${encodeFilePath(normalized)}`;
  }

  return null;
}

// Escape markdown special characters in label
const escapeMarkdown = (text: string): string => {
  return text.replace(/([\\`*_{}[\]()#+\-!|])/g, '\\$1');
};

export function normalizeLocalFileMarkdownLinks(markdown: string): string {
  if (!markdown) {
    return markdown;
  }

  return markdown.replace(markdownInlineLinkPattern, (full, label: string, rawHref: string) => {
    const href = rawHref.trim();
    if (!href) {
      return full;
    }

    const fileUrl = toFileUrl(href);
    if (!fileUrl) {
      return full;
    }

    return `[${escapeMarkdown(label)}](${fileUrl})`;
  });
}

export function looksLikeExternalWebHref(href: string): boolean {
  const trimmed = normalizePathCandidate(href);
  if (!trimmed || httpLikeUrlPattern.test(trimmed)) {
    return !!trimmed && httpLikeUrlPattern.test(trimmed);
  }

  if (trimmed.startsWith('file://') || isUncPath(trimmed) || isWindowsDrivePath(trimmed)) {
    return false;
  }

  if (protocolRelativeWebPattern.test(trimmed)) {
    return true;
  }

  if (/^www\./i.test(trimmed)) {
    return true;
  }

  const slashIndex = trimmed.indexOf('/');
  const hostSegment = slashIndex === -1 ? trimmed : trimmed.slice(0, slashIndex);

  if (!isDomainLikeHost(hostSegment)) {
    return false;
  }

  if (slashIndex === -1) {
    const labels = hostSegment.split('.');
    if (labels.length >= 3) {
      return true;
    }
    const tld = labels[labels.length - 1]?.toLowerCase() ?? '';
    return !commonFileExtensionTlds.has(tld);
  }

  return true;
}

export function normalizeExternalWebHref(href: string | undefined): string | null {
  if (!href) {
    return null;
  }

  const trimmed = normalizePathCandidate(href);
  if (!trimmed || !looksLikeExternalWebHref(trimmed)) {
    return null;
  }

  if (httpLikeUrlPattern.test(trimmed)) {
    return trimmed;
  }

  if (protocolRelativeWebPattern.test(trimmed)) {
    return `https:${trimmed}`;
  }

  return `https://${trimmed.replace(/^\/+/, '')}`;
}

export function extractLocalFilePathFromHref(href?: string): string | null {
  if (!href) {
    return null;
  }

  const trimmed = normalizePathCandidate(href);
  if (!trimmed || httpLikeUrlPattern.test(trimmed) || looksLikeExternalWebHref(trimmed)) {
    return null;
  }

  if (trimmed.startsWith('file://')) {
    return localPathFromFileUrl(trimmed);
  }

  if (unixAbsolutePathPattern.test(trimmed) || isWindowsDrivePath(trimmed) || isUncPath(trimmed)) {
    return decodePathSafely(trimmed);
  }

  return null;
}

export function resolveLocalFilePathFromHref(href: string | undefined, cwd?: string | null): string | null {
  if (!href) {
    return null;
  }

  const trimmed = normalizePathCandidate(href);
  if (!trimmed || httpLikeUrlPattern.test(trimmed) || looksLikeExternalWebHref(trimmed)) {
    return null;
  }

  const extractedPath = extractLocalFilePathFromHref(trimmed);
  if (extractedPath) {
    return resolveArtifactPath(extractedPath, cwd);
  }

  if (explicitUrlSchemePattern.test(trimmed)) {
    return null;
  }

  return resolveArtifactPath(decodePathSafely(trimmed), cwd);
}
