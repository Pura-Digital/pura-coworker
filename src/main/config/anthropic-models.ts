import * as crypto from 'crypto';
import type { ProviderModelInfo } from '../../renderer/types';
import { API_PROVIDER_PRESETS } from '../../shared/api-model-presets';
import {
  normalizeAnthropicBaseUrl,
  shouldAllowEmptyAnthropicApiKey,
  shouldUseAnthropicAuthToken,
} from './auth-utils';

const CACHE_TTL_MS = 10000;
const REMOTE_TIMEOUT_MS = 15000;
const LOCAL_ANTHROPIC_PLACEHOLDER_KEY = 'sk-ant-local-proxy';
const ANTHROPIC_VERSION = '2023-06-01';

interface ModelIndexResult {
  baseUrl: string;
  models: ProviderModelInfo[];
}

const cache = new Map<string, { expiresAt: number; result: ModelIndexResult }>();
const inflight = new Map<string, Promise<ModelIndexResult>>();

export function resetAnthropicModelCache(): void {
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

export function buildAnthropicModelsUrl(baseUrl: string): string {
  const trimmed = stripTrailingSlashes(baseUrl.trim() || API_PROVIDER_PRESETS.anthropic.baseUrl);
  if (trimmed.endsWith('/v1/models')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/models`;
  }
  return `${trimmed}/v1/models`;
}

function buildHeaders(
  apiKey: string,
  useAuthToken: boolean
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'anthropic-version': ANTHROPIC_VERSION,
  };
  if (useAuthToken) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Failed to parse Anthropic models response: ${text.substring(0, 200)}`);
  }
}

export async function listAnthropicModels(input: {
  provider: 'anthropic' | 'custom';
  customProtocol?: 'anthropic' | 'openai' | 'gemini';
  apiKey?: string;
  baseUrl?: string;
}): Promise<ProviderModelInfo[]> {
  const rawBaseUrl = input.baseUrl?.trim() || API_PROVIDER_PRESETS.anthropic.baseUrl;
  const baseUrl = normalizeAnthropicBaseUrl(rawBaseUrl) || rawBaseUrl;
  const apiKey = input.apiKey?.trim() || '';
  const allowEmpty = shouldAllowEmptyAnthropicApiKey({
    provider: input.provider,
    customProtocol: input.customProtocol,
    baseUrl,
  });
  const effectiveKey = apiKey || (allowEmpty ? LOCAL_ANTHROPIC_PLACEHOLDER_KEY : '');
  if (!effectiveKey) {
    throw new Error('missing_api_key');
  }

  const cacheKey = buildCacheKey(baseUrl, effectiveKey);
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
    const useAuthToken = shouldUseAnthropicAuthToken({
      provider: input.provider,
      customProtocol: input.customProtocol,
      apiKey: effectiveKey,
    });
    const response = await fetch(buildAnthropicModelsUrl(baseUrl), {
      method: 'GET',
      headers: buildHeaders(effectiveKey, useAuthToken),
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
    const data = await parseJsonResponse(response);
    const rawList = Array.isArray(data?.data) ? data.data : [];
    const models = rawList
      .map((item: unknown) => {
        const record = item as { id?: unknown; display_name?: unknown };
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        if (!id) {
          return null;
        }
        const name =
          typeof record.display_name === 'string' && record.display_name.trim()
            ? record.display_name.trim()
            : id;
        return { id, name };
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
