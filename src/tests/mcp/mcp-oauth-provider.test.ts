import { describe, expect, it, vi } from 'vitest';
import { MCP_OAUTH_REDIRECT_URI } from '../../shared/mcp-oauth';
import { createMcpOAuthProvider } from '../../main/mcp/mcp-oauth-provider';
import type { McpOAuthStore } from '../../main/mcp/mcp-oauth-store';

function createMockStore(): McpOAuthStore {
  const sessions = new Map<
    string,
    {
      tokens?: { access_token: string; token_type: string };
      clientInfo?: { client_id: string };
      codeVerifier?: string;
      discovery?: { authorizationServerUrl: string };
      authorizationUrl?: string;
      oauthState?: string;
    }
  >();
  const stateIndex = new Map<string, string>();

  return {
    getTokens: (id: string) => sessions.get(id)?.tokens,
    saveTokens: (id: string, tokens: { access_token: string; token_type: string }) => {
      const s = sessions.get(id) ?? {};
      sessions.set(id, { ...s, tokens });
    },
    getClientInfo: (id: string) => sessions.get(id)?.clientInfo,
    saveClientInfo: (id: string, info: { client_id: string }) => {
      const s = sessions.get(id) ?? {};
      sessions.set(id, { ...s, clientInfo: info });
    },
    getCodeVerifier: (id: string) => sessions.get(id)?.codeVerifier,
    saveCodeVerifier: (id: string, verifier: string) => {
      const s = sessions.get(id) ?? {};
      sessions.set(id, { ...s, codeVerifier: verifier });
    },
    getDiscovery: (id: string) => sessions.get(id)?.discovery,
    saveDiscovery: (id: string, discovery: { authorizationServerUrl: string }) => {
      const s = sessions.get(id) ?? {};
      sessions.set(id, { ...s, discovery });
    },
    savePendingState: (id: string, state: string) => {
      const s = sessions.get(id) ?? {};
      for (const [st, sid] of stateIndex.entries()) {
        if (sid === id) stateIndex.delete(st);
      }
      stateIndex.set(state, id);
      sessions.set(id, { ...s, oauthState: state });
    },
    getServerIdByState: (state: string) => stateIndex.get(state),
    saveAuthorizationUrl: (id: string, url: string) => {
      const s = sessions.get(id) ?? {};
      sessions.set(id, { ...s, authorizationUrl: url });
    },
    getAuthorizationUrl: (id: string) => sessions.get(id)?.authorizationUrl,
    invalidate: vi.fn(),
    clearServer: vi.fn(),
  } as unknown as McpOAuthStore;
}

describe('createMcpOAuthProvider', () => {
  it('uses desktop client metadata with fixed redirect URI', () => {
    const store = createMockStore();
    const provider = createMcpOAuthProvider({
      serverId: 'srv-1',
      store,
      oauthConfig: { registrationStrategy: 'auto' },
    });

    expect(String(provider.redirectUrl)).toBe(MCP_OAUTH_REDIRECT_URI);
    expect(provider.clientMetadata.client_name).toBe('Aiden');
    expect(provider.clientMetadata.redirect_uris).toEqual([MCP_OAUTH_REDIRECT_URI]);
    expect(provider.clientMetadata.token_endpoint_auth_method).toBe('none');
  });

  it('persists tokens, verifier, and discovery through the store', async () => {
    const store = createMockStore();
    const provider = createMcpOAuthProvider({
      serverId: 'srv-1',
      store,
      oauthConfig: { registrationStrategy: 'auto' },
    });

    await provider.saveTokens({ access_token: 'abc', token_type: 'Bearer' });
    await provider.saveCodeVerifier('verifier-xyz');
    await provider.saveDiscoveryState?.({ authorizationServerUrl: 'https://auth.example.com' });

    expect(store.getTokens('srv-1')).toEqual({ access_token: 'abc', token_type: 'Bearer' });
    expect(await provider.codeVerifier()).toBe('verifier-xyz');
    expect(await provider.discoveryState?.()).toEqual({
      authorizationServerUrl: 'https://auth.example.com',
    });
  });

  it('uses pre-registered public client ID when configured', () => {
    const store = createMockStore();
    store.saveClientInfo('srv-1', { client_id: 'public-client-123' });

    const provider = createMcpOAuthProvider({
      serverId: 'srv-1',
      store,
      oauthConfig: {
        registrationStrategy: 'client_id',
        clientId: 'public-client-123',
      },
    });

    expect(provider.clientInformation()).toEqual({ client_id: 'public-client-123' });
  });

  it('exposes client metadata URL for CIMD strategy', () => {
    const store = createMockStore();
    const metadataUrl = 'https://example.com/.well-known/oauth-client/aiden.json';

    const provider = createMcpOAuthProvider({
      serverId: 'srv-1',
      store,
      oauthConfig: {
        registrationStrategy: 'client_metadata_url',
        clientMetadataUrl: metadataUrl,
      },
    });

    expect(provider.clientMetadataUrl).toBe(metadataUrl);
  });

  it('records authorization URL without opening browser when redirect is deferred', async () => {
    const store = createMockStore();
    const provider = createMcpOAuthProvider({
      serverId: 'srv-1',
      store,
      oauthConfig: { registrationStrategy: 'auto' },
      onRedirect: () => {
        /* deferred — browser opened only via explicit startOAuth */
      },
    });

    const authUrl = new URL('https://auth.example.com/authorize?state=test');
    await provider.redirectToAuthorization(authUrl);

    expect(store.getAuthorizationUrl('srv-1')).toBe(authUrl.toString());
  });
});
