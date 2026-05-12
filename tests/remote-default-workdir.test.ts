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

type StartSessionArgs = {
  title: string;
  prompt: string;
  cwd?: string;
};

const buildMessage = (): RemoteMessage => ({
  id: 'msg-1',
  channelType: 'telegram',
  channelId: 'channel-1',
  sender: { id: 'user-1', isBot: false },
  content: { type: 'text', text: '你好' },
  timestamp: Date.now(),
  isGroup: false,
  isMentioned: false,
});

describe('remote default working dir', () => {
  it('uses global default working dir when remote message has no cwd', async () => {
    const manager = new RemoteManager();
    const calls: StartSessionArgs[] = [];

    manager.setAgentExecutor({
      startSession: async (title, prompt, cwd) => {
        calls.push({ title, prompt, cwd });
        return stubSession('session-1');
      },
      continueSession: async () => {},
      stopSession: async () => {},
    });

    manager.setDefaultWorkingDirectory('/tmp/default_workdir');

    const router = getMessageRouter(manager);
    await router.routeMessage(buildMessage());

    expect(calls).toHaveLength(1);
    expect(calls[0]?.cwd).toBe('/tmp/default_workdir');
  });
});
