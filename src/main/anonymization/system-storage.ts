import { execFile } from 'node:child_process';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { app } from 'electron';

async function keychainHelper(signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error('System storage authorization cancelled'));
  const directory = app.isPackaged
    ? path.join(process.resourcesPath, 'anonymization')
    : path.join(process.cwd(), '.bundle-resources/anonymization', `darwin-${process.arch}`);
  const requestDirectory = await mkdtemp(path.join(tmpdir(), 'aiden-keychain-'));
  const resultFile = path.join(requestDirectory, 'result.json');
  try {
    if (signal?.aborted) throw new Error('System storage authorization cancelled');
    await new Promise<void>((resolve, reject) => {
      execFile(
        '/usr/bin/open',
        [
          '-n',
          '-W',
          path.join(directory, 'Aiden Keychain Access.app'),
          '--args',
          '--authorize',
          resultFile,
        ],
        {
          signal,
          maxBuffer: 4096,
          // A system password dialog can legitimately wait for a human. Cancellation
          // remains available in Aiden; there is no automatic authorization retry.
        },
        (error) => {
          if (error) {
            reject(new Error('System storage authorization unavailable or declined'));
            return;
          }
          resolve();
        }
      );
    });
    if (signal?.aborted) throw new Error('System storage authorization cancelled');
    return await readFile(resultFile, 'utf8');
  } finally {
    await rm(requestDirectory, { recursive: true, force: true });
  }
}

export async function requestSystemStorageAccess(
  signal?: AbortSignal,
  platform: NodeJS.Platform = process.platform
): Promise<void> {
  if (signal?.aborted) throw new Error('System storage authorization cancelled');
  // Windows safeStorage uses DPAPI in the signed-in user's context. There is no
  // separate Keychain-style consent or password to request from the user.
  if (platform !== 'darwin') return;
  const result = JSON.parse(await keychainHelper(signal));
  if (result.unlocked !== true) throw new Error('System storage authorization failed');
}

export function restartAppForSystemStorage(): void {
  app.relaunch();
  app.quit();
}

export async function openSystemStorageSettings(
  platform: NodeJS.Platform = process.platform
): Promise<void> {
  if (platform !== 'darwin') return;
  await new Promise<void>((resolve, reject) => {
    execFile('/usr/bin/open', ['-b', 'com.apple.keychainaccess'], (error) => {
      if (error) reject(new Error('System Keychain settings unavailable'));
      else resolve();
    });
  });
}
