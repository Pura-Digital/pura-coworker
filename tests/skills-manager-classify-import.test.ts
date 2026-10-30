import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let testRoot = '';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => testRoot,
    getVersion: () => '0.0.0-test',
    getPath: (name: string) => {
      if (name === 'userData') return path.join(testRoot, 'userData');
      if (name === 'home') return path.join(testRoot, 'home');
      return testRoot;
    },
  },
}));

vi.mock('../src/main/utils/logger', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { SkillsManager } from '../src/main/skills/skills-manager';
import type { DatabaseInstance } from '../src/main/db/database';

function createDbMock(): DatabaseInstance {
  const statement = { run: vi.fn() };
  return {
    raw: {} as any,
    sessions: {} as any,
    messages: {} as any,
    traceSteps: {} as any,
    scheduledTasks: {} as any,
    prepare: vi.fn(() => statement as any),
    exec: vi.fn(),
    pragma: vi.fn(),
    close: vi.fn(),
  };
}

function writeSkill(folderPath: string, name: string, description: string): void {
  fs.mkdirSync(folderPath, { recursive: true });
  fs.writeFileSync(
    path.join(folderPath, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nUse ${name}.`,
    'utf8'
  );
}

function createPluginDirectory(
  root: string,
  pluginName: string,
  skills: Array<{ name: string; description: string }>
): string {
  const pluginRoot = path.join(root, pluginName);
  fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: pluginName, version: '1.0.0', description: `${pluginName} plugin` }, null, 2),
    'utf8'
  );

  for (const skill of skills) {
    writeSkill(path.join(pluginRoot, 'skills', skill.name), skill.name, skill.description);
  }

  return pluginRoot;
}

describe('SkillsManager classifyImportFolder', () => {
  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'open-cowork-classify-import-'));
    fs.mkdirSync(path.join(testRoot, 'userData'), { recursive: true });
    fs.mkdirSync(path.join(testRoot, 'home'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  it('classifies a folder with SKILL.md at root as a single skill', async () => {
    const skillRoot = path.join(testRoot, 'my-skill');
    writeSkill(skillRoot, 'my-skill', 'Does one thing');

    const manager = new SkillsManager(createDbMock());
    const result = await manager.classifyImportFolder(skillRoot);

    expect(result).toEqual({
      kind: 'skill',
      valid: true,
      errors: [],
    });
  });

  it('classifies a plugin directory with skills/ as a package', async () => {
    const pluginRoot = createPluginDirectory(testRoot, 'office-pack', [
      { name: 'docx', description: 'DOCX skill' },
      { name: 'pdf', description: 'PDF skill' },
    ]);

    const manager = new SkillsManager(createDbMock());
    const result = await manager.classifyImportFolder(pluginRoot);

    expect(result.kind).toBe('plugin');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.suggestedPackageName).toBe('office-pack');
    expect(result.skillCount).toBe(2);
  });

  it('returns validation errors for unknown folders', async () => {
    const emptyRoot = path.join(testRoot, 'empty');
    fs.mkdirSync(emptyRoot, { recursive: true });

    const manager = new SkillsManager(createDbMock());
    const result = await manager.classifyImportFolder(emptyRoot);

    expect(result.valid).toBe(false);
    expect(result.kind).toBe('plugin');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
