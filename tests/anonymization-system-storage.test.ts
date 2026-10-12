import { beforeEach, describe, expect, it, vi } from 'vitest';

const child = vi.hoisted(() => ({ execFile: vi.fn() }));
const electron = vi.hoisted(() => ({
  app: { isPackaged: false, relaunch: vi.fn(), quit: vi.fn() },
}));
vi.mock('node:child_process', () => child);
vi.mock('electron', () => electron);
import {
  requestSystemStorageAccess,
  restartAppForSystemStorage,
} from '../src/main/anonymization/system-storage';

beforeEach(() => {
  child.execFile.mockReset();
  electron.app.relaunch.mockReset();
  electron.app.quit.mockReset();
});

describe('system storage authorization', () => {
  it('leaves Windows DPAPI initialization automatic without launching a password prompt', async () => {
    await requestSystemStorageAccess(undefined, 'win32');
    expect(child.execFile).not.toHaveBeenCalled();
    expect(electron.app.relaunch).not.toHaveBeenCalled();
  });

  it('requests macOS system authorization without supplying or collecting a password', async () => {
    child.execFile.mockImplementation((_file, _args, _options, callback) =>
      callback(null, '{"unlocked":true}')
    );
    await requestSystemStorageAccess(undefined, 'darwin');
    expect(child.execFile.mock.calls[0][1]).toEqual(['--authorize']);
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
    child.execFile.mockImplementation((_file, _args, _options, callback) =>
      callback(null, '{"unlocked":false}')
    );
    const controller = new AbortController();
    await expect(requestSystemStorageAccess(controller.signal, 'darwin')).rejects.toThrow(
      'System storage authorization failed'
    );
    expect(child.execFile.mock.calls[0][2].signal).toBe(controller.signal);
  });

  it('relaunches before quitting only when recovery is explicitly invoked', () => {
    restartAppForSystemStorage();
    expect(electron.app.relaunch.mock.invocationCallOrder[0]).toBeLessThan(
      electron.app.quit.mock.invocationCallOrder[0]
    );
  });
});
