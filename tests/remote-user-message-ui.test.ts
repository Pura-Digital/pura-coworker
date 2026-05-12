import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/main/remote/remote-config-store', () => ({
  remoteConfigStore: {
    getAll: () => ({ gateway: { enabled: false }, channels: {} }),
    isEnabled: () => false,
    getPairedUsers: () => [],
  },
}));

import { RemoteManager } from '../src/main/remote/remote-manager';
import type { MessageRouter } from '../src/main/remote/message-router';
import type { RemoteMessage } from '../src/main/remote/types';
import type { ServerEvent, Session } from '../src/renderer/types';

function stubSession(id: string): Session {
  return {
    id,
    title: '',
    status: 'idle',
    mountedPaths: [],
    memoryEnabled: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function getMessageRouter(manager: RemoteManager): MessageRouter {
  return (manager as unknown as { messageRouter: MessageRouter }).messageRouter;
}

const buildMessage = (): RemoteMessage => ({
  id: 'msg-1',
  channelType: 'telegram',
  channelId: 'channel-1',
  sender: { id: 'user-1', isBot: false },
  content: { type: 'text', text: 'list the files' },
  timestamp: Date.now(),
  isGroup: false,
  isMentioned: false,
});

describe('remote user message ui', () => {
  it('emits stream.message for remote user input', async () => {
    const manager = new RemoteManager();
    const events: ServerEvent[] = [];

    manager.setRendererCallback((event) => {
      events.push(event);
    });

    manager.setAgentExecutor({
      startSession: async () => stubSession('session-1'),
      continueSession: async () => {},
      stopSession: async () => {},
    });

    const router = getMessageRouter(manager);
    await router.routeMessage(buildMessage());

    const hasUserStream = events.some(
      (event) =>
        event.type === 'stream.message' &&
        event.payload?.sessionId === 'session-1' &&
        event.payload?.message?.role === 'user'
    );

    expect(hasUserStream).toBe(true);
  });
});
