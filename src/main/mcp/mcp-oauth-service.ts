import { shell } from 'electron';
import {
  auth,
  type OAuthClientProvider,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type { MCPServerConfig } from './mcp-manager';
import { createMcpOAuthProvider } from './mcp-oauth-provider';
import { getMcpOAuthStore } from './mcp-oauth-store';
import {
  parseMcpOAuthCallbackUrl,
  validateMcpOAuthCallbackParams,
} from './mcp-oauth-deep-link';
import { log, logError, logWarn } from '../utils/logger';

export type McpOAuthPrepareResult =
  | { status: 'authorized' }
  | { status: 'auth-required'; authorizationUrl?: string }
  | { status: 'error'; error: string };

export class McpOAuthService {
  private pendingServerIds = new Set<string>();

  getProvider(serverId: string, config: MCPServerConfig): OAuthClientProvider {
    return createMcpOAuthProvider({
      serverId,
      store: getMcpOAuthStore(),
      oauthConfig: config.oauth ?? { registrationStrategy: 'auto' },
      onRedirect: (url) => {
        getMcpOAuthStore().saveAuthorizationUrl(serverId, url.toString());
      },
    });
  }

  /**
   * Prepare OAuth flow without opening browser (explicit UI trigger required).
   * Runs SDK discovery/registration and stores authorization URL if redirect needed.
   */
  async prepareAuth(config: MCPServerConfig): Promise<McpOAuthPrepareResult> {
    if (config.authType !== 'oauth' || !config.url) {
      return { status: 'error', error: 'Server is not configured for OAuth' };
    }

    const serverId = config.id;
    if (this.pendingServerIds.has(serverId)) {
      const existingUrl = getMcpOAuthStore().getAuthorizationUrl(serverId);
      return { status: 'auth-required', authorizationUrl: existingUrl };
    }

    this.pendingServerIds.add(serverId);

    try {
      const provider = this.getProvider(serverId, config);
      const result = await auth(provider, {
        serverUrl: config.url,
        scope: config.oauth?.scope,
      });

      if (result === 'AUTHORIZED') {
        this.pendingServerIds.delete(serverId);
        return { status: 'authorized' };
      }

      const authorizationUrl = getMcpOAuthStore().getAuthorizationUrl(serverId);
      return { status: 'auth-required', authorizationUrl };
    } catch (error) {
      this.pendingServerIds.delete(serverId);
      const message = error instanceof Error ? error.message : String(error);
      logError(`[McpOAuthService] prepareAuth failed for ${config.name}:`, message);
      return { status: 'error', error: message };
    }
  }

  /** Open stored authorization URL in system browser (explicit user action). */
  async startOAuth(serverId: string): Promise<{ success: boolean; error?: string }> {
    const authorizationUrl = getMcpOAuthStore().getAuthorizationUrl(serverId);
    if (!authorizationUrl) {
      return { success: false, error: 'No authorization URL prepared for this server' };
    }

    try {
      const parsed = new URL(authorizationUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { success: false, error: 'Invalid authorization URL protocol' };
      }
      await shell.openExternal(authorizationUrl);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Complete OAuth callback: validate state, exchange code for tokens via SDK auth().
   */
  async handleCallbackUrl(
    callbackUrl: string,
    config: MCPServerConfig
  ): Promise<{ success: boolean; error?: string }> {
    const params = parseMcpOAuthCallbackUrl(callbackUrl);
    if (!params) {
      return { success: false, error: 'Not an MCP OAuth callback URL' };
    }

    const store = getMcpOAuthStore();
    const serverId = params.state ? store.getServerIdByState(params.state) : undefined;
    if (!serverId || serverId !== config.id) {
      return { success: false, error: 'OAuth callback state does not match any pending session' };
    }

    const session = store.getDiscovery(config.id);
    const expectedState = params.state;
    const validation = validateMcpOAuthCallbackParams(params, expectedState);
    if (!validation.ok) {
      logWarn(`[McpOAuthService] Callback validation failed: ${validation.error}`);
      return { success: false, error: validation.error };
    }

    try {
      const provider = this.getProvider(serverId, config);
      const result = await auth(provider, {
        serverUrl: config.url!,
        authorizationCode: validation.code,
        scope: config.oauth?.scope,
        resourceMetadataUrl: session?.resourceMetadataUrl
          ? new URL(session.resourceMetadataUrl)
          : undefined,
      });

      this.pendingServerIds.delete(serverId);

      if (result !== 'AUTHORIZED') {
        return { success: false, error: 'Token exchange did not complete authorization' };
      }

      log(`[McpOAuthService] OAuth completed for server ${config.name}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`[McpOAuthService] Token exchange failed for ${config.name}:`, message);
      store.invalidate(serverId, 'verifier');
      return { success: false, error: message };
    }
  }

  async disconnectOAuth(serverId: string): Promise<void> {
    getMcpOAuthStore().clearServer(serverId);
    this.pendingServerIds.delete(serverId);
  }

  hasValidTokens(serverId: string): boolean {
    const tokens = getMcpOAuthStore().getTokens(serverId);
    return Boolean(tokens?.access_token?.trim());
  }
}

let singletonService: McpOAuthService | null = null;

export function getMcpOAuthService(): McpOAuthService {
  if (!singletonService) {
    singletonService = new McpOAuthService();
  }
  return singletonService;
}
