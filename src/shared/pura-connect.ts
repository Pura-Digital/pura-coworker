/**
 * Pura Connect OAuth deep link (desktop). Distinct from MCP OAuth route.
 */

import { MCP_OAUTH_SCHEME } from './mcp-oauth';
import { isPuraDigitalActive } from './pura-digital';
import type { CustomProtocolType, ProviderType } from '../renderer/types';

export const PURA_CONNECT_SCHEME = MCP_OAUTH_SCHEME;

// Registered public desktop OAuth client. PKCE authentication does not embed a client secret.
export const DEFAULT_PURA_CONNECT_CLIENT_ID = 'pura_app_Ogu7FEKMw0pOO1BF0flbCXN-sFzyVsUS';

export const PURA_CONNECT_REDIRECT_URI = `${PURA_CONNECT_SCHEME}://pura-oauth`;

const PURA_OAUTH_HOST = 'pura-oauth';

export function isPuraOAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${PURA_CONNECT_SCHEME}:`) {
      return false;
    }
    const host = (
      parsed.hostname ||
      parsed.pathname.replace(/^\/+/, '').split('/')[0] ||
      ''
    ).toLowerCase();
    return host === PURA_OAUTH_HOST;
  } catch {
    return false;
  }
}

export function extractPuraOAuthCallbackFromArgv(argv: string[]): string | undefined {
  return argv.find((arg) => isPuraOAuthCallbackUrl(arg));
}

/** Queue for callbacks received before handlers are ready. */
const pendingCallbacks: string[] = [];

export function enqueuePuraOAuthCallback(url: string): void {
  if (isPuraOAuthCallbackUrl(url)) {
    pendingCallbacks.push(url);
  }
}

export function drainPendingPuraOAuthCallbacks(): string[] {
  const drained = [...pendingCallbacks];
  pendingCallbacks.length = 0;
  return drained;
}

export type PuraAuthMode = 'subscription' | 'apiKey';

export function isPuraAuthMode(value: unknown): value is PuraAuthMode {
  return value === 'subscription' || value === 'apiKey';
}

export function inferPuraAuthModeForDigitalSet(input: {
  puraAuthMode?: unknown;
  provider: ProviderType;
  customProtocol: CustomProtocolType;
  baseUrl?: string;
  apiKey?: string;
}): PuraAuthMode | undefined {
  if (isPuraAuthMode(input.puraAuthMode)) {
    return input.puraAuthMode;
  }
  if (!isPuraDigitalActive(input.provider, input.customProtocol, input.baseUrl)) {
    return undefined;
  }
  return input.apiKey?.trim() ? 'apiKey' : 'subscription';
}
