import { describe, expect, it } from 'vitest';
import { isPuraOAuthCallbackUrl } from '../src/shared/pura-connect';
import { isMcpOAuthCallbackUrl } from '../src/main/mcp/mcp-oauth-deep-link';

describe('Pura Connect deep link routing', () => {
  it('accepts pura-oauth callbacks on the Aiden scheme', () => {
    expect(
      isPuraOAuthCallbackUrl(
        'com.puradigital.aiden://pura-oauth?code=abc&state=xyz'
      )
    ).toBe(true);
  });

  it('rejects MCP OAuth callbacks', () => {
    const mcpUrl = 'com.puradigital.aiden://oauth/mcp/callback?code=abc&state=xyz';
    expect(isMcpOAuthCallbackUrl(mcpUrl)).toBe(true);
    expect(isPuraOAuthCallbackUrl(mcpUrl)).toBe(false);
  });
});
