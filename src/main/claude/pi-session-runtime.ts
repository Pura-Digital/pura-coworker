import { createHash } from 'node:crypto';
import type { StreamFn } from '@mariozechner/pi-agent-core';
import { withPiStreamCompatibility } from './pi-stream-compat';

const providerStreams = new WeakMap<{ streamFn: StreamFn }, StreamFn>();

/** Toggle wrappers without replacing the SDK's authentication and request options. */
export function configurePiAgentStream(
  agent: { streamFn: StreamFn },
  wrap?: (original: StreamFn) => StreamFn
): void {
  let original = providerStreams.get(agent);
  if (!original) {
    original = withPiStreamCompatibility(agent.streamFn);
    providerStreams.set(agent, original);
  }
  agent.streamFn = wrap ? wrap(original) : original;
}

export interface PiSessionRuntimeSignatureInput {
  configProvider?: string;
  customProtocol?: string;
  modelProvider?: string;
  modelApi?: string;
  modelBaseUrl?: string;
  effectiveCwd?: string;
  apiKey?: string;
  anonymizationEnabled?: boolean;
}

function normalizeText(value: string | undefined): string {
  return value?.trim() || '';
}

function fingerprintSecret(value: string | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }
  return createHash('sha256').update(normalized).digest('hex');
}

export function buildPiSessionRuntimeSignature(input: PiSessionRuntimeSignatureInput): string {
  return JSON.stringify({
    configProvider: normalizeText(input.configProvider),
    anonymizationEnabled: input.anonymizationEnabled === true,
    customProtocol: normalizeText(input.customProtocol),
    modelProvider: normalizeText(input.modelProvider),
    modelApi: normalizeText(input.modelApi),
    modelBaseUrl: normalizeText(input.modelBaseUrl).replace(/\/+$/, ''),
    effectiveCwd: normalizeText(input.effectiveCwd),
    apiKeyFingerprint: fingerprintSecret(input.apiKey),
  });
}
