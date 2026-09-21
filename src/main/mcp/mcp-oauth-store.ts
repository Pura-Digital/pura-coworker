import Store from 'electron-store';
import type { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { log, logWarn } from '../utils/logger';
import {
  createEncryptedStoreWithKeyRotation,
  getLegacyDerivedKeyHexes,
} from '../utils/store-encryption';

interface McpOAuthSession {
  tokens?: OAuthTokens;
  clientInfo?: OAuthClientInformationMixed;
  codeVerifier?: string;
  oauthState?: string;
  discovery?: OAuthDiscoveryState;
  authorizationUrl?: string;
}

type McpOAuthStoreData = {
  sessions: Record<string, McpOAuthSession>;
  /** Reverse index: oauth state -> serverId */
  stateIndex: Record<string, string>;
} & Record<string, unknown>;

const DEFAULTS: McpOAuthStoreData = {
  sessions: {},
  stateIndex: {},
};

export class McpOAuthStore {
  private store: Store<McpOAuthStoreData>;

  constructor() {
    type StoreRecord = McpOAuthStoreData & Record<string, unknown>;
    this.store = createEncryptedStoreWithKeyRotation<StoreRecord>({
      stableKey: 'aiden-mcp-oauth-stable-v1',
      legacyKeys: [
        'aiden-mcp-oauth-v1',
        ...getLegacyDerivedKeyHexes({
          moduleDirname: __dirname,
          stableSeed: 'aiden-mcp-oauth-stable-v1',
          legacySeed: 'aiden-mcp-oauth-v1',
          salt: 'aiden-mcp-oauth-salt',
        }),
      ],
      storeOptions: {
        name: 'mcp-oauth',
        projectName: 'aiden',
        defaults: DEFAULTS,
      },
      logPrefix: '[McpOAuthStore]',
      log,
      warn: logWarn,
    }) as unknown as Store<McpOAuthStoreData>;
  }

  private getSession(serverId: string): McpOAuthSession {
    const sessions = this.store.get('sessions', {});
    return sessions[serverId] ?? {};
  }

  private setSession(serverId: string, session: McpOAuthSession): void {
    const sessions = { ...this.store.get('sessions', {}) };
    if (Object.keys(session).length === 0) {
      delete sessions[serverId];
    } else {
      sessions[serverId] = session;
    }
    this.store.set('sessions', sessions);
  }

  getTokens(serverId: string): OAuthTokens | undefined {
    return this.getSession(serverId).tokens;
  }

  saveTokens(serverId: string, tokens: OAuthTokens): void {
    const session = this.getSession(serverId);
    this.setSession(serverId, { ...session, tokens });
  }

  getClientInfo(serverId: string): OAuthClientInformationMixed | undefined {
    return this.getSession(serverId).clientInfo;
  }

  saveClientInfo(serverId: string, info: OAuthClientInformationMixed): void {
    const session = this.getSession(serverId);
    this.setSession(serverId, { ...session, clientInfo: info });
  }

  getCodeVerifier(serverId: string): string | undefined {
    return this.getSession(serverId).codeVerifier;
  }

  saveCodeVerifier(serverId: string, verifier: string): void {
    const session = this.getSession(serverId);
    this.setSession(serverId, { ...session, codeVerifier: verifier });
  }

  getDiscovery(serverId: string): OAuthDiscoveryState | undefined {
    return this.getSession(serverId).discovery;
  }

  saveDiscovery(serverId: string, discovery: OAuthDiscoveryState): void {
    const session = this.getSession(serverId);
    this.setSession(serverId, { ...session, discovery });
  }

  savePendingState(serverId: string, state: string): void {
    const session = this.getSession(serverId);
    const stateIndex = { ...this.store.get('stateIndex', {}) };

    // Remove old state mapping for this server if any
    for (const [existingState, mappedServerId] of Object.entries(stateIndex)) {
      if (mappedServerId === serverId) {
        delete stateIndex[existingState];
      }
    }

    stateIndex[state] = serverId;
    this.store.set('stateIndex', stateIndex);
    this.setSession(serverId, { ...session, oauthState: state });
  }

  getServerIdByState(state: string): string | undefined {
    return this.store.get('stateIndex', {})[state];
  }

  saveAuthorizationUrl(serverId: string, url: string): void {
    const session = this.getSession(serverId);
    this.setSession(serverId, { ...session, authorizationUrl: url });
  }

  getAuthorizationUrl(serverId: string): string | undefined {
    return this.getSession(serverId).authorizationUrl;
  }

  invalidate(
    serverId: string,
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'
  ): void {
    const session = { ...this.getSession(serverId) };
    const stateIndex = { ...this.store.get('stateIndex', {}) };

    if (scope === 'all' || scope === 'tokens') {
      delete session.tokens;
    }
    if (scope === 'all' || scope === 'client') {
      delete session.clientInfo;
    }
    if (scope === 'all' || scope === 'verifier') {
      delete session.codeVerifier;
    }
    if (scope === 'all' || scope === 'discovery') {
      delete session.discovery;
    }
    if (scope === 'all') {
      delete session.authorizationUrl;
      delete session.oauthState;
      for (const [state, mappedServerId] of Object.entries(stateIndex)) {
        if (mappedServerId === serverId) {
          delete stateIndex[state];
        }
      }
      this.store.set('stateIndex', stateIndex);
    }

    this.setSession(serverId, session);
  }

  clearServer(serverId: string): void {
    this.invalidate(serverId, 'all');
    this.setSession(serverId, {});
  }
}

let singletonStore: McpOAuthStore | null = null;

/** Singleton used by main process OAuth flow. */
export function getMcpOAuthStore(): McpOAuthStore {
  if (!singletonStore) {
    singletonStore = new McpOAuthStore();
  }
  return singletonStore;
}
