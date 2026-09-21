import { describe, expect, it } from 'vitest';
import {
  formatMcpReconnectUserMessage,
  isMcpTokenAuthErrorMessage,
} from '../src/shared/mcp-auth-errors';

describe('mcp-auth-errors', () => {
  it('detects invalid_token in Streamable HTTP error payloads', () => {
    const message =
      'Streamable HTTP error: Error POSTing to endpoint: {"error": "invalid_token", "error_description": "Authentication failed. The provided bearer token is invalid, expired, or no longer recognized by the server."}';

    expect(isMcpTokenAuthErrorMessage(message)).toBe(true);
  });

  it('formats reconnect guidance for a named connector', () => {
    expect(formatMcpReconnectUserMessage('Archiveye')).toContain('Archiveye');
    expect(formatMcpReconnectUserMessage('Archiveye')).toContain('reconnect');
  });
});
