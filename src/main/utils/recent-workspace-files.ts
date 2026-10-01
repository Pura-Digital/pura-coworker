import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { AIDEN_ARTIFACTS_DIR_NAME, AIDEN_DIR_NAME } from '../../shared/aiden-workspace';
import { isOutputArtifactExtension } from '../../shared/artifact-classification';

export interface RecentWorkspaceFile {
  path: string;
  modifiedAt: number;
  size: number;
}

export interface RecentArtifactWorkspaceFiles {
  outputs: RecentWorkspaceFile[];
  utils: RecentWorkspaceFile[];
}

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.cowork-user-data',
  '.aiden',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.turbo',
]);

const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized']);

const EXCLUDED_FILE_PATTERNS = [
  /^\._/,
  /^~\$/,
  /^\.~lock\..*#$/,
  /~$/,
  /\.(?:tmp|temp|swp|swo|swn|bak|orig|rej|crdownload|part)$/i,
];

/**
 * Recent deliverable files for Artifacts → Output (workspace, excluding `.aiden`).
 * Recent utility files for Artifacts → Utility (`.aiden/artifacts` only).
 */
export async function listRecentArtifactWorkspaceFiles(
  rootDir: string,
  sinceMs: number,
  limit: number = 50
): Promise<RecentArtifactWorkspaceFiles> {
  const resolvedRoot = path.resolve(rootDir);
  const outputResults: RecentWorkspaceFile[] = [];
  const utilResults: RecentWorkspaceFile[] = [];

  await collectRecentWorkspaceFiles(resolvedRoot, sinceMs, outputResults, {
    includeFile: (fileName) => isOutputArtifactExtension(fileName),
  });

  const aidenArtifactsDir = path.join(resolvedRoot, AIDEN_DIR_NAME, AIDEN_ARTIFACTS_DIR_NAME);
  try {
    const stat = await fs.stat(aidenArtifactsDir);
    if (stat.isDirectory()) {
      await collectRecentWorkspaceFiles(aidenArtifactsDir, sinceMs, utilResults, {
        includeFile: () => true,
      });
    }
  } catch {
    // No utility artifacts folder yet
  }

  const sortAndLimit = (files: RecentWorkspaceFile[]) =>
    files.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, limit);

  return {
    outputs: sortAndLimit(outputResults),
    utils: sortAndLimit(utilResults),
  };
}

/** @deprecated Use listRecentArtifactWorkspaceFiles */
export async function listRecentWorkspaceFiles(
  rootDir: string,
  sinceMs: number,
  limit: number = 50
): Promise<RecentWorkspaceFile[]> {
  const { outputs, utils } = await listRecentArtifactWorkspaceFiles(rootDir, sinceMs, limit);
  return [...outputs, ...utils];
}

async function collectRecentWorkspaceFiles(
  rootDir: string,
  sinceMs: number,
  results: RecentWorkspaceFile[],
  options: { includeFile: (fileName: string, fullPath: string) => boolean }
): Promise<void> {
  const queue = [path.resolve(rootDir)];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (shouldIgnoreFile(entry.name)) {
        continue;
      }

      if (!options.includeFile(entry.name, fullPath)) {
        continue;
      }

      try {
        const stat = await fs.stat(fullPath);
        const touchedAt = Math.max(stat.mtimeMs, stat.birthtimeMs || 0);
        if (touchedAt < sinceMs) {
          continue;
        }

        results.push({
          path: fullPath,
          modifiedAt: touchedAt,
          size: stat.size,
        });
      } catch {
        // Ignore transient file errors during scanning
      }
    }
  }
}

function shouldIgnoreFile(fileName: string): boolean {
  if (EXCLUDED_FILES.has(fileName)) {
    return true;
  }

  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}
