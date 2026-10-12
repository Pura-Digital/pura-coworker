import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const child = vi.hoisted(() => ({ execFile: vi.fn() }));
const electron = vi.hoisted(() => ({
  app: { isPackaged: false, relaunch: vi.fn(), quit: vi.fn() },
}));
vi.mock('node:child_process', () => child);
vi.mock('electron', () => electron);
import {
  openSystemStorageSettings,
  requestSystemStorageAccess,
  restartAppForSystemStorage,
} from '../src/main/anonymization/system-storage';

beforeEach(() => {
  child.execFile.mockReset();
  electron.app.relaunch.mockReset();
  electron.app.quit.mockReset();
});

describe('system storage authorization', () => {
  it('opens macOS Keychain recovery from Aiden without collecting credentials', async () => {
    child.execFile.mockImplementation((_file, _args, callback) => callback(null));
    await openSystemStorageSettings('darwin');
    expect(child.execFile.mock.calls[0].slice(0, 2)).toEqual([
      '/usr/bin/open',
      ['-b', 'com.apple.keychainaccess'],
    ]);
    child.execFile.mockClear();
    await openSystemStorageSettings('win32');
    expect(child.execFile).not.toHaveBeenCalled();
  });
  it('leaves Windows DPAPI initialization automatic without launching a password prompt', async () => {
    await requestSystemStorageAccess(undefined, 'win32');
    expect(child.execFile).not.toHaveBeenCalled();
    expect(electron.app.relaunch).not.toHaveBeenCalled();
  });

  it('requests macOS system authorization without supplying or collecting a password', async () => {
    child.execFile.mockImplementation((_file, args, _options, callback) => {
      writeFileSync(args.at(-1), '{"unlocked":true}');
      callback(null);
    });
    await requestSystemStorageAccess(undefined, 'darwin');
    const [executable, args] = child.execFile.mock.calls[0];
    expect(executable).toBe('/usr/bin/open');
    expect(args.slice(0, 2)).toEqual(['-n', '-W']);
    expect(args[2]).toContain('Aiden Keychain Access.app');
    expect(args.slice(3, 5)).toEqual(['--args', '--authorize']);
    expect(existsSync(path.dirname(args.at(-1)))).toBe(false);
  });

  it('does not expose system error output or start an authorization process after cancellation', async () => {
    child.execFile.mockImplementation((_file, _args, _options, callback) =>
      callback(new Error('secret diagnostic'), 'secret key', 'private stderr')
    );
    await expect(requestSystemStorageAccess(undefined, 'darwin')).rejects.toThrow(
      'System storage authorization unavailable or declined'
    );
    const controller = new AbortController();
    controller.abort();
    child.execFile.mockClear();
    await expect(requestSystemStorageAccess(controller.signal, 'darwin')).rejects.toThrow(
      'cancelled'
    );
    expect(child.execFile).not.toHaveBeenCalled();
  });

  it('passes cancellation to the native process and validates its authorization response', async () => {
    child.execFile.mockImplementation((_file, args, _options, callback) => {
      writeFileSync(args.at(-1), '{"unlocked":false}');
      callback(null);
    });
    const controller = new AbortController();
    await expect(requestSystemStorageAccess(controller.signal, 'darwin')).rejects.toThrow(
      'System storage authorization failed'
    );
    expect(child.execFile.mock.calls[0][2].signal).toBe(controller.signal);
  });

  it('cancels the launcher and revokes the launched helper request while a system dialog is pending', async () => {
    child.execFile.mockImplementation((_file, _args, options, callback) => {
      options.signal.addEventListener('abort', () => callback(new Error('aborted')));
    });
    const controller = new AbortController();
    const request = requestSystemStorageAccess(controller.signal, 'darwin');
    const rejection = expect(request).rejects.toThrow('unavailable or declined');
    await vi.waitFor(() => expect(child.execFile).toHaveBeenCalledTimes(1));
    const directory = path.dirname(child.execFile.mock.calls[0][1].at(-1));
    expect(existsSync(directory)).toBe(true);
    controller.abort();
    await rejection;
    expect(existsSync(directory)).toBe(false);
  });

  it('relaunches before quitting only when recovery is explicitly invoked', () => {
    restartAppForSystemStorage();
    expect(electron.app.relaunch.mock.invocationCallOrder[0]).toBeLessThan(
      electron.app.quit.mock.invocationCallOrder[0]
    );
  });
});
