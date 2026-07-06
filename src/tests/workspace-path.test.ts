import { describe, it, expect } from 'vitest';
import {
  resolvePathAgainstWorkspace,
  getWorkingDirBasename,
  isDefaultWorkingDir,
  formatWorkingDirDisplayName,
  DEFAULT_WORKING_DIR_BASENAME,
} from '../shared/workspace-path';

describe('resolvePathAgainstWorkspace', () => {
  it('returns empty/falsy pathValue as-is', () => {
    expect(resolvePathAgainstWorkspace('')).toBe('');
  });

  it('returns absolute POSIX path as-is', () => {
    expect(resolvePathAgainstWorkspace('/usr/local/bin', '/home/user')).toBe('/usr/local/bin');
  });

  it('returns Windows drive path as-is', () => {
    expect(resolvePathAgainstWorkspace('C:\\Users\\foo', 'D:\\work')).toBe('C:\\Users\\foo');
  });

  it('resolves relative path against POSIX workspace', () => {
    expect(resolvePathAgainstWorkspace('src/main.ts', '/Users/haoqing/project')).toBe(
      '/Users/haoqing/project/src/main.ts'
    );
  });

  it('resolves relative path against Windows workspace', () => {
    expect(resolvePathAgainstWorkspace('src\\main.ts', 'C:\\Users\\foo\\project')).toBe(
      'C:\\Users\\foo\\project\\src\\main.ts'
    );
  });

  it('normalizes .. segments in relative path', () => {
    expect(resolvePathAgainstWorkspace('../other/file.ts', '/Users/haoqing/project/src')).toBe(
      '/Users/haoqing/project/other/file.ts'
    );
  });

  it('normalizes . segments', () => {
    expect(resolvePathAgainstWorkspace('./file.ts', '/Users/haoqing/project')).toBe(
      '/Users/haoqing/project/file.ts'
    );
  });

  it('remaps /workspace/ prefix to workspace path', () => {
    expect(resolvePathAgainstWorkspace('/workspace/src/index.ts', '/Users/haoqing/project')).toBe(
      '/Users/haoqing/project/src/index.ts'
    );
  });

  it('remaps Windows workspace prefix to workspace path', () => {
    expect(resolvePathAgainstWorkspace('C:\\workspace\\src\\index.ts', 'D:\\myproject')).toBe(
      'D:\\myproject\\src\\index.ts'
    );
  });

  it('returns relative path as-is when no workspace provided', () => {
    expect(resolvePathAgainstWorkspace('src/main.ts')).toBe('src/main.ts');
    expect(resolvePathAgainstWorkspace('src/main.ts', null)).toBe('src/main.ts');
  });

  it('returns /workspace/ path as-is when no workspace provided', () => {
    expect(resolvePathAgainstWorkspace('/workspace/src/main.ts')).toBe('/workspace/src/main.ts');
  });
});

describe('working dir display name', () => {
  const defaultLabel = 'Base workspace';
  const defaultPath = `/Users/alfred/Library/Application Support/Aiden/${DEFAULT_WORKING_DIR_BASENAME}`;

  it('extracts basename from POSIX and Windows paths', () => {
    expect(getWorkingDirBasename('/Users/foo/my-project')).toBe('my-project');
    expect(getWorkingDirBasename('C:\\Users\\foo\\my-project\\')).toBe('my-project');
  });

  it('detects the built-in default working directory', () => {
    expect(isDefaultWorkingDir(defaultPath)).toBe(true);
    expect(isDefaultWorkingDir('/tmp/my-project')).toBe(false);
  });

  it('maps default working dir to a friendly label without changing custom paths', () => {
    expect(formatWorkingDirDisplayName(defaultPath, defaultLabel)).toBe(defaultLabel);
    expect(formatWorkingDirDisplayName('/Users/foo/my-project', defaultLabel)).toBe('my-project');
  });
});
