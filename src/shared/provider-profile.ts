import type { CustomProtocolType, ProviderProfileKey, ProviderType } from '../renderer/types';

/**
 * Maps stored profile keys to logical provider + protocol (same rules as config-store).
 */
export function profileKeyToProvider(profileKey: ProviderProfileKey): {
  provider: ProviderType;
  customProtocol: CustomProtocolType;
} {
  if (profileKey === 'ollama') {
    return { provider: 'ollama', customProtocol: 'openai' };
  }
  if (profileKey === 'custom:openai') {
    return { provider: 'custom', customProtocol: 'openai' };
  }
  if (profileKey === 'custom:gemini') {
    return { provider: 'custom', customProtocol: 'gemini' };
  }
  if (profileKey === 'custom:anthropic') {
    return { provider: 'custom', customProtocol: 'anthropic' };
  }
  if (profileKey === 'openai') {
    return { provider: 'openai', customProtocol: 'openai' };
  }
  if (profileKey === 'gemini') {
    return { provider: 'gemini', customProtocol: 'gemini' };
  }
  return { provider: profileKey, customProtocol: 'anthropic' };
}
