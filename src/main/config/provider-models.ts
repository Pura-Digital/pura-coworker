import type { ProviderModelInfo } from '../../renderer/types';
import type { CustomProtocolType, ProviderType } from './config-store';
import { API_PROVIDER_PRESETS } from '../../shared/api-model-presets';

export interface ListProviderModelsInput {
  provider: ProviderType;
  customProtocol?: CustomProtocolType;
  apiKey?: string;
  baseUrl?: string;
}

function isOpenAICompatible(input: ListProviderModelsInput): boolean {
  return (
    input.provider === 'openai' ||
    input.provider === 'openrouter' ||
    (input.provider === 'custom' && input.customProtocol === 'openai')
  );
}

function isAnthropicCompatible(input: ListProviderModelsInput): boolean {
  return (
    input.provider === 'anthropic' ||
    (input.provider === 'custom' && input.customProtocol === 'anthropic')
  );
}

function isGeminiCompatible(input: ListProviderModelsInput): boolean {
  return (
    input.provider === 'gemini' ||
    (input.provider === 'custom' && input.customProtocol === 'gemini')
  );
}

function resolveDiscoveryBaseUrl(input: ListProviderModelsInput): string {
  const raw = input.baseUrl?.trim();
  if (raw) {
    return raw;
  }
  if (input.provider !== 'custom') {
    return API_PROVIDER_PRESETS[input.provider]?.baseUrl || '';
  }
  return '';
}

export async function listProviderModels(
  input: ListProviderModelsInput
): Promise<ProviderModelInfo[]> {
  if (input.provider === 'ollama') {
    const { listOllamaModels } = await import('./ollama-api');
    return listOllamaModels({
      apiKey: input.apiKey || '',
      baseUrl: input.baseUrl,
    });
  }

  if (isGeminiCompatible(input)) {
    const { listGeminiModels } = await import('./gemini-models');
    return listGeminiModels({
      apiKey: input.apiKey,
      baseUrl: resolveDiscoveryBaseUrl(input),
    });
  }

  if (isOpenAICompatible(input)) {
    const { listOpenAICompatibleModels } = await import('./openai-compat-models');
    return listOpenAICompatibleModels({
      baseUrl: resolveDiscoveryBaseUrl(input),
      apiKey: input.apiKey,
    });
  }

  if (isAnthropicCompatible(input)) {
    const { listAnthropicModels } = await import('./anthropic-models');
    return listAnthropicModels({
      provider: input.provider === 'anthropic' ? 'anthropic' : 'custom',
      customProtocol: input.customProtocol,
      apiKey: input.apiKey,
      baseUrl: resolveDiscoveryBaseUrl(input),
    });
  }

  return [];
}
