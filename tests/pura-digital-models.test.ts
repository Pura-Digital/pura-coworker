import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listPuraDigitalModels,
  resetPuraDigitalModelCache,
} from '../src/main/config/pura-digital-models';
import { PURA_DIGITAL_MODELS_CATALOG_URL } from '../src/shared/pura-digital';

describe('Pura Digital model catalog', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetPuraDigitalModelCache();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('lists models from the Archiveye public catalog without authorization', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          object: 'list',
          data: [
            { id: 'gpt-5.4', object: 'model' },
            { id: 'deepseek-v3.2', object: 'model' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const models = await listPuraDigitalModels();

    expect(models).toEqual([
      { id: 'gpt-5.4', name: 'gpt-5.4' },
      { id: 'deepseek-v3.2', name: 'deepseek-v3.2' },
    ]);

    const [calledUrl, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(calledUrl).toBe(PURA_DIGITAL_MODELS_CATALOG_URL);
    const headers = (init?.headers as Record<string, string>) || {};
    expect(headers.Accept).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();
  });

  it('surfaces the catalog error body on non-2xx responses', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'catalog unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(listPuraDigitalModels()).rejects.toThrow(/catalog unavailable/i);
  });

  it('caches successive calls within the TTL window', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'kimi-k2.6', object: 'model' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const first = await listPuraDigitalModels();
    const second = await listPuraDigitalModels();

    expect(first).toEqual([{ id: 'kimi-k2.6', name: 'kimi-k2.6' }]);
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
