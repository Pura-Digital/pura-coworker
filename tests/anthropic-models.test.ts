import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAnthropicModelsUrl,
  listAnthropicModels,
  resetAnthropicModelCache,
} from '../src/main/config/anthropic-models';

describe('anthropic models discovery', () => {
  beforeEach(() => {
    resetAnthropicModelCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    resetAnthropicModelCache();
    vi.unstubAllGlobals();
  });

  it('builds the v1 models endpoint from the official base URL', () => {
    expect(buildAnthropicModelsUrl('https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/models'
    );
  });

  it('lists models from the Anthropic REST API', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [
            { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
            { id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6' },
          ],
        }),
    } as Response);

    const models = await listAnthropicModels({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      baseUrl: 'https://api.anthropic.com',
    });

    expect(models).toEqual([
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test',
          'anthropic-version': '2023-06-01',
        }),
      })
    );
  });

  it('throws when api key is missing', async () => {
    await expect(
      listAnthropicModels({
        provider: 'anthropic',
        apiKey: '',
      })
    ).rejects.toThrow(/missing_api_key/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
