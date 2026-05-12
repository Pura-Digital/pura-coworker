import { describe, expect, it, vi } from 'vitest';

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
import type { Session } from '../src/renderer/types';

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

function buildMessage(text: string): RemoteMessage {
  return {
    id: `msg-${Math.random()}`,
    channelType: 'telegram',
    channelId: 'channel-1',
    sender: { id: 'user-1', isBot: false },
    content: { type: 'text', text },
    timestamp: Date.now(),
    isGroup: false,
    isMentioned: false,
  };
}

describe('remote cwd propagation', () => {
  it('passes updated cwd to continueSession for existing remote sessions', async () => {
    const manager = new RemoteManager();
    const continueCalls: Array<{ sessionId: string; prompt: string; cwd?: string }> = [];

    manager.setAgentExecutor({
      startSession: async () => stubSession('session-1'),
      continueSession: async (sessionId, prompt, _content, cwd) => {
        continueCalls.push({ sessionId, prompt, cwd });
      },
      stopSession: async () => {},
    });

    const router = getMessageRouter(manager);
    await router.routeMessage(buildMessage('hello'));
    await router.routeMessage(buildMessage('[cwd: C:\\\\workspace] run tests'));

    expect(continueCalls).toHaveLength(1);
    expect(continueCalls[0]).toEqual({
      sessionId: 'session-1',
      prompt: 'run tests',
      cwd: 'C:\\\\workspace',
    });
  });
});
