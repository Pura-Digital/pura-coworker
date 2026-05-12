import * as crypto from 'crypto';
import type { ProviderModelInfo } from '../../renderer/types';

const REMOTE_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 10000;

interface ModelIndexResult {
  baseUrl: string;
  models: ProviderModelInfo[];
}

const cache = new Map<string, { expiresAt: number; result: ModelIndexResult }>();
const inflight = new Map<string, Promise<ModelIndexResult>>();

export function resetOpenAICompatibleModelCache(): void {
  cache.clear();
  inflight.clear();
}

function buildCacheKey(baseUrl: string, apiKey: string | undefined): string {
  const trimmedKey = apiKey?.trim() || '';
  const keyHash = trimmedKey
    ? crypto.createHash('sha256').update(trimmedKey).digest('hex').slice(0, 16)
    : '';
  return `${baseUrl}::${keyHash}`;
}

function buildHeaders(apiKey: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const trimmedApiKey = apiKey?.trim();
  if (trimmedApiKey) {
    headers.Authorization = `Bearer ${trimmedApiKey}`;
  }
  return headers;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Resolve the effective base URL for OpenAI-compatible providers.
 * - Adds an https:// scheme when missing.
 * - Strips trailing slashes.
 * - Does NOT force a /v1 suffix: the caller (or LiteLLM gateway) is responsible
 *   for returning a URL whose `${baseUrl}/models` endpoint is valid.
 */
export function normalizeOpenAICompatibleDiscoveryUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return '';
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return stripTrailingSlashes(withScheme);
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

export async function listOpenAICompatibleModels(input: {
  baseUrl: string;
  apiKey?: string;
}): Promise<ProviderModelInfo[]> {
  const baseUrl = normalizeOpenAICompatibleDiscoveryUrl(input.baseUrl);
  if (!baseUrl) {
    throw new Error('missing_base_url');
  }

  const cacheKey = buildCacheKey(baseUrl, input.apiKey);
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
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: buildHeaders(input.apiKey),
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
    const data = await parseJsonResponse(response);
    const rawList = Array.isArray(data?.data) ? data.data : [];
    const models = rawList
      .map((item: unknown) => {
        const modelItem = item as { id?: unknown };
        const id = typeof modelItem?.id === 'string' ? modelItem.id.trim() : '';
        if (!id) {
          return null;
        }
        return { id, name: id };
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
