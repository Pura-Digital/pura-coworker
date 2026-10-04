import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ exposeInMainWorld: vi.fn() }));
const ipc = new EventEmitter();
vi.mock('electron', () => ({ contextBridge: bridge, ipcRenderer: ipc }));

describe('preload event subscriptions', () => {
  it('delivers history alongside updater events and cleans up only the owning subscriber', async () => {
    await import('../src/preload/index');
    const api = bridge.exposeInMainWorld.mock.calls[0][1];
    const chat = vi.fn();
    const updater = vi.fn();
    const closeChat = api.on(chat);
    const closeUpdater = api.on(updater);
    const history = { type: 'session.list', payload: { sessions: [{ id: 'saved' }] } };
    ipc.emit('server-event', {}, history);
    expect(chat).toHaveBeenCalledWith(history);
    expect(updater).toHaveBeenCalledWith(history);
    closeUpdater();
    ipc.emit('server-event', {}, history);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(updater).toHaveBeenCalledTimes(1);
    closeUpdater();
    expect(ipc.listenerCount('server-event')).toBe(1);
    closeChat();
    expect(ipc.listenerCount('server-event')).toBe(0);
  });
});
