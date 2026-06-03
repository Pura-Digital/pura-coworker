import type { ProviderModelInfo } from '../../renderer/types';
import { PURA_DIGITAL_MODELS_CATALOG_URL } from '../../shared/pura-digital';

const REMOTE_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 60_000;

let cachedModels: ProviderModelInfo[] | null = null;
let cacheExpiresAt = 0;
let inflight: Promise<ProviderModelInfo[]> | null = null;

export function resetPuraDigitalModelCache(): void {
  cachedModels = null;
  cacheExpiresAt = 0;
  inflight = null;
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Failed to parse models response: ${text.substring(0, 200)}`);
  }
}

function parseModelList(data: Record<string, unknown>): ProviderModelInfo[] {
  const rawList = Array.isArray(data?.data) ? data.data : [];
  return rawList
    .map((item: unknown) => {
      const modelItem = item as { id?: unknown };
      const id = typeof modelItem?.id === 'string' ? modelItem.id.trim() : '';
      if (!id) {
        return null;
      }
      return { id, name: id };
    })
    .filter((item: ProviderModelInfo | null): item is ProviderModelInfo => Boolean(item));
}

/**
 * List text-inference models curated for Pura Digital clients via the Archiveye catalog.
 * Inference still uses the Pura Digital gateway (`llm.puradigital.it`).
 */
export async function listPuraDigitalModels(): Promise<ProviderModelInfo[]> {
  const now = Date.now();
  if (cachedModels && cacheExpiresAt > now) {
    return cachedModels;
  }

  if (inflight) {
    return inflight;
  }

  inflight = (async (): Promise<ProviderModelInfo[]> => {
    const response = await fetch(PURA_DIGITAL_MODELS_CATALOG_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
    const data = await parseJsonResponse(response);
    const models = parseModelList(data);
    cachedModels = models;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return models;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
