import { beforeEach, describe, expect, it } from 'vitest';
import {
  drainPendingMcpOAuthCallbacks,
  enqueueMcpOAuthCallback,
  extractMcpOAuthCallbackFromArgv,
  isMcpOAuthCallbackUrl,
  parseMcpOAuthCallbackUrl,
  validateMcpOAuthCallbackParams,
} from '../../main/mcp/mcp-oauth-deep-link';
import { MCP_OAUTH_REDIRECT_URI } from '../../shared/mcp-oauth';

describe('mcp-oauth-deep-link', () => {
  beforeEach(() => {
    drainPendingMcpOAuthCallbacks();
  });

  it('recognizes valid callback URLs', () => {
    expect(isMcpOAuthCallbackUrl(`${MCP_OAUTH_REDIRECT_URI}?code=abc&state=xyz`)).toBe(true);
    expect(isMcpOAuthCallbackUrl('https://example.com/callback')).toBe(false);
  });

  it('parses authorization code and state from callback', () => {
    const params = parseMcpOAuthCallbackUrl(
      `${MCP_OAUTH_REDIRECT_URI}?code=auth-code-123&state=state-456`
    );
    expect(params).toEqual({
      code: 'auth-code-123',
      state: 'state-456',
      error: undefined,
      errorDescription: undefined,
      iss: undefined,
    });
  });

  it('rejects callback with OAuth error parameter', () => {
    const params = parseMcpOAuthCallbackUrl(
      `${MCP_OAUTH_REDIRECT_URI}?error=access_denied&error_description=User%20denied`
    );
    const result = validateMcpOAuthCallbackParams(params!);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('denied');
    }
  });

  it('rejects callback with state mismatch', () => {
    const params = parseMcpOAuthCallbackUrl(
      `${MCP_OAUTH_REDIRECT_URI}?code=abc&state=wrong-state`
    );
    const result = validateMcpOAuthCallbackParams(params!, 'expected-state');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('mismatch');
    }
  });

  it('extracts callback URL from process argv on Windows/Linux', () => {
    const argv = [
      'C:\\Program Files\\Aiden\\Aiden.exe',
      `${MCP_OAUTH_REDIRECT_URI}?code=win-code&state=win-state`,
    ];
    expect(extractMcpOAuthCallbackFromArgv(argv)).toBe(
      `${MCP_OAUTH_REDIRECT_URI}?code=win-code&state=win-state`
    );
  });

  it('queues and drains callbacks for cold start', () => {
    const url = `${MCP_OAUTH_REDIRECT_URI}?code=cold&state=cold-state`;
    enqueueMcpOAuthCallback(url);
    enqueueMcpOAuthCallback('https://ignored.example');
    expect(drainPendingMcpOAuthCallbacks()).toEqual([url]);
    expect(drainPendingMcpOAuthCallbacks()).toEqual([]);
  });
});
