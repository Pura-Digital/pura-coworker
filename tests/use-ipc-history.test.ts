import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  state: {
    setSessions: vi.fn(),
    setSystemDarkMode: vi.fn(),
    setIsConfigured: vi.fn(),
    setAppConfig: vi.fn(),
    setSettings: vi.fn(),
    markInitialConfigStatusSeen: vi.fn(),
  },
  on: vi.fn(),
  cleanup: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => mocks.effects.push(effect),
  useCallback: (callback: unknown) => callback,
}));
vi.mock('../src/renderer/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  ),
}));
vi.mock('../src/renderer/i18n/config', () => ({ default: { t: (key: string) => key } }));

describe('session history and IPC subscription ownership', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.effects.length = 0;
    mocks.on.mockReturnValue(mocks.cleanup);
    vi.stubGlobal('window', {
      electronAPI: {
        on: mocks.on,
        invoke: mocks.invoke,
        config: {
          get: vi.fn().mockResolvedValue({}),
          isConfigured: vi.fn().mockResolvedValue(true),
        },
        getSystemTheme: vi.fn().mockResolvedValue({ shouldUseDarkColors: false }),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps the app listener when action-only child views mount and unmount', async () => {
    const { useIPC } = await import('../src/renderer/hooks/useIPC');
    useIPC(true);
    const cleanupApp = mocks.effects.pop()!();
    useIPC();
    const cleanupChild = mocks.effects.pop()!();
    expect(cleanupChild).toBeUndefined();
    expect(mocks.on).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    if (cleanupApp) cleanupApp();
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it('restores saved history even when no session.list event is delivered', async () => {
    const sessions = [{ id: 'saved-chat', title: 'Saved chat' }];
    mocks.invoke.mockResolvedValue(sessions);
    const { useIPC } = await import('../src/renderer/hooks/useIPC');
    await useIPC().listSessions();
    expect(mocks.invoke).toHaveBeenCalledWith({ type: 'session.list', payload: {} });
    expect(mocks.state.setSessions).toHaveBeenCalledWith(sessions);
  });

  it('preserves existing history when loading fails', async () => {
    mocks.invoke.mockRejectedValue(new Error('Database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useIPC } = await import('../src/renderer/hooks/useIPC');
    await useIPC().listSessions();
    expect(mocks.state.setSessions).not.toHaveBeenCalled();
  });
});
