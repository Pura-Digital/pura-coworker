import { MCP_OAUTH_REDIRECT_URI, MCP_OAUTH_SCHEME } from '../../shared/mcp-oauth';

export interface McpOAuthCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
  iss?: string;
}

export function isMcpOAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${MCP_OAUTH_SCHEME}:`) {
      return false;
    }
    // Custom schemes parse host + path separately: oauth/mcp/callback → host=oauth, pathname=/mcp/callback
    const route = `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '');
    return route === 'oauth/mcp/callback';
  } catch {
    return false;
  }
}

export function parseMcpOAuthCallbackUrl(url: string): McpOAuthCallbackParams | null {
  if (!isMcpOAuthCallbackUrl(url)) {
    return null;
  }

  const parsed = new URL(url);
  return {
    code: parsed.searchParams.get('code') ?? undefined,
    state: parsed.searchParams.get('state') ?? undefined,
    error: parsed.searchParams.get('error') ?? undefined,
    errorDescription: parsed.searchParams.get('error_description') ?? undefined,
    iss: parsed.searchParams.get('iss') ?? undefined,
  };
}

export function extractMcpOAuthCallbackFromArgv(argv: string[]): string | undefined {
  return argv.find((arg) => isMcpOAuthCallbackUrl(arg));
}

export function validateMcpOAuthCallbackParams(
  params: McpOAuthCallbackParams,
  expectedState?: string
): { ok: true; code: string } | { ok: false; error: string } {
  if (params.error) {
    return {
      ok: false,
      error: params.errorDescription || params.error,
    };
  }

  if (!params.code?.trim()) {
    return { ok: false, error: 'Missing authorization code in OAuth callback' };
  }

  if (!params.state?.trim()) {
    return { ok: false, error: 'Missing state in OAuth callback' };
  }

  if (expectedState && params.state !== expectedState) {
    return { ok: false, error: 'OAuth state mismatch' };
  }

  return { ok: true, code: params.code.trim() };
}

/** Queue for callbacks received before SessionManager is ready. */
const pendingCallbacks: string[] = [];

export function enqueueMcpOAuthCallback(url: string): void {
  if (isMcpOAuthCallbackUrl(url)) {
    pendingCallbacks.push(url);
  }
}

export function drainPendingMcpOAuthCallbacks(): string[] {
  const drained = [...pendingCallbacks];
  pendingCallbacks.length = 0;
  return drained;
}

export function getMcpOAuthRedirectUri(): string {
  return MCP_OAUTH_REDIRECT_URI;
}
