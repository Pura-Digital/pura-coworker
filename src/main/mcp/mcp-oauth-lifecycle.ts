import {
  drainPendingMcpOAuthCallbacks,
  enqueueMcpOAuthCallback,
  extractMcpOAuthCallbackFromArgv,
  isMcpOAuthCallbackUrl,
} from './mcp-oauth-deep-link';
import { getMcpOAuthService } from './mcp-oauth-service';
import { mcpConfigStore } from './mcp-config-store';
import { log, logWarn } from '../utils/logger';
import type { MCPManager } from './mcp-manager';

type McpManagerResolver = () => MCPManager | null;

let managerResolver: McpManagerResolver = () => null;

export function setMcpOAuthManagerResolver(resolver: McpManagerResolver): void {
  managerResolver = resolver;
}

/** Protocol client registration lives in pura-oauth-lifecycle (shared scheme router). */
export function registerMcpOAuthProtocolHandlers(): void {
  // no-op: kept for tests that assert the symbol exists
}

export function captureStartupMcpOAuthCallback(argv: string[] = process.argv): void {
  const callbackUrl = extractMcpOAuthCallbackFromArgv(argv);
  if (callbackUrl) {
    log('[McpOAuth] Queued startup OAuth callback');
    enqueueMcpOAuthCallback(callbackUrl);
  }
}

export function captureSecondInstanceMcpOAuthCallback(argv: string[]): void {
  const callbackUrl = extractMcpOAuthCallbackFromArgv(argv);
  if (callbackUrl) {
    log('[McpOAuth] Queued second-instance OAuth callback');
    enqueueMcpOAuthCallback(callbackUrl);
    void processMcpOAuthCallbacks();
  }
}

export async function processMcpOAuthCallbacks(): Promise<void> {
  const manager = managerResolver();
  if (!manager) {
    logWarn('[McpOAuth] MCPManager not ready; callbacks remain queued');
    return;
  }

  const urls = drainPendingMcpOAuthCallbacks();
  for (const url of urls) {
    if (!isMcpOAuthCallbackUrl(url)) {
      continue;
    }
    await manager.handleOAuthCallbackUrl(url);
  }
}

export async function disconnectMcpOAuth(serverId: string): Promise<void> {
  await getMcpOAuthService().disconnectOAuth(serverId);
  const manager = managerResolver();
  if (manager) {
    await manager.disconnectServer(serverId);
  }
}

export function getMcpOAuthServerConfig(serverId: string) {
  return mcpConfigStore.getServer(serverId);
}
