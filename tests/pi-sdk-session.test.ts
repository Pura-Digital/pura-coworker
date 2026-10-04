import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthStorage,
  createAgentSession,
  createBashToolDefinition,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@mariozechner/pi-coding-agent';
import {
  createAssistantMessageEventStream,
  getModel,
  type AssistantMessage,
} from '@mariozechner/pi-ai';
import { Type } from 'typebox';

// Exercise the real SDK: an allowlist alone would silently use the default bash
// implementation and omit custom tools after the 0.73 session API change.
describe('pi 0.73 SDK session integration', () => {
  it('preserves wrapped tools, custom schemas, and the appended system prompt', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'pura-pi-session-'));
    const authStorage = AuthStorage.inMemory();
    authStorage.setRuntimeApiKey('openai', 'test-key-unused');
    const model = getModel('openai', 'gpt-4o');
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: cwd,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      appendSystemPrompt: ['Pura test instruction.'],
    });
    const bashExecute = vi.fn(async (_id: string, _params: Record<string, unknown>) => ({
      content: [{ type: 'text' as const, text: 'wrapped bash result' }],
      details: undefined,
    }));
    const customExecute = vi.fn(async (_id: string, _params: Record<string, unknown>) => ({
      content: [{ type: 'text' as const, text: 'custom result' }],
      details: undefined,
    }));
    let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
    try {
      await resourceLoader.reload();
      const definitions = [
        { ...createBashToolDefinition(cwd), execute: bashExecute },
        {
          name: 'probe_custom',
          label: 'Probe',
          description: 'Custom schema test',
          parameters: Type.Unsafe({
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
          }),
          execute: customExecute,
        },
      ];
      ({ session } = await createAgentSession({
        cwd,
        agentDir: cwd,
        model,
        thinkingLevel: 'off',
        authStorage,
        modelRegistry: ModelRegistry.inMemory(authStorage),
        sessionManager: SessionManager.inMemory(cwd),
        settingsManager,
        resourceLoader,
        tools: definitions.map((tool) => tool.name),
        customTools: definitions,
      }));
      expect(session.getActiveToolNames().sort()).toEqual(['bash', 'probe_custom']);
      expect(session.systemPrompt).toContain('Pura test instruction.');
      let turns = 0;
      session.agent.streamFn = () => {
        const stream = createAssistantMessageEventStream();
        const message: AssistantMessage = {
          role: 'assistant',
          provider: model.provider,
          api: model.api,
          model: model.id,
          timestamp: 0,
          stopReason: turns++ === 0 ? 'toolUse' : 'stop',
          content:
            turns === 1
              ? [
                  {
                    type: 'toolCall',
                    id: 'bash1',
                    name: 'bash',
                    arguments: { command: 'unused command' },
                  },
                  {
                    type: 'toolCall',
                    id: 'custom1',
                    name: 'probe_custom',
                    arguments: { value: 'ping' },
                  },
                ]
              : [{ type: 'text', text: 'done' }],
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        };
        stream.push({ type: 'done', reason: message.stopReason as 'stop' | 'toolUse', message });
        return stream;
      };
      await session.prompt('Exercise both tools.');
      expect(bashExecute).toHaveBeenCalledOnce();
      expect(bashExecute.mock.calls[0]?.[1]).toEqual({ command: 'unused command' });
      expect(customExecute).toHaveBeenCalledOnce();
      expect(customExecute.mock.calls[0]?.[1]).toEqual({ value: 'ping' });
      expect(turns).toBe(2);
    } finally {
      session?.dispose();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
