import crypto from 'crypto';
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { McpOAuthConfig } from '../../shared/mcp-oauth';
import { MCP_OAUTH_REDIRECT_URI } from '../../shared/mcp-oauth';
import type { McpOAuthStore } from './mcp-oauth-store';

export interface CreateMcpOAuthProviderOptions {
  serverId: string;
  store: McpOAuthStore;
  oauthConfig: McpOAuthConfig;
  /** Called when authorization URL is ready; may defer browser open for explicit UI flow. */
  onRedirect?: (url: URL) => void;
}

export function createMcpOAuthProvider(
  options: CreateMcpOAuthProviderOptions
): OAuthClientProvider {
  const { serverId, store, oauthConfig, onRedirect } = options;

  const clientMetadata: OAuthClientMetadata = {
    client_name: 'Aiden',
    redirect_uris: [MCP_OAUTH_REDIRECT_URI],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    ...(oauthConfig.scope ? { scope: oauthConfig.scope } : {}),
  };

  const provider: OAuthClientProvider = {
    get redirectUrl() {
      return MCP_OAUTH_REDIRECT_URI;
    },

    get clientMetadata() {
      return clientMetadata;
    },

    clientInformation(): OAuthClientInformationMixed | undefined {
      const stored = store.getClientInfo(serverId);
      if (stored) {
        return stored;
      }
      if (
        oauthConfig.registrationStrategy === 'client_id' &&
        oauthConfig.clientId?.trim()
      ) {
        return { client_id: oauthConfig.clientId.trim() };
      }
      return undefined;
    },

    saveClientInformation(info: OAuthClientInformationMixed): void {
      store.saveClientInfo(serverId, info);
    },

    tokens(): OAuthTokens | undefined {
      return store.getTokens(serverId);
    },

    saveTokens(tokens: OAuthTokens): void {
      store.saveTokens(serverId, tokens);
    },

    state(): string {
      const state = crypto.randomUUID();
      store.savePendingState(serverId, state);
      return state;
    },

    saveDiscoveryState(discovery: OAuthDiscoveryState): void {
      store.saveDiscovery(serverId, discovery);
    },

    discoveryState(): OAuthDiscoveryState | undefined {
      return store.getDiscovery(serverId);
    },

    redirectToAuthorization(authorizationUrl: URL): void {
      store.saveAuthorizationUrl(serverId, authorizationUrl.toString());
      onRedirect?.(authorizationUrl);
    },

    saveCodeVerifier(codeVerifier: string): void {
      store.saveCodeVerifier(serverId, codeVerifier);
    },

    codeVerifier(): string {
      const verifier = store.getCodeVerifier(serverId);
      if (!verifier) {
        throw new Error('PKCE code verifier missing for MCP OAuth session');
      }
      return verifier;
    },

    invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
      store.invalidate(serverId, scope);
    },
  };

  if (
    oauthConfig.registrationStrategy === 'client_metadata_url' &&
    oauthConfig.clientMetadataUrl?.trim()
  ) {
    provider.clientMetadataUrl = oauthConfig.clientMetadataUrl.trim();
  }

  return provider;
}
