import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
}));
const updater = Object.assign(new EventEmitter(), mocks);
vi.mock('electron', () => ({ app: { isPackaged: true, getVersion: () => '3.5.0' } }));
vi.mock('electron-updater', () => ({ autoUpdater: updater }));
vi.mock('../src/main/utils/logger', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

const { AutoUpdaterManager } = await import('../src/main/update/auto-updater-manager');

describe('system menu update actions', () => {
  let manager: InstanceType<typeof AutoUpdaterManager>;
  let send: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    updater.removeAllListeners();
    mocks.checkForUpdates.mockImplementation(async () => {
      updater.emit('checking-for-update');
    });
    manager = new AutoUpdaterManager();
    send = vi.fn();
    manager.configure({ sendToRenderer: send, refreshMenus: vi.fn() });
    await manager.initialize(false);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('marks manual checks for toast visibility while keeping startup checks silent', () => {
    expect(manager.getSnapshot()).toMatchObject({ phase: 'checking', userInitiated: false });
    manager.handleMenuAction();
    expect(manager.getSnapshot()).toMatchObject({ phase: 'checking', userInitiated: true });
    updater.emit('update-not-available');
    expect(manager.getSnapshot()).toMatchObject({ phase: 'up-to-date' });
  });

  it('reopens the ready toast from the menu and installs only via the toast action', () => {
    updater.emit('update-downloaded', { version: '3.5.1' });
    send.mockClear();
    manager.handleMenuAction();
    expect(send).toHaveBeenCalledWith({
      type: 'updater.status',
      payload: expect.objectContaining({ phase: 'downloaded', version: '3.5.1', userInitiated: true }),
    });
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
    manager.quitAndInstall();
    expect(mocks.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('starts downloading from the menu after an update is available', () => {
    updater.emit('update-available', { version: '3.5.1' });
    manager.handleMenuAction();
    expect(manager.getSnapshot().phase).toBe('downloading');
    expect(mocks.downloadUpdate).toHaveBeenCalledOnce();
  });

  it('keeps later background checks silent after a manual check', async () => {
    manager.handleMenuAction();
    updater.emit('update-not-available');
    await manager.checkForUpdates();
    expect(manager.getSnapshot()).toMatchObject({ phase: 'checking', userInitiated: false });
  });
});
