import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const registeredChannels: Array<{ type: string }> = [];
  const gatewayStart = vi.fn(async () => {});

  class MockGateway {
    public running = true;
    start = gatewayStart;
    stop = vi.fn(async () => {});
    on = vi.fn();
    setMessageInterceptor = vi.fn();
    registerChannel = vi.fn((channel: { type: string }) => {
      registeredChannels.push(channel);
    });
    getStatus = vi.fn(() => ({
      running: true,
      channels: registeredChannels.map((channel) => ({
        type: channel.type,
        connected: true,
      })),
      activeSessions: 0,
      pendingPairings: 0,
    }));
  }

  class MockTelegramChannel {
    readonly type = 'telegram';
    readonly connected = true;
    start = vi.fn(async () => {});
    stop = vi.fn(async () => {});
    send = vi.fn(async () => {});
    onMessage = vi.fn();
    onError = vi.fn();
  }

  class MockSlackChannel {
    readonly type = 'slack';
  }

  return {
    gatewayStart,
    registeredChannels,
    MockGateway,
    MockTelegramChannel,
    MockSlackChannel,
  };
});

vi.mock('../src/main/utils/logger', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../src/main/remote/gateway', () => ({
  RemoteGateway: mocks.MockGateway,
}));

vi.mock('../src/main/remote/remote-config-store', () => ({
  remoteConfigStore: {
    getAll: vi.fn(() => ({
      gateway: {
        enabled: true,
        port: 18789,
        bind: '127.0.0.1',
        auth: { mode: 'allowlist', allowlist: [] },
        autoApproveSafeTools: false,
        defaultWorkingDirectory: '',
      },
      channels: {
        telegram: {
          type: 'telegram',
          botToken: '123456:test-token',
          dm: { policy: 'pairing' },
        },
      },
    })),
    getPairedUsers: vi.fn(() => []),
  },
}));

vi.mock('../src/main/remote/tunnel-manager', () => ({
  tunnelManager: {
    start: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn(() => ({ connected: false })),
    getWebhookUrl: vi.fn(() => null),
  },
  TunnelStatus: {},
}));

vi.mock('../src/main/remote/channels/telegram', () => ({
  TelegramChannel: mocks.MockTelegramChannel,
}));

vi.mock('../src/main/remote/channels/slack', () => ({
  SlackChannel: mocks.MockSlackChannel,
}));

vi.mock('../src/main/remote/message-router', () => ({
  MessageRouter: class {
    onResponse = vi.fn();
    setAgentCallback = vi.fn();
    setWorkingDirectoryValidator = vi.fn();
    setDefaultWorkingDirectory = vi.fn();
    getActiveSessionCount = vi.fn(() => 0);
    getAllSessionMappings = vi.fn(() => []);
    clearSession = vi.fn(() => false);
  },
}));

describe('RemoteManager Telegram channel registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registeredChannels.length = 0;
  });

  it('registers Telegram when a bot token is configured', async () => {
    const { RemoteManager } = await import('../src/main/remote/remote-manager');
    const manager = new RemoteManager();

    await manager.start();

    expect(mocks.gatewayStart).toHaveBeenCalledTimes(1);
    expect(mocks.registeredChannels.map((channel) => channel.type)).toEqual(['telegram']);
    expect(manager.getStatus().channels).toEqual([{ type: 'telegram', connected: true }]);
  });
});
