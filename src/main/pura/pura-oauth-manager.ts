import { net, shell } from 'electron';
import type { PendingAuthorization, StoredTokens } from '@pura-ai/sdk';
import { PURA_CONNECT_REDIRECT_URI } from '../../shared/pura-connect';
import { resolvePuraUserEmail } from '../../shared/pura-user-identity';
import { log, logError } from '../utils/logger';
import { getPuraClientConfig, isPuraConnectConfigured } from './pura-oauth-config';
import * as puraTokenStore from './pura-token-store';

type PendingEntry = {
  pending: PendingAuthorization;
  configSetId: string;
};

const pendingByState = new Map<string, PendingEntry>();

function buildOAuthCallbackUrl(registeredRedirectUri: string, searchParams: URLSearchParams): string {
  const base = registeredRedirectUri.split('?')[0];
  const query = searchParams.toString();
  return query ? `${base}?${query}` : base;
}

function prunePending(): void {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [state, entry] of pendingByState.entries()) {
    if (entry.pending.createdAt < cutoff) {
      pendingByState.delete(state);
    }
  }
}

async function loadSdk() {
  return import('@pura-ai/sdk');
}

export function getConnectionState(configSetId: string) {
  const tokens = puraTokenStore.getForSet(configSetId);
  return {
    configured: isPuraConnectConfigured(),
    connected: puraTokenStore.isConnected(configSetId),
    puraUserId: tokens?.pura_user_id ?? null,
    puraUserEmail: resolvePuraUserEmail(tokens),
  };
}

export async function startConnection(
  locale: 'it' | 'en',
  configSetId: string
): Promise<{ success: boolean; error?: string }> {
  prunePending();
  const config = getPuraClientConfig();
  if (!config.clientId) {
    return { success: false, error: 'Pura client ID not configured' };
  }
  if (!configSetId.trim()) {
    return { success: false, error: 'Config set id required' };
  }
  try {
    const { createAuthorization } = await loadSdk();
    const { url, pending } = await createAuthorization({
      apiBase: config.apiBase,
      clientId: config.clientId,
      redirectUri: config.redirectUri || PURA_CONNECT_REDIRECT_URI,
      locale,
    });
    pendingByState.set(pending.state, { pending, configSetId });
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    logError('[PuraOAuth] startConnection failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function completeFromCallbackUrl(callbackUrl: string): Promise<{
  tokens: StoredTokens;
  configSetId: string;
}> {
  const config = getPuraClientConfig();
  if (!config.clientId) {
    throw new Error('Pura client ID not configured');
  }
  const callback = new URL(callbackUrl);
  const state = callback.searchParams.get('state');
  if (!state) throw new Error('OAuth state missing.');
  const entry = pendingByState.get(state);
  if (!entry) throw new Error('No pending Pura connection.');
  pendingByState.delete(state);

  const { PuraOAuthClient } = await loadSdk();
  const oauth = new PuraOAuthClient({
    apiBase: config.apiBase,
    clientId: config.clientId,
    fetch: net.fetch.bind(net) as typeof fetch,
  });
  const tokens = await oauth.exchange(callbackUrl, entry.pending);
  puraTokenStore.setForSet(entry.configSetId, tokens);
  log('[PuraOAuth] Connected', { configSetId: entry.configSetId, puraUserId: tokens.pura_user_id });
  return { tokens, configSetId: entry.configSetId };
}

export async function completeFromDeepLink(deepLinkUrl: string): Promise<
  | { handled: false }
  | { handled: true; configSetId: string; tokens: StoredTokens }
> {
  const parsed = new URL(deepLinkUrl);
  const host = parsed.hostname || parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
  if (host !== 'pura-oauth') {
    return { handled: false };
  }

  const config = getPuraClientConfig();
  const callbackUrl = buildOAuthCallbackUrl(
    config.redirectUri || PURA_CONNECT_REDIRECT_URI,
    parsed.searchParams
  );
  const { tokens, configSetId } = await completeFromCallbackUrl(callbackUrl);
  return { handled: true, configSetId, tokens };
}

export function disconnect(configSetId: string): { success: boolean } {
  puraTokenStore.clearForSet(configSetId);
  return { success: true };
}

export async function getTokensForRenderer(configSetId: string): Promise<StoredTokens | null> {
  return puraTokenStore.getForSet(configSetId);
}

export function setTokensFromRenderer(
  configSetId: string,
  tokens: StoredTokens | null
): { success: boolean } {
  if (!tokens) {
    puraTokenStore.clearForSet(configSetId);
    return { success: true };
  }
  return { success: puraTokenStore.setForSet(configSetId, tokens) };
}
