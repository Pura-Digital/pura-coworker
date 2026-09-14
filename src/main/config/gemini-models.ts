import * as crypto from 'crypto';
import type { ProviderModelInfo } from '../../renderer/types';

const CACHE_TTL_MS = 10000;
const REMOTE_TIMEOUT_MS = 15000;
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

interface ModelIndexResult {
  baseUrl: string;
  models: ProviderModelInfo[];
}

const cache = new Map<string, { expiresAt: number; result: ModelIndexResult }>();
const inflight = new Map<string, Promise<ModelIndexResult>>();

export function resetGeminiModelCache(): void {
  cache.clear();
  inflight.clear();
}

function buildCacheKey(baseUrl: string, apiKey: string): string {
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  return `${baseUrl}::${keyHash}`;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function buildGeminiModelsUrl(baseUrl: string): string {
  const trimmed = stripTrailingSlashes(baseUrl.trim() || DEFAULT_BASE_URL);
  if (trimmed.endsWith('/v1beta/models')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1beta')) {
    return `${trimmed}/models`;
  }
  if (trimmed.endsWith('/v1/models')) {
    return `${trimmed.replace(/\/v1\/models$/, '/v1beta/models')}`;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed.replace(/\/v1$/, '/v1beta')}/models`;
  }
  return `${trimmed}/v1beta/models`;
}

function stripModelsPrefix(name: string): string {
  return name.startsWith('models/') ? name.slice('models/'.length) : name;
}

function supportsGenerateContent(model: Record<string, unknown>): boolean {
  const methods = model.supportedGenerationMethods;
  if (Array.isArray(methods)) {
    return methods.includes('generateContent');
  }
  return true;
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Failed to parse Gemini models response: ${text.substring(0, 200)}`);
  }
}

export async function listGeminiModels(input: {
  apiKey?: string;
  baseUrl?: string;
}): Promise<ProviderModelInfo[]> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    throw new Error('missing_api_key');
  }

  const baseUrl = stripTrailingSlashes(input.baseUrl?.trim() || DEFAULT_BASE_URL);
  const cacheKey = buildCacheKey(baseUrl, apiKey);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result.models;
  }

  const existing = inflight.get(cacheKey);
  if (existing) {
    return (await existing).models;
  }

  const request = (async (): Promise<ModelIndexResult> => {
    const modelsUrl = new URL(buildGeminiModelsUrl(baseUrl));
    modelsUrl.searchParams.set('key', apiKey);

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
    const data = await parseJsonResponse(response);
    const rawList = Array.isArray(data?.models) ? data.models : [];
    const models = rawList
      .map((item: unknown) => {
        const record = item as Record<string, unknown>;
        const rawName = typeof record.name === 'string' ? record.name : '';
        const id = stripModelsPrefix(rawName);
        if (!id || !supportsGenerateContent(record)) {
          return null;
        }
        const displayName =
          typeof record.displayName === 'string' && record.displayName.trim()
            ? record.displayName.trim()
            : id;
        return { id, name: displayName };
      })
      .filter((item: ProviderModelInfo | null): item is ProviderModelInfo => Boolean(item));

    const result: ModelIndexResult = { baseUrl, models };
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    return result;
  })();

  inflight.set(cacheKey, request);
  try {
    return (await request).models;
  } finally {
    inflight.delete(cacheKey);
  }
}
