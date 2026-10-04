import { describe, expect, it } from 'vitest';
import { getModel, type AssistantMessage, type Context, type Model } from '@mariozechner/pi-ai';
import { convertMessages } from '../node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js';
import { applyPiModelRuntimeOverrides } from '../src/main/claude/pi-model-resolution';

const model = applyPiModelRuntimeOverrides(
  { ...getModel('deepseek', 'deepseek-v4-pro'), provider: 'custom' },
  { rawProvider: 'custom', configProvider: 'custom', customBaseUrl: 'https://relay.example/v1' }
) as Model<'openai-completions'>;
const compat: Parameters<typeof convertMessages>[2] = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: true,
  supportsUsageInStreaming: true,
  maxTokensField: 'max_tokens',
  requiresToolResultName: false,
  requiresAssistantAfterToolResult: false,
  requiresThinkingAsText: false,
  requiresReasoningContentOnAssistantMessages: true,
  thinkingFormat: 'deepseek',
  openRouterRouting: {},
  vercelGatewayRouting: {},
  supportsStrictMode: false,
  zaiToolStream: false,
  supportsLongCacheRetention: false,
};

function assistant(content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant',
    provider: model.provider,
    api: model.api,
    model: model.id,
    content,
    stopReason: 'stop',
    timestamp: 0,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

function replay(messages: Context['messages'], overrides = {}) {
  return convertMessages(model, { messages }, { ...compat, ...overrides }) as Array<
    Record<string, unknown>
  >;
}

describe('native DeepSeek reasoning replay (without a node_modules patch)', () => {
  it('preserves reasoning_content alongside plain assistant text', () => {
    const result = replay([
      assistant([
        { type: 'thinking', thinking: 'Reasoning', thinkingSignature: 'reasoning_content' },
        { type: 'text', text: 'Answer' },
      ]),
    ]);
    expect(result[0]).toMatchObject({
      role: 'assistant',
      content: 'Answer',
      reasoning_content: 'Reasoning',
    });
  });

  it('joins multiple thinking blocks in the reasoning field', () => {
    const result = replay([
      assistant([
        { type: 'thinking', thinking: 'First', thinkingSignature: 'reasoning_content' },
        { type: 'thinking', thinking: 'Second', thinkingSignature: 'reasoning_content' },
        { type: 'text', text: 'Answer' },
      ]),
    ]);
    expect(result[0].reasoning_content).toBe('First\nSecond');
    expect(result[0].content).toBe('Answer');
  });

  it('keeps reasoning through a tool call and result', () => {
    const result = replay([
      assistant([
        { type: 'thinking', thinking: 'Need lookup', thinkingSignature: 'reasoning_content' },
        { type: 'toolCall', id: 'call1', name: 'lookup', arguments: { query: 'ping' } },
      ]),
      {
        role: 'toolResult',
        toolCallId: 'call1',
        toolName: 'lookup',
        content: [{ type: 'text', text: 'pong' }],
        isError: false,
        timestamp: 0,
      },
    ]);
    expect(result[0].reasoning_content).toBe('Need lookup');
    expect(result[0].tool_calls).toEqual([
      {
        id: 'call1',
        type: 'function',
        function: { name: 'lookup', arguments: '{"query":"ping"}' },
      },
    ]);
    expect(result[1]).toMatchObject({ role: 'tool', tool_call_id: 'call1', content: 'pong' });
    expect(Array.isArray(result[0].content)).toBe(false);
  });

  it('injects empty reasoning when a tool-call turn has no thinking delta', () => {
    const result = replay([
      assistant([{ type: 'toolCall', id: 'call1', name: 'lookup', arguments: {} }]),
    ]);
    expect(result[0].reasoning_content).toBe('');
    expect(result[0].tool_calls).toHaveLength(1);
  });

  it('injects empty reasoning for text-only assistant history', () => {
    expect(replay([assistant([{ type: 'text', text: 'Answer' }])])[0]).toMatchObject({
      content: 'Answer',
      reasoning_content: '',
    });
  });

  it('honors disabling mandatory reasoning replay', () => {
    const result = replay([assistant([{ type: 'text', text: 'Answer' }])], {
      requiresReasoningContentOnAssistantMessages: false,
    });
    expect(result[0]).not.toHaveProperty('reasoning_content');
  });
});
