export type SharedProviderType =
  | 'openrouter'
  | 'anthropic'
  | 'custom'
  | 'openai'
  | 'gemini'
  | 'ollama';

export type SharedCustomProtocolType = 'anthropic' | 'openai' | 'gemini';

export interface SharedProviderPreset {
  name: string;
  baseUrl: string;
  models: Array<{ id: string; name: string }>;
  keyPlaceholder: string;
  keyHint: string;
}

export interface SharedProviderPresets {
  openrouter: SharedProviderPreset;
  anthropic: SharedProviderPreset;
  custom: SharedProviderPreset;
  openai: SharedProviderPreset;
  gemini: SharedProviderPreset;
  ollama: SharedProviderPreset;
}

export interface ModelInputGuidance {
  placeholder: string;
  hint: string;
}

export const API_PROVIDER_PRESETS: SharedProviderPresets = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
    keyPlaceholder: 'sk-or-v1-...',
    keyHint: 'openrouter.ai/keys',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [],
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'console.anthropic.com',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [],
    keyPlaceholder: 'sk-...',
    keyHint: 'platform.openai.com',
  },
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: [],
    keyPlaceholder: 'AIza...',
    keyHint: 'aistudio.google.com',
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: [],
    keyPlaceholder: 'sk-ollama-local-proxy',
    keyHint: 'Ollama API Key',
  },
  custom: {
    name: 'Custom',
    baseUrl: '',
    models: [],
    keyPlaceholder: 'sk-xxx',
    keyHint: 'your API Key',
  },
};

export function getModelInputGuidance(
  provider: SharedProviderType,
  customProtocol: SharedCustomProtocolType = 'openai'
): ModelInputGuidance {
  if (provider === 'openrouter') {
    return {
      placeholder: 'openai/gpt-4o, anthropic/claude-sonnet-4-6, google/gemini-2.0-flash',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'custom' && customProtocol === 'openai') {
    return {
      placeholder: 'deepseek-chat, deepseek-reasoner, qwen-max, gpt-4o-mini',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'custom' && customProtocol === 'gemini') {
    return {
      placeholder: 'gemini-2.0-flash, gemini-1.5-pro',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'custom' && customProtocol === 'anthropic') {
    return {
      placeholder: 'claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'openai') {
    return {
      placeholder: 'gpt-4o, gpt-4o-mini, o3-mini',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  if (provider === 'ollama') {
    return {
      placeholder: 'qwen3.5:0.8b, llama3.2:latest, deepseek-r1:latest',
      hint: 'Use the exact model ID returned by your Ollama server.',
    };
  }

  if (provider === 'gemini') {
    return {
      placeholder: 'gemini-2.0-flash, gemini-1.5-pro',
      hint: 'Use the exact model ID for the selected protocol or endpoint.',
    };
  }

  return {
    placeholder: 'claude-sonnet-4-6, claude-opus-4-6',
    hint: 'Use the exact model ID for the selected protocol or endpoint.',
  };
}
