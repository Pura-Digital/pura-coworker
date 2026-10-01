import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listRecentArtifactWorkspaceFiles } from '../src/main/utils/recent-workspace-files';

describe('listRecentArtifactWorkspaceFiles', () => {
  let rootDir: string;
  let artifactsDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-cowork-recent-files-'));
    artifactsDir = path.join(rootDir, '.aiden', 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('returns deliverable outputs from workspace excluding .aiden', async () => {
    const before = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));

    await fs.writeFile(path.join(rootDir, 'report.docx'), 'doc');
    await fs.writeFile(path.join(artifactsDir, 'build.py'), 'py');

    const { outputs, utils } = await listRecentArtifactWorkspaceFiles(rootDir, before);

    expect(outputs.map((item) => path.basename(item.path))).toContain('report.docx');
    expect(outputs.map((item) => path.basename(item.path))).not.toContain('build.py');
    expect(utils.map((item) => path.basename(item.path))).toContain('build.py');
    expect(utils.map((item) => path.basename(item.path))).not.toContain('report.docx');
  });

  it('does not treat source code in workspace root as output deliverables', async () => {
    const before = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));

    await fs.writeFile(path.join(rootDir, 'index.ts'), 'ts');
    await fs.writeFile(path.join(rootDir, 'deck.pptx'), 'ppt');

    const { outputs } = await listRecentArtifactWorkspaceFiles(rootDir, before);
    const names = outputs.map((item) => path.basename(item.path));

    expect(names).toContain('deck.pptx');
    expect(names).not.toContain('index.ts');
  });

  it('returns empty lists when .aiden/artifacts does not exist and no outputs', async () => {
    const emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'open-cowork-recent-files-empty-'));
    try {
      const { outputs, utils } = await listRecentArtifactWorkspaceFiles(emptyRoot, Date.now() - 1000);
      expect(outputs).toEqual([]);
      expect(utils).toEqual([]);
    } finally {
      await fs.rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it('ignores files inside excluded directories under artifacts', async () => {
    const before = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));

    await fs.mkdir(path.join(artifactsDir, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(artifactsDir, 'node_modules', 'ignored.txt'), 'ignore');
    await fs.writeFile(path.join(artifactsDir, 'helper.sh'), 'ok');

    const { utils } = await listRecentArtifactWorkspaceFiles(rootDir, before);

    expect(utils.map((item) => path.basename(item.path))).toContain('helper.sh');
    expect(utils.map((item) => path.basename(item.path))).not.toContain('ignored.txt');
  });

  it('ignores system metadata files like .DS_Store', async () => {
    const before = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));

    await fs.writeFile(path.join(artifactsDir, '.DS_Store'), 'noise');
    await fs.writeFile(path.join(rootDir, 'slides.pptx'), 'ppt');

    const { outputs } = await listRecentArtifactWorkspaceFiles(rootDir, before);

    expect(outputs.map((item) => path.basename(item.path))).toContain('slides.pptx');
    expect(outputs.map((item) => path.basename(item.path))).not.toContain('.DS_Store');
  });

  it('orders each list by most recent change first', async () => {
    const before = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));

    const older = path.join(rootDir, 'older.pdf');
    const newer = path.join(rootDir, 'newer.pdf');
    await fs.writeFile(older, '1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.writeFile(newer, '2');

    const { outputs } = await listRecentArtifactWorkspaceFiles(rootDir, before);

    expect(outputs[0]?.path).toBe(newer);
    expect(outputs[1]?.path).toBe(older);
  });
});
