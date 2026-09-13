import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DatabaseInstance } from '../src/main/db/database';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp',
    getVersion: () => '0.0.0',
  },
}));

vi.mock('electron-store', () => {
  class MockStore<T extends Record<string, unknown>> {
    public store: Record<string, unknown>;
    public path = '/tmp/mock-workspace-sync-config-store.json';

    constructor(options: { defaults?: Record<string, unknown> }) {
      this.store = { ...(options?.defaults || {}) };
    }

    get<K extends keyof T>(key: K): T[K] {
      return this.store[key as string] as T[K];
    }

    set(key: string | Record<string, unknown>, value?: unknown): void {
      if (typeof key === 'string') {
        this.store[key] = value;
        return;
      }
      this.store = { ...this.store, ...key };
    }
  }

  return { default: MockStore };
});

vi.mock('../src/main/claude/agent-runner', () => ({
  ClaudeAgentRunner: class {
    run = vi.fn().mockResolvedValue(undefined);
    cancel = vi.fn();
    clearSdkSession = vi.fn();
    handleQuestionResponse = vi.fn();
  },
}));

vi.mock('../src/main/mcp/mcp-config-store', () => ({
  mcpConfigStore: {
    getEnabledServers: () => [],
  },
}));

const getProjectMock = vi.fn();
vi.mock('../src/main/project/project-manager', () => ({
  tryGetProjectManager: () => ({
    getProject: getProjectMock,
  }),
}));

const sandboxMocks = vi.hoisted(() => {
  const initialize = vi.fn().mockResolvedValue(undefined);
  const reinitialize = vi.fn().mockResolvedValue(undefined);
  const sandboxAdapterState = {
    initialized: false,
    workspacePath: '',
    initialize,
    reinitialize,
  };
  return { initialize, reinitialize, sandboxAdapterState };
});

vi.mock('../src/main/sandbox/sandbox-adapter', () => ({
  SandboxAdapter: class {},
  getSandboxAdapter: () => sandboxMocks.sandboxAdapterState,
  initializeSandbox: vi.fn(),
  reinitializeSandbox: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn((target: fs.PathLike) => {
      const value = String(target);
      if (value.includes('missing-workspace')) {
        return false;
      }
      return true;
    }),
  };
});

import * as fs from 'fs';
import { SessionManager } from '../src/main/session/session-manager';

function makeDb(sessionRow: Record<string, unknown> | null): DatabaseInstance {
  return {
    sessions: {
      create: vi.fn(),
      get: vi.fn(() => sessionRow),
      getAll: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
    },
    messages: {
      create: vi.fn(),
      getBySessionId: vi.fn(() => []),
      delete: vi.fn(),
      deleteBySessionId: vi.fn(),
    },
    traceSteps: {
      create: vi.fn(),
      update: vi.fn(),
      getBySessionId: vi.fn(() => []),
      deleteBySessionId: vi.fn(),
    },
  } as unknown as DatabaseInstance;
}

describe('SessionManager workspace sync', () => {
  beforeEach(() => {
    getProjectMock.mockReset();
    sandboxMocks.initialize.mockClear();
    sandboxMocks.reinitialize.mockClear();
    sandboxMocks.sandboxAdapterState.initialized = false;
    sandboxMocks.sandboxAdapterState.workspacePath = '';
  });

  it('syncs stale session cwd from project workDir before continuing', async () => {
    const db = makeDb({
      id: 's1',
      title: 'Test',
      status: 'idle',
      cwd: '/Users/me/Desktop/Archiveye',
      mounted_paths: '[]',
      allowed_tools: '[]',
      memory_enabled: 1,
      project_id: 'p1',
      created_at: 1,
      updated_at: 1,
    });
    getProjectMock.mockReturnValue({
      id: 'p1',
      workDir: '/Users/me/Desktop/Archiveye-v2',
    });

    const manager = new SessionManager(db, vi.fn());
    (manager as unknown as { ensureSandboxInitialized: () => Promise<void> }).ensureSandboxInitialized =
      vi.fn().mockResolvedValue(undefined);
    (manager as unknown as { processFileAttachments: (...args: unknown[]) => Promise<unknown> })
      .processFileAttachments = vi.fn(async (_session, content) => content);

    await manager.continueSession('s1', 'hello');

    expect(db.sessions.update).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        cwd: '/Users/me/Desktop/Archiveye-v2',
      })
    );
  });

  it('reinitializes sandbox when workspace path changes', async () => {
    sandboxMocks.sandboxAdapterState.initialized = true;
    sandboxMocks.sandboxAdapterState.workspacePath = '/Users/me/Desktop/Archiveye';

    const db = makeDb({
      id: 's1',
      title: 'Test',
      status: 'idle',
      cwd: '/Users/me/Desktop/Archiveye-v2',
      mounted_paths: '[]',
      allowed_tools: '[]',
      memory_enabled: 1,
      project_id: 'p1',
      created_at: 1,
      updated_at: 1,
    });
    getProjectMock.mockReturnValue({
      id: 'p1',
      workDir: '/Users/me/Desktop/Archiveye-v2',
    });

    const manager = new SessionManager(db, vi.fn());
    const reinitializeSpy = vi
      .spyOn(
        (manager as unknown as { sandboxAdapter: { reinitialize: (config: unknown) => Promise<void> } })
          .sandboxAdapter,
        'reinitialize'
      )
      .mockResolvedValue(undefined);

    await (manager as unknown as { ensureSandboxInitialized: (session: unknown) => Promise<void> })
      .ensureSandboxInitialized({
        id: 's1',
        title: 'Test',
        status: 'idle',
        cwd: '/Users/me/Desktop/Archiveye-v2',
        projectId: 'p1',
        mountedPaths: [],
        allowedTools: [],
        memoryEnabled: true,
        createdAt: 1,
        updatedAt: 1,
      });

    expect(reinitializeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePath: '/Users/me/Desktop/Archiveye-v2' })
    );
    expect(sandboxMocks.initialize).not.toHaveBeenCalled();
  });

  it('skips sandbox init without error toast when workspace path is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);

    const sendToRenderer = vi.fn();
    const manager = new SessionManager(makeDb(null), sendToRenderer);

    await (manager as unknown as { ensureSandboxInitialized: (session: unknown) => Promise<void> })
      .ensureSandboxInitialized({
        id: 's1',
        title: 'Test',
        status: 'idle',
        cwd: '/Users/me/Desktop/missing-workspace',
        mountedPaths: [],
        allowedTools: [],
        memoryEnabled: true,
        createdAt: 1,
        updatedAt: 1,
      });

    expect(sandboxMocks.initialize).not.toHaveBeenCalled();
    expect(sandboxMocks.reinitialize).not.toHaveBeenCalled();
    expect(sendToRenderer).not.toHaveBeenCalled();
  });
});
