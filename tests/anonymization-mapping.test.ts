import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { AnonymizationMappingStore } from '../src/main/anonymization/mapping-store';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('persistent encrypted matching', () => {
  it('isolates chats, survives reopening and stores no real values on disk', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aiden-pii-db-'));
    directories.push(directory);
    const filename = join(directory, 'matching.sqlite');
    const key = randomBytes(32);
    let store = new AnonymizationMappingStore(filename, key);
    const first = store.remember('chat-one', 'FULLNAME', 'Mario Rossi');
    expect(store.remember('chat-one', 'FULLNAME', 'Mario Rossi')).toBe(first);
    const second = store.remember('chat-two', 'FULLNAME', 'Mario Rossi');
    expect(second).not.toBe(first);
    expect(store.entries('chat-one').get(second)).toBeUndefined();
    expect(store.entries('chat-two').get(first)).toBeUndefined();
    store.close();
    expect(readFileSync(filename).includes(Buffer.from('Mario Rossi'))).toBe(false);
    store = new AnonymizationMappingStore(filename, key);
    expect(store.entries('chat-one').get(first)).toBe('Mario Rossi');
    store.deleteChat('chat-one');
    expect(store.entries('chat-one').size).toBe(0);
    expect(store.entries('chat-two').get(second)).toBe('Mario Rossi');
    store.close();
  });
  it('preserves exact spelling and rejects a wrong key', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aiden-pii-db-'));
    directories.push(directory);
    const filename = join(directory, 'matching.sqlite');
    const store = new AnonymizationMappingStore(filename, randomBytes(32));
    expect(store.remember('chat', 'FULLNAME', 'Mario')).not.toBe(
      store.remember('chat', 'FULLNAME', 'MARIO')
    );
    store.close();
    const wrong = new AnonymizationMappingStore(filename, randomBytes(32));
    expect(() => wrong.entries('chat')).toThrow();
    wrong.close();
  });
});
