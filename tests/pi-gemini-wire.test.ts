import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamSimple } from '@mariozechner/pi-ai';
import {
  applyPiModelRuntimeOverrides,
  buildSyntheticPiModel,
} from '../src/main/claude/pi-model-resolution';
import { withPiStreamCompatibility } from '../src/main/claude/pi-stream-compat';

afterEach(() => vi.restoreAllMocks());

describe('Gemini inference through the installed SDK', () => {
  it.each([
    ['gemini-3.8-flash', undefined, 'LOW'],
    ['gemini-3.8-flash', 'minimal', 'LOW'],
    ['gemini-3.8-flash', 'medium', 'MEDIUM'],
    ['gemini-3.8-flash', 'high', 'HIGH'],
    ['gemini-3.7-flash', undefined, 'LOW'],
    ['gemini-3.6-flash', undefined, 'MINIMAL'],
  ] as const)('sends a supported thinking level for %s / %s', async (id, reasoning, expected) => {
    let sent: {
      generationConfig?: { thinkingConfig?: { thinkingLevel?: string }; temperature?: number };
    } = {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(
        'data: ' +
          JSON.stringify({
            candidates: [
              { content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' },
            ],
          }) +
          '\n\n',
        { headers: { 'content-type': 'text/event-stream' } }
      );
    });
    const model = applyPiModelRuntimeOverrides(
      buildSyntheticPiModel(id, 'gemini', 'gemini', 'https://generativelanguage.googleapis.com')
    );
    const hook = vi.fn((payload: unknown) => {
      const params = payload as { config: Record<string, unknown> };
      return { ...params, config: { ...params.config, temperature: 0.2 } };
    });
    const response = await (
      await withPiStreamCompatibility(streamSimple)(
        model,
        {
          messages: [{ role: 'user', content: 'ok', timestamp: 1 }],
        },
        { apiKey: 'test-unused', reasoning, onPayload: hook }
      )
    ).result();
    expect(response.stopReason).toBe('stop');
    expect(model.reasoning).toBe(true);
    expect(sent.generationConfig?.thinkingConfig?.thinkingLevel).toBe(expected);
    expect(sent.generationConfig?.temperature).toBe(0.2);
    expect(hook).toHaveBeenCalledOnce();
  });

  it.each(['gemini', 'custom'])(
    'serializes a versioned request for an unknown %s model',
    async (provider) => {
      const requests: { url: string; body: Record<string, unknown> }[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        requests.push({
          url: input instanceof Request ? input.url : String(input),
          body: JSON.parse(String(init?.body)),
        });
        return new Response(
          'data: ' +
            JSON.stringify({
              candidates: [
                { content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' },
              ],
            }) +
            '\n\n',
          { headers: { 'content-type': 'text/event-stream' } }
        );
      });
      const model = applyPiModelRuntimeOverrides(
        buildSyntheticPiModel(
          'gemini-new-flash',
          'gemini',
          'gemini',
          'https://generativelanguage.googleapis.com'
        ),
        {
          rawProvider: provider,
          customProtocol: 'gemini',
          customBaseUrl: 'https://generativelanguage.googleapis.com',
        }
      );
      const result = await streamSimple(
        model,
        {
          messages: [{ role: 'user', content: 'Rispondi ok', timestamp: 1 }],
        },
        { apiKey: 'test-unused' }
      ).result();
      expect(result.stopReason).toBe('stop');
      expect(result.content).toEqual([expect.objectContaining({ type: 'text', text: 'ok' })]);
      expect(requests).toHaveLength(1);
      expect(new URL(requests[0].url).pathname).toBe(
        '/v1beta/models/gemini-new-flash:streamGenerateContent'
      );
      expect(requests[0].body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Rispondi ok' }] },
      ]);
    }
  );
});
