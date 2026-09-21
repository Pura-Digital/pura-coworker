import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  seed: {} as Record<string, unknown>,
}));

vi.mock('electron-store', () => {
  class MockStore<T extends Record<string, unknown>> {
    public store: Record<string, unknown>;
    public path = '/tmp/mock-mcp-oauth-store.json';

    constructor(options: { defaults?: Record<string, unknown> }) {
      this.store = {
        ...(options?.defaults || {}),
        ...mocks.seed,
      };
    }

    get<K extends keyof T>(key: K): T[K] {
      return this.store[key as string] as T[K];
    }

    set(key: string | Record<string, unknown>, value?: unknown): void {
      if (typeof key === 'string') {
        this.store[key] = value;
        return;
      }
      this.store = {
        ...this.store,
        ...key,
      };
    }

    clear(): void {
      this.store = {};
    }
  }

  return { default: MockStore };
});

vi.mock('../../main/utils/store-encryption', async () => {
  const { default: MockStore } = await import('electron-store');
  return {
    createEncryptedStoreWithKeyRotation: <T extends Record<string, unknown>>(options: {
      storeOptions: { defaults?: T };
    }) => new MockStore(options.storeOptions),
    getLegacyDerivedKeyHexes: () => [],
  };
});

vi.mock('../../main/utils/logger', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { McpOAuthStore } from '../../main/mcp/mcp-oauth-store';

describe('McpOAuthStore', () => {
  let store: McpOAuthStore;

  beforeEach(() => {
    mocks.seed = {};
    store = new McpOAuthStore();
  });

  it('isolates sessions per serverId', () => {
    store.saveTokens('server-a', { access_token: 'token-a', token_type: 'Bearer' });
    store.saveTokens('server-b', { access_token: 'token-b', token_type: 'Bearer' });

    expect(store.getTokens('server-a')?.access_token).toBe('token-a');
    expect(store.getTokens('server-b')?.access_token).toBe('token-b');
  });

  it('maps oauth state to serverId for callback lookup', () => {
    store.savePendingState('server-1', 'state-abc');
    expect(store.getServerIdByState('state-abc')).toBe('server-1');
    expect(store.getServerIdByState('unknown')).toBeUndefined();
  });

  it('invalidates tokens selectively without removing client registration', () => {
    store.saveClientInfo('server-1', { client_id: 'my-client' });
    store.saveTokens('server-1', { access_token: 'tok', token_type: 'Bearer' });
    store.saveCodeVerifier('server-1', 'verifier-123');

    store.invalidate('server-1', 'tokens');

    expect(store.getTokens('server-1')).toBeUndefined();
    expect(store.getClientInfo('server-1')).toEqual({ client_id: 'my-client' });
    expect(store.getCodeVerifier('server-1')).toBe('verifier-123');
  });

  it('removes all credentials for a server on full clear', () => {
    store.saveClientInfo('server-1', { client_id: 'my-client' });
    store.saveTokens('server-1', { access_token: 'tok', token_type: 'Bearer' });
    store.savePendingState('server-1', 'state-x');
    store.saveAuthorizationUrl('server-1', 'https://auth.example/authorize');

    store.clearServer('server-1');

    expect(store.getTokens('server-1')).toBeUndefined();
    expect(store.getClientInfo('server-1')).toBeUndefined();
    expect(store.getServerIdByState('state-x')).toBeUndefined();
    expect(store.getAuthorizationUrl('server-1')).toBeUndefined();
  });
});
