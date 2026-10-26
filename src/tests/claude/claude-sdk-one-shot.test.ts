import { beforeEach, describe, expect, it, vi } from 'vitest';

const completeSimpleMock = vi.hoisted(() => vi.fn());
const privacy = vi.hoisted(() => ({
  run: undefined as { chatId: string; enabled: boolean } | undefined,
  status: vi.fn(),
  stream: vi.fn(),
}));
vi.mock('../../main/anonymization/gateway', () => ({
  anonymizationContext: { getStore: () => privacy.run },
  getAnonymizationGateway: () => ({ service: { status: privacy.status }, stream: privacy.stream }),
}));

vi.mock('@mariozechner/pi-ai', () => ({
  completeSimple: completeSimpleMock,
  getModel: vi.fn(() => undefined),
}));

vi.mock('../../main/claude/shared-auth', () => ({
  getSharedAuthStorage: () => ({
    setRuntimeApiKey: vi.fn(),
  }),
  ModelRegistry: vi.fn(),
}));

import type { AppConfig } from '../../main/config/config-store';
import { runPiAiOneShot } from '../../main/claude/claude-sdk-one-shot';

function makeConfig(): AppConfig {
  return {
    provider: 'custom',
    customProtocol: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1',
    model: 'test-model',
    activeProfileKey: 'custom:openai',
    profiles: {},
    activeConfigSetId: 'default',
    configSets: [],
    claudeCodePath: '',
    defaultWorkdir: '',
    globalSkillsPath: '',
    enableDevLogs: false,
    theme: 'light',
    sandboxEnabled: false,
    memoryEnabled: true,
    memoryRuntime: {
      llm: {
        inheritFromActive: true,
        apiKey: '',
        baseUrl: '',
        model: '',
        timeoutMs: 180000,
      },
      embedding: {
        inheritFromActive: true,
        apiKey: '',
        baseUrl: '',
        model: 'text-embedding-3-small',
        timeoutMs: 180000,
      },
      useEmbedding: false,
      maxNavSteps: 2,
      ingestionConcurrency: 4,
      storageRoot: '',
      evalEnabled: false,
      evalWorkspaces: [],
      evalMaxRounds: 12,
      evalArtifactsRoot: '',
      promptIterationRounds: 2,
    },
    enableThinking: false,
    uiZoom: 1,
    alwaysOn: false,
    launchAtStartup: false,
    isConfigured: true,
  };
}

describe('runPiAiOneShot', () => {
  beforeEach(() => {
    privacy.run = undefined;
    privacy.status.mockReset().mockReturnValue({ service: 'ready' });
    privacy.stream.mockReset();
    completeSimpleMock.mockReset();
    completeSimpleMock.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      stopReason: 'stop',
    });
  });

  it('suspends protected auxiliary completions when the service is unavailable without reopening a decision', async () => {
    privacy.run = { chatId: 'chat', enabled: true };
    privacy.status.mockReturnValue({ service: 'error' });
    await expect(runPiAiOneShot('title', 'system', makeConfig())).rejects.toThrow(
      'ausiliaria sospesa'
    );
    expect(privacy.stream).not.toHaveBeenCalled();
    expect(completeSimpleMock).not.toHaveBeenCalled();
  });

  it('passes generation options through to completeSimple', async () => {
    await runPiAiOneShot('hello', 'system', makeConfig(), {
      temperature: 0.2,
      maxTokens: 1234,
    });

    expect(completeSimpleMock).toHaveBeenCalledTimes(1);
    expect(completeSimpleMock.mock.calls[0][2]).toMatchObject({
      apiKey: 'test-key',
      temperature: 0.2,
      maxTokens: 1234,
    });
  });
});
