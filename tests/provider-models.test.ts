import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listProviderModels } from '../src/main/config/provider-models';
import { resetGeminiModelCache } from '../src/main/config/gemini-models';
import { resetOpenAICompatibleModelCache } from '../src/main/config/openai-compat-models';

describe('listProviderModels', () => {
  beforeEach(() => {
    resetGeminiModelCache();
    resetOpenAICompatibleModelCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    resetGeminiModelCache();
    resetOpenAICompatibleModelCache();
    vi.unstubAllGlobals();
  });

  it('routes gemini custom protocol to the Gemini REST models API', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.0-flash',
              displayName: 'Gemini 2.0 Flash',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
    } as Response);

    const models = await listProviderModels({
      provider: 'custom',
      customProtocol: 'gemini',
      apiKey: 'AIza-test',
      baseUrl: 'https://generativelanguage.googleapis.com',
    });

    expect(models).toEqual([{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }]);
  });

  it('does not route custom providers without an explicit protocol to Anthropic', async () => {
    const models = await listProviderModels({
      provider: 'custom',
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
    });

    expect(models).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('routes openai-compatible providers to GET /models', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }],
        }),
    } as Response);

    const models = await listProviderModels({
      provider: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
    });

    expect(models).toEqual([
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
      { id: 'gpt-4o', name: 'gpt-4o' },
    ]);
  });
});
