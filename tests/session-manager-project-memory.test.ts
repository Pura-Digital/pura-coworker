import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
const getProjectSessionsMock = vi.fn();
vi.mock('../src/main/claude/claude-sdk-one-shot', () => ({
  generateProjectMemoryWithClaudeSdk: vi.fn(),
  generateTitleWithClaudeSdk: vi.fn().mockResolvedValue(null),
}));
vi.mock('../src/main/project/project-manager', () => ({
  tryGetProjectManager: () => ({
    getProject: getProjectMock,
    getProjectSessions: getProjectSessionsMock,
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

import * as os from 'os';
import * as path from 'path';
import { generateProjectMemoryWithClaudeSdk } from '../src/main/claude/claude-sdk-one-shot';
import type { Session, Message } from '../src/renderer/types';
let directory: string;
let manager: SessionManager;
const session = {
  id: 's1',
  projectId: 'p1',
  title: 'Test',
  status: 'idle',
  mountedPaths: [],
  allowedTools: [],
  memoryEnabled: true,
  createdAt: 1,
  updatedAt: 1,
} as Session;
const message = (role: 'user' | 'assistant', text: string, timestamp = 1): Message => ({
  id: text,
  sessionId: 's1',
  role,
  content: [{ type: 'text', text }],
  timestamp,
});

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-'));
  getProjectMock.mockReturnValue({ id: 'p1', name: 'Archiveye', workDir: directory });
  getProjectSessionsMock.mockReturnValue([session, { ...session, id: 'old-chat' }]);
  manager = new SessionManager(makeDb(null), vi.fn());
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe('SessionManager project memory flow', () => {
  it('injects the latest memory on resumed turns without persisting it as user text', async () => {
    const internals = manager as unknown as {
      ensureSandboxInitialized: ReturnType<typeof vi.fn>;
      processPrompt: (session: Session, prompt: string) => Promise<void>;
      runSessionTitleGeneration: ReturnType<typeof vi.fn>;
      scheduleProjectMemoryUpdate: ReturnType<typeof vi.fn>;
      agentRunner: { run: ReturnType<typeof vi.fn> };
    };
    internals.ensureSandboxInitialized = vi.fn().mockResolvedValue(undefined);
    internals.runSessionTitleGeneration = vi.fn().mockResolvedValue(undefined);
    internals.scheduleProjectMemoryUpdate = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(manager, 'getMessages').mockReturnValue([message('user', 'Previous turn')]);
    fs.writeFileSync(path.join(directory, 'MEMORY.md'), '# Memory\n- First decision');
    await internals.processPrompt(session, 'Continue');
    expect(internals.agentRunner.run.mock.calls[0][1]).toContain('First decision');
    fs.writeFileSync(path.join(directory, 'MEMORY.md'), '# Memory\n- Corrected decision');
    await internals.processPrompt(session, 'Continue again');
    expect(internals.agentRunner.run.mock.calls[1][1]).toContain('Corrected decision');
    expect(internals.agentRunner.run.mock.calls[1][1]).not.toContain('First decision');
    expect(internals.agentRunner.run.mock.calls[1][2].at(-1).content[0].text).toBe(
      'Continue again'
    );
    expect(internals.scheduleProjectMemoryUpdate).toHaveBeenCalledTimes(2);
  });

  it('recovers scaffold memory from other project chats as well as the current turn', async () => {
    fs.writeFileSync(path.join(directory, 'MEMORY.md'), '# Archiveye Project Memory');
    vi.spyOn(manager, 'getMessages').mockImplementation((id) =>
      id === 'old-chat'
        ? [message('user', 'Historical decision', 1), message('assistant', 'Confirmed', 2)]
        : [message('user', 'New decision', 3), message('assistant', 'Done', 4)]
    );
    vi.mocked(generateProjectMemoryWithClaudeSdk).mockResolvedValue(
      '# Memory\n- Historical decision\n- New decision'
    );
    await (
      manager as unknown as { scheduleProjectMemoryUpdate: (s: Session) => Promise<void> }
    ).scheduleProjectMemoryUpdate(session);
    expect(vi.mocked(generateProjectMemoryWithClaudeSdk).mock.calls[0][0]).toContain(
      'Historical decision'
    );
    expect(vi.mocked(generateProjectMemoryWithClaudeSdk).mock.calls[0][0]).toContain(
      'New decision'
    );
    expect(fs.readFileSync(path.join(directory, 'MEMORY.md'), 'utf-8')).toContain(
      'Historical decision'
    );
  });
});
