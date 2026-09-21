/**
 * Tests for MCPManager connection timeout, status tracking, and OAuth integration.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    constructor(message?: string) {
      super(message ?? 'Unauthorized');
      this.name = 'UnauthorizedError';
    }
  }

  const mockConnect = vi.fn();
  const mockPrepareAuth = vi.fn().mockResolvedValue({ status: 'auth-required' });
  const mockHandleCallbackUrl = vi.fn().mockResolvedValue({ success: true });
  const mockGetProvider = vi.fn().mockReturnValue({
    redirectUrl: 'com.puradigital.aiden://oauth/mcp/callback',
  });
  const mockGetServerIdByState = vi.fn();
  const sseInstances: Array<{ url: URL; options: unknown; close: ReturnType<typeof vi.fn> }> = [];
  const httpInstances: Array<{ url: URL; options: unknown; close: ReturnType<typeof vi.fn> }> = [];

  function SSEClientTransport(this: unknown, url: URL, options: unknown) {
    const instance = { url, options, close: vi.fn().mockResolvedValue(undefined) };
    sseInstances.push(instance);
    return instance;
  }

  function StreamableHTTPClientTransport(this: unknown, url: URL, options: unknown) {
    const instance = { url, options, close: vi.fn().mockResolvedValue(undefined) };
    httpInstances.push(instance);
    return instance;
  }

  return {
    UnauthorizedError,
    mockConnect,
    mockPrepareAuth,
    mockHandleCallbackUrl,
    mockGetProvider,
    mockGetServerIdByState,
    sseInstances,
    httpInstances,
    SSEClientTransport,
    StreamableHTTPClientTransport,
  };
});

// Mock electron
vi.mock('electron', () => ({
  default: {},
  app: {
    isPackaged: false,
    getPath: () => '/tmp/open-cowork-test',
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  UnauthorizedError: mocks.UnauthorizedError,
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(function MockClient() {
    return {
      connect: mocks.mockConnect,
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn(mocks.SSEClientTransport),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(mocks.StreamableHTTPClientTransport),
}));

vi.mock('../../main/mcp/mcp-oauth-service', () => ({
  getMcpOAuthService: () => ({
    getProvider: mocks.mockGetProvider,
    prepareAuth: mocks.mockPrepareAuth,
    startOAuth: vi.fn().mockResolvedValue({ success: true }),
    handleCallbackUrl: mocks.mockHandleCallbackUrl,
    disconnectOAuth: vi.fn().mockResolvedValue(undefined),
    hasValidTokens: vi.fn().mockReturnValue(false),
  }),
}));

vi.mock('../../main/mcp/mcp-oauth-store', () => ({
  getMcpOAuthStore: () => ({
    getServerIdByState: mocks.mockGetServerIdByState,
    getDiscovery: vi.fn(),
    getAuthorizationUrl: vi.fn(),
    invalidate: vi.fn(),
  }),
}));

// Mock logger to suppress output during tests
vi.mock('../../main/utils/logger', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  logCtx: vi.fn(),
  logCtxError: vi.fn(),
  logTiming: vi.fn(),
}));

// Mock shell-resolver
vi.mock('../../main/utils/shell-resolver', () => ({
  getDefaultShell: () => '/bin/bash',
}));

import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPManager } from '../../main/mcp/mcp-manager';
import type { MCPServerConfig } from '../../main/mcp/mcp-manager';
import { MCP_OAUTH_REDIRECT_URI } from '../../shared/mcp-oauth';

describe('MCPManager', () => {
  let manager: MCPManager;

  beforeEach(() => {
    mocks.sseInstances.length = 0;
    mocks.httpInstances.length = 0;

    vi.mocked(Client).mockImplementation(function MockClient() {
      return {
        connect: mocks.mockConnect,
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

    vi.mocked(SSEClientTransport).mockImplementation(function (url: URL, options: unknown) {
      const instance = { url, options, close: vi.fn().mockResolvedValue(undefined) };
      mocks.sseInstances.push(instance);
      return instance;
    });

    vi.mocked(StreamableHTTPClientTransport).mockImplementation(function (url: URL, options: unknown) {
      const instance = { url, options, close: vi.fn().mockResolvedValue(undefined) };
      mocks.httpInstances.push(instance);
      return instance;
    });

    mocks.mockGetProvider.mockReturnValue({
      redirectUrl: MCP_OAUTH_REDIRECT_URI,
    });
    mocks.mockConnect.mockRejectedValue(new Error('Connection refused'));
    mocks.mockPrepareAuth.mockResolvedValue({ status: 'auth-required' });
    mocks.mockHandleCallbackUrl.mockResolvedValue({ success: true });
    manager = new MCPManager();
  });

  describe('getServerStatus()', () => {
    it('returns disabled status for disabled servers', async () => {
      const configs: MCPServerConfig[] = [
        {
          id: 'test-1',
          name: 'Test Server',
          type: 'stdio',
          command: 'echo',
          args: ['hello'],
          enabled: false,
        },
      ];

      await manager.initializeServers(configs);
      const statuses = manager.getServerStatus();

      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toMatchObject({
        id: 'test-1',
        name: 'Test Server',
        connected: false,
        status: 'disabled',
        toolCount: 0,
      });
    });

    it('returns failed status when connection fails', async () => {
      const configs: MCPServerConfig[] = [
        {
          id: 'test-fail',
          name: 'Failing Server',
          type: 'sse',
          url: 'http://127.0.0.1:1/nonexistent',
          enabled: true,
        },
      ];

      await manager.initializeServers(configs);
      const statuses = manager.getServerStatus();

      expect(statuses).toHaveLength(1);
      expect(statuses[0].id).toBe('test-fail');
      expect(statuses[0].status).toBe('failed');
      expect(statuses[0].connected).toBe(false);
    });

    it('includes status field in all returned statuses', async () => {
      const configs: MCPServerConfig[] = [
        {
          id: 'disabled-server',
          name: 'Disabled',
          type: 'stdio',
          command: 'echo',
          enabled: false,
        },
        {
          id: 'enabled-server',
          name: 'Enabled',
          type: 'sse',
          url: 'http://127.0.0.1:1/bad',
          enabled: true,
        },
      ];

      await manager.initializeServers(configs);
      const statuses = manager.getServerStatus();

      expect(statuses).toHaveLength(2);
      for (const s of statuses) {
        expect(s).toHaveProperty('status');
        expect([
          'connecting',
          'connected',
          'failed',
          'disabled',
          'auth-required',
          'authenticating',
        ]).toContain(s.status);
      }
    });

    it('returns empty array when no servers configured', () => {
      const statuses = manager.getServerStatus();
      expect(statuses).toEqual([]);
    });
  });

  describe('connection timeout', () => {
    it('fails with timeout error when transport never responds', async () => {
      const config: MCPServerConfig = {
        id: 'timeout-test',
        name: 'Timeout Test',
        type: 'sse',
        url: 'http://127.0.0.1:1/timeout-test',
        enabled: true,
      };

      await manager.initializeServers([config]);
      const statuses = manager.getServerStatus();

      const serverStatus = statuses.find((s) => s.id === 'timeout-test');
      expect(serverStatus).toBeDefined();
      expect(serverStatus!.status).toBe('failed');
      expect(serverStatus!.connected).toBe(false);
    });
  });

  describe('disconnectServer()', () => {
    it('removes connection status when disconnecting', async () => {
      const configs: MCPServerConfig[] = [
        {
          id: 'disc-test',
          name: 'Disconnect Test',
          type: 'sse',
          url: 'http://127.0.0.1:1/bad',
          enabled: true,
        },
      ];

      await manager.initializeServers(configs);

      let statuses = manager.getServerStatus();
      expect(statuses[0].status).toBe('failed');

      await manager.disconnectServer('disc-test');
      statuses = manager.getServerStatus();
      expect(statuses[0].status).toBe('connecting');
    });
  });

  describe('OAuth integration', () => {
    const oauthSseConfig: MCPServerConfig = {
      id: 'oauth-sse',
      name: 'OAuth SSE',
      type: 'sse',
      url: 'https://mcp.example.com/sse',
      enabled: true,
      authType: 'oauth',
      oauth: { registrationStrategy: 'auto' },
    };

    const oauthHttpConfig: MCPServerConfig = {
      id: 'oauth-http',
      name: 'OAuth HTTP',
      type: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
      enabled: true,
      authType: 'oauth',
      oauth: { registrationStrategy: 'client_id', clientId: 'public-client' },
    };

    it('sets auth-required on 401 for SSE without disabling the server', async () => {
      mocks.mockConnect.mockRejectedValueOnce(new UnauthorizedError());

      await manager.initializeServers([oauthSseConfig]);
      const status = manager.getServerStatus().find((s) => s.id === 'oauth-sse');

      expect(status?.status).toBe('auth-required');
      expect(status?.connected).toBe(false);
      expect(oauthSseConfig.enabled).toBe(true);
      expect(mocks.mockPrepareAuth).toHaveBeenCalledWith(oauthSseConfig);
      expect(mocks.sseInstances[0]?.options).toEqual({
        authProvider: expect.objectContaining({ redirectUrl: MCP_OAUTH_REDIRECT_URI }),
      });
    });

    it('sets auth-required on 401 for Streamable HTTP', async () => {
      mocks.mockConnect.mockRejectedValueOnce(new UnauthorizedError());

      await manager.initializeServers([oauthHttpConfig]);
      const status = manager.getServerStatus().find((s) => s.id === 'oauth-http');

      expect(status?.status).toBe('auth-required');
      expect(mocks.httpInstances[0]?.options).toEqual({
        authProvider: expect.objectContaining({ redirectUrl: MCP_OAUTH_REDIRECT_URI }),
      });
    });

    it('sets auth-required on invalid_token Streamable HTTP errors', async () => {
      mocks.mockConnect.mockRejectedValueOnce(
        new Error(
          'Streamable HTTP error: Error POSTing to endpoint: {"error": "invalid_token", "error_description": "Authentication failed."}'
        )
      );

      await manager.initializeServers([oauthHttpConfig]);
      const status = manager.getServerStatus().find((s) => s.id === 'oauth-http');

      expect(status?.status).toBe('auth-required');
      expect(mocks.mockPrepareAuth).toHaveBeenCalledWith(oauthHttpConfig);
    });

    it('connects when OAuth tokens are already valid', async () => {
      mocks.mockConnect.mockResolvedValue(undefined);

      await manager.initializeServers([oauthSseConfig]);
      const status = manager.getServerStatus().find((s) => s.id === 'oauth-sse');

      expect(status?.status).toBe('connected');
      expect(status?.connected).toBe(true);
    });

    it('reconnects with a fresh transport after OAuth callback', async () => {
      mocks.mockConnect
        .mockRejectedValueOnce(new UnauthorizedError())
        .mockResolvedValueOnce(undefined);

      await manager.initializeServers([oauthSseConfig]);
      expect(manager.getServerStatus().find((s) => s.id === 'oauth-sse')?.status).toBe(
        'auth-required'
      );
      expect(mocks.sseInstances).toHaveLength(1);

      mocks.mockGetServerIdByState.mockReturnValue('oauth-sse');
      const callbackUrl =
        `${MCP_OAUTH_REDIRECT_URI}?code=abc&state=test-state`;
      const handled = await manager.handleOAuthCallbackUrl(callbackUrl);

      expect(handled).toBe(true);
      expect(mocks.mockHandleCallbackUrl).toHaveBeenCalledWith(callbackUrl, oauthSseConfig);
      expect(mocks.sseInstances).toHaveLength(2);
      expect(manager.getServerStatus().find((s) => s.id === 'oauth-sse')?.status).toBe(
        'connected'
      );
    });

    it('keeps static header auth unchanged for non-OAuth remote servers', async () => {
      const staticConfig: MCPServerConfig = {
        id: 'static-sse',
        name: 'Static SSE',
        type: 'sse',
        url: 'https://mcp.example.com/sse',
        enabled: true,
        headers: { Authorization: 'Bearer static-token' },
      };

      await manager.initializeServers([staticConfig]);

      expect(mocks.mockGetProvider).not.toHaveBeenCalled();
      expect(mocks.sseInstances[0]?.options).toEqual({
        requestInit: { headers: { Authorization: 'Bearer static-token' } },
      });
    });
  });
});
