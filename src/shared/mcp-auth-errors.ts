/** User-facing message when an MCP OAuth session must be renewed. */
export function formatMcpReconnectUserMessage(serverName?: string): string {
  if (serverName?.trim()) {
    return `The connector "${serverName.trim()}" needs to reconnect. Open Settings → Connectors and reconnect it to continue.`;
  }
  return 'An MCP connector needs to reconnect. Open Settings → Connectors and reconnect it to continue.';
}

function parseOAuthErrorFromMessage(message: string): string | null {
  const jsonStart = message.indexOf('{');
  if (jsonStart === -1) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.slice(jsonStart)) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Detect expired/invalid bearer token errors from MCP remote transports. */
export function isMcpTokenAuthErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const oauthError = parseOAuthErrorFromMessage(message);
  if (oauthError === 'invalid_token' || oauthError === 'invalid_grant') {
    return true;
  }

  return (
    normalized.includes('invalid_token') ||
    normalized.includes('invalid_grant') ||
    normalized.includes('bearer token is invalid') ||
    normalized.includes('provided bearer token is invalid') ||
    normalized.includes('token is invalid, expired') ||
    normalized.includes('no longer recognized by the server')
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isMcpTokenAuthError(error: unknown): boolean {
  return isMcpTokenAuthErrorMessage(getErrorMessage(error));
}
