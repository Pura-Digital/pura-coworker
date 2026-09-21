import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Message } from '../src/renderer/types';
import {
  buildRecoverySnapshotFromMessages,
  clearRecoveryContext,
  getRecoveryContextPath,
  readRecoveryContext,
  writeRecoveryContext,
} from '../src/main/claude/session-recovery-context';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiden-recovery-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeMessage(role: Message['role'], text: string, id: string): Message {
  return {
    id,
    sessionId: 'session-1',
    role,
    content: [{ type: 'text', text }],
    timestamp: Date.now(),
  };
}

describe('session-recovery-context', () => {
  it('resolves recovery file path under workspace', () => {
    expect(getRecoveryContextPath('/workspace', 'abc')).toBe(
      path.join('/workspace', '.aiden/session-recovery/abc.md')
    );
  });

  it('builds a budgeted snapshot from recent messages', () => {
    const messages = [
      makeMessage('user', 'first', 'm1'),
      makeMessage('assistant', 'second', 'm2'),
      makeMessage('user', 'third', 'm3'),
    ];
    const snapshot = buildRecoverySnapshotFromMessages(messages, 80);
    expect(snapshot).toContain('<turn role="user">third</turn>');
    expect(snapshot).not.toContain('first');
  });

  it('writes, reads, and clears recovery markdown', () => {
    const cwd = makeTempDir();
    const sessionId = 'session-42';
    const messages = [makeMessage('user', 'do the thing', 'm1')];

    const filePath = writeRecoveryContext(cwd, sessionId, {
      error: '500 no user query found in messages',
      compactionSummary: 'Summarized tool loop.',
      messages,
    });

    expect(filePath).toBe(getRecoveryContextPath(cwd, sessionId));
    expect(fs.existsSync(filePath!)).toBe(true);

    const content = readRecoveryContext(cwd, sessionId);
    expect(content).toContain('# Aiden Session Recovery');
    expect(content).toContain('error: 500 no user query found in messages');
    expect(content).toContain('Summarized tool loop.');
    expect(content).toContain('<turn role="user">do the thing</turn>');

    clearRecoveryContext(cwd, sessionId);
    expect(readRecoveryContext(cwd, sessionId)).toBeNull();
  });
});
