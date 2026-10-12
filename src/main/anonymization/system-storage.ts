import { execFile } from 'node:child_process';
import path from 'node:path';
import { app } from 'electron';

function keychainHelper(args: string[], signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error('System storage authorization cancelled'));
  const directory = app.isPackaged
    ? path.join(process.resourcesPath, 'anonymization')
    : path.join(process.cwd(), '.bundle-resources/anonymization', `darwin-${process.arch}`);
  return new Promise<string>((resolve, reject) => {
    execFile(
      path.join(directory, 'aiden-keychain-access'),
      args,
      {
        signal,
        maxBuffer: 4096,
        // A system password dialog can legitimately wait for a human. Cancellation
        // remains available in Aiden; there is no automatic authorization retry.
      },
      (error, stdout) => {
        if (error) {
          reject(new Error('System storage authorization unavailable or declined'));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

export async function requestSystemStorageAccess(
  signal?: AbortSignal,
  platform: NodeJS.Platform = process.platform
): Promise<void> {
  if (signal?.aborted) throw new Error('System storage authorization cancelled');
  // Windows safeStorage uses DPAPI in the signed-in user's context. There is no
  // separate Keychain-style consent or password to request from the user.
  if (platform !== 'darwin') return;
  const result = JSON.parse(await keychainHelper(['--authorize'], signal));
  if (result.unlocked !== true) throw new Error('System storage authorization failed');
}

export function restartAppForSystemStorage(): void {
  app.relaunch();
  app.quit();
}
