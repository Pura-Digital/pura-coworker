import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildGeminiModelsUrl,
  listGeminiModels,
  resetGeminiModelCache,
} from '../src/main/config/gemini-models';

describe('gemini models discovery', () => {
  beforeEach(() => {
    resetGeminiModelCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    resetGeminiModelCache();
    vi.unstubAllGlobals();
  });

  it('builds the v1beta models endpoint from the official base URL', () => {
    expect(buildGeminiModelsUrl('https://generativelanguage.googleapis.com')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models'
    );
    expect(buildGeminiModelsUrl('https://generativelanguage.googleapis.com/')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models'
    );
  });

  it('lists generateContent-capable models from the Gemini REST API', async () => {
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
            {
              name: 'models/embedding-001',
              displayName: 'Embedding 001',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
        }),
    } as Response);

    const models = await listGeminiModels({
      apiKey: 'AIza-test',
      baseUrl: 'https://generativelanguage.googleapis.com',
    });

    expect(models).toEqual([{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://generativelanguage.googleapis.com/v1beta/models?key=AIza-test',
      }),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('throws when api key is missing', async () => {
    await expect(listGeminiModels({ apiKey: '' })).rejects.toThrow(/missing_api_key/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
