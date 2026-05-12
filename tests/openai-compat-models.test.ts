import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listOpenAICompatibleModels,
  normalizeOpenAICompatibleDiscoveryUrl,
  resetOpenAICompatibleModelCache,
} from '../src/main/config/openai-compat-models';

describe('openai-compatible model discovery', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetOpenAICompatibleModelCache();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('normalizes discovery URLs by adding scheme and stripping trailing slashes', () => {
    expect(normalizeOpenAICompatibleDiscoveryUrl('llm.puradigital.it/v1')).toBe(
      'https://llm.puradigital.it/v1'
    );
    expect(normalizeOpenAICompatibleDiscoveryUrl('https://llm.puradigital.it/v1/')).toBe(
      'https://llm.puradigital.it/v1'
    );
    expect(normalizeOpenAICompatibleDiscoveryUrl('https://llm.puradigital.it/v1///')).toBe(
      'https://llm.puradigital.it/v1'
    );
    expect(normalizeOpenAICompatibleDiscoveryUrl('  ')).toBe('');
    expect(normalizeOpenAICompatibleDiscoveryUrl(undefined)).toBe('');
  });

  it('lists models from a Pura Digital gateway with bearer authorization', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          object: 'list',
          data: [
            { id: 'pura-gpt-5', object: 'model' },
            { id: 'pura-claude-sonnet', object: 'model' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const models = await listOpenAICompatibleModels({
      baseUrl: 'https://llm.puradigital.it/v1',
      apiKey: 'sk-pura-test',
    });

    expect(models).toEqual([
      { id: 'pura-gpt-5', name: 'pura-gpt-5' },
      { id: 'pura-claude-sonnet', name: 'pura-claude-sonnet' },
    ]);

    const [calledUrl, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(calledUrl).toBe('https://llm.puradigital.it/v1/models');
    const headers = (init?.headers as Record<string, string>) || {};
    expect(headers.Authorization).toBe('Bearer sk-pura-test');
    expect(headers.Accept).toBe('application/json');
  });

  it('throws missing_base_url when no baseUrl is provided', async () => {
    await expect(listOpenAICompatibleModels({ baseUrl: '', apiKey: 'sk-test' })).rejects.toThrow(
      'missing_base_url'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces the gateway error body on non-2xx responses', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'invalid api key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      listOpenAICompatibleModels({
        baseUrl: 'https://llm.puradigital.it/v1',
        apiKey: 'sk-bad',
      })
    ).rejects.toThrow(/invalid api key/i);
  });

  it('caches successive calls within the TTL window for the same key+url pair', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'pura-mini', object: 'model' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const first = await listOpenAICompatibleModels({
      baseUrl: 'https://llm.puradigital.it/v1',
      apiKey: 'sk-pura',
    });
    const second = await listOpenAICompatibleModels({
      baseUrl: 'https://llm.puradigital.it/v1',
      apiKey: 'sk-pura',
    });

    expect(first).toEqual([{ id: 'pura-mini', name: 'pura-mini' }]);
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
