import { formatMcpReconnectUserMessage } from '../../shared/mcp-auth-errors';

/** Thrown when MCP server connection requires user OAuth authorization. */
export class McpAuthRequiredError extends Error {
  readonly serverId: string;
  readonly serverName?: string;

  constructor(serverId: string, serverName?: string) {
    super(formatMcpReconnectUserMessage(serverName));
    this.name = 'McpAuthRequiredError';
    this.serverId = serverId;
    this.serverName = serverName;
  }
}

export function isMcpAuthRequiredError(error: unknown): error is McpAuthRequiredError {
  return error instanceof McpAuthRequiredError;
}
