import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ProjectMemoryUpdater,
  buildProjectTranscript,
  hasProjectMemory,
} from '../src/main/project/project-memory';
import type { Message } from '../src/renderer/types';

const directories: string[] = [];
function memoryFile(content = '# Archiveye Project Memory\n') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-memory-'));
  directories.push(dir);
  const file = path.join(dir, 'MEMORY.md');
  fs.writeFileSync(file, content);
  return file;
}
afterEach(() =>
  directories.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }))
);

describe('project memory', () => {
  it('recognizes a scaffold and retains conversation despite many tool messages', () => {
    expect(hasProjectMemory('# Archiveye Project Memory\n')).toBe(false);
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'Use AWS Frankfurt.' }] },
      ...Array.from({ length: 50 }, () => ({
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Read' }],
      })),
      { role: 'assistant', content: [{ type: 'text', text: 'Confirmed.' }] },
    ] as Message[];
    expect(buildProjectTranscript(messages)).toContain('Use AWS Frankfurt.');
    expect(buildProjectTranscript(messages)).not.toContain('Read');
    expect(buildProjectTranscript(messages, 30).length).toBeLessThanOrEqual(30);
  });

  it('serializes concurrent chats and merges against the latest saved memory', async () => {
    const file = memoryFile();
    const updater = new ProjectMemoryUpdater();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = updater.update(file, async (existing) => {
      await waiting;
      return `${existing}- Decision A`;
    });
    const secondGenerate = vi.fn(async (existing: string) => `${existing}- Decision B`);
    const second = updater.update(file, secondGenerate);
    await Promise.resolve();
    expect(secondGenerate).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second]);
    expect(secondGenerate.mock.calls[0][0]).toContain('Decision A');
    expect(fs.readFileSync(file, 'utf-8')).toContain('Decision B');
    expect(fs.readFileSync(`${file}.bak`, 'utf-8')).toContain('Decision A');
  });

  it('regenerates on manual edits instead of overwriting them with stale output', async () => {
    const file = memoryFile('# Memory\n- Old decision\n');
    const updater = new ProjectMemoryUpdater();
    const generate = vi.fn(async (existing: string) => {
      if (generate.mock.calls.length === 1)
        fs.writeFileSync(file, '# Memory\n- Manual correction\n');
      return `${existing}- New decision`;
    });
    await updater.update(file, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(file, 'utf-8')).toContain('Manual correction');
    expect(fs.readFileSync(file, 'utf-8')).not.toContain('Old decision');
  });

  it('retries empty output and rejects heading-only replacements without losing memory', async () => {
    const content = '# Memory\n- Keep this fact\n';
    const file = memoryFile(content);
    const updater = new ProjectMemoryUpdater();
    const generate = vi.fn().mockResolvedValueOnce(null).mockResolvedValue('# Memory');
    await expect(updater.update(file, generate)).rejects.toThrow('no durable content');
    expect(generate).toHaveBeenCalledTimes(3);
    expect(fs.readFileSync(file, 'utf-8')).toBe(content);
    await updater.update(file, async (existing) => `${existing}- Recovered`);
    expect(fs.readFileSync(file, 'utf-8')).toContain('Recovered');
  });
});
