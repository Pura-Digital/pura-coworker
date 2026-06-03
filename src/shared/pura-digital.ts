import type { AppConfig, CustomProtocolType, ProviderType } from '../renderer/types';
import { profileKeyToProvider } from './provider-profile';

export const PURA_DIGITAL_HOST = 'llm.puradigital.it';
export const PURA_DIGITAL_BASE_URL = `https://${PURA_DIGITAL_HOST}/v1`;

/** Public catalog of text-inference models exposed to Pura Digital clients. */
export const PURA_DIGITAL_MODELS_CATALOG_URL = 'https://ai.archiveye.ai/public/models';

/** Default Realtime model id (OpenAI-compatible session + WS). */
export const PURA_DIGITAL_REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function isPuraDigitalBaseUrl(baseUrl: string | undefined): boolean {
  const value = baseUrl?.trim();
  if (!value) {
    return false;
  }

  try {
    const normalized = value.includes('://') ? value : `https://${value}`;
    const hostname = normalizeHostname(new URL(normalized).hostname);
    return hostname === PURA_DIGITAL_HOST;
  } catch {
    return false;
  }
}

export function isPuraDigitalActive(
  provider: ProviderType,
  customProtocol: CustomProtocolType,
  baseUrl: string | undefined
): boolean {
  return provider === 'custom' && customProtocol === 'openai' && isPuraDigitalBaseUrl(baseUrl);
}

export function isPuraDigitalFromAppConfig(cfg: AppConfig | null | undefined): boolean {
  if (!cfg) {
    return false;
  }
  const { provider, customProtocol } = profileKeyToProvider(cfg.activeProfileKey);
  const profile = cfg.profiles?.[cfg.activeProfileKey];
  const baseUrl = profile?.baseUrl ?? cfg.baseUrl;
  return isPuraDigitalActive(provider, customProtocol, baseUrl);
}

/** WebSocket URL for OpenAI-compatible Realtime (`/v1/realtime`). */
export function openAiCompatibleRealtimeWsUrl(baseUrl: string, model: string): string {
  const trimmed = baseUrl.trim();
  const withProto = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  const u = new URL(withProto);
  const path = u.pathname.replace(/\/+$/, '') || '';
  const wsPath = `${path}/realtime`;
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}${wsPath}?model=${encodeURIComponent(model)}`;
}

export type PuraRealtimeSessionResult =
  | { ok: true; clientSecret: string; websocketUrl: string; model: string }
  | { ok: false; error: string; message?: string };
