import { describe, expect, it } from 'vitest';
import {
  PURA_DIGITAL_BASE_URL,
  PURA_DIGITAL_HOST,
  openAiCompatibleRealtimeWsUrl,
  isPuraDigitalActive,
  isPuraDigitalBaseUrl,
  isPuraDigitalFromAppConfig,
} from '../src/shared/pura-digital';

describe('Pura Digital detection', () => {
  it('exports the canonical default URL pointing at the LLM gateway host', () => {
    expect(PURA_DIGITAL_HOST).toBe('llm.puradigital.it');
    expect(PURA_DIGITAL_BASE_URL).toBe('https://llm.puradigital.it/v1');
  });

  it('matches the gateway URL regardless of path or scheme variations', () => {
    expect(isPuraDigitalBaseUrl('https://llm.puradigital.it/v1')).toBe(true);
    expect(isPuraDigitalBaseUrl('https://llm.puradigital.it')).toBe(true);
    expect(isPuraDigitalBaseUrl('http://llm.puradigital.it/v1')).toBe(true);
    expect(isPuraDigitalBaseUrl('  https://llm.puradigital.it/v1  ')).toBe(true);
    expect(isPuraDigitalBaseUrl('llm.puradigital.it/v1')).toBe(true);
    expect(isPuraDigitalBaseUrl('https://LLM.PURADIGITAL.IT/v1')).toBe(true);
  });

  it('rejects unrelated hosts even on similarly named domains', () => {
    expect(isPuraDigitalBaseUrl(undefined)).toBe(false);
    expect(isPuraDigitalBaseUrl('')).toBe(false);
    expect(isPuraDigitalBaseUrl('https://api.puradigital.it/v1')).toBe(false);
    expect(isPuraDigitalBaseUrl('https://puradigital.it/v1')).toBe(false);
    expect(isPuraDigitalBaseUrl('https://llm.puradigital.it.evil.com/v1')).toBe(false);
    expect(isPuraDigitalBaseUrl('https://api.openai.com/v1')).toBe(false);
  });

  it('only flags Pura mode when provider is custom + openai protocol on the gateway URL', () => {
    expect(isPuraDigitalActive('custom', 'openai', PURA_DIGITAL_BASE_URL)).toBe(true);
    expect(isPuraDigitalActive('custom', 'openai', 'https://llm.puradigital.it')).toBe(true);
    expect(isPuraDigitalActive('custom', 'anthropic', PURA_DIGITAL_BASE_URL)).toBe(false);
    expect(isPuraDigitalActive('custom', 'gemini', PURA_DIGITAL_BASE_URL)).toBe(false);
    expect(isPuraDigitalActive('openai', 'openai', PURA_DIGITAL_BASE_URL)).toBe(false);
    expect(isPuraDigitalActive('custom', 'openai', 'https://api.deepseek.com/v1')).toBe(false);
  });

  it('detects Pura mode from full app config projection', () => {
    expect(
      isPuraDigitalFromAppConfig({
        activeProfileKey: 'custom:openai',
        profiles: {
          'custom:openai': {
            apiKey: 'x',
            baseUrl: PURA_DIGITAL_BASE_URL,
            model: 'gpt-4o-mini',
          },
        },
        provider: 'custom',
        apiKey: '',
        model: '',
      } as import('../src/renderer/types').AppConfig)
    ).toBe(true);

    expect(
      isPuraDigitalFromAppConfig({
        activeProfileKey: 'openai',
        profiles: {},
        provider: 'openai',
        apiKey: '',
        baseUrl: PURA_DIGITAL_BASE_URL,
        model: '',
      } as import('../src/renderer/types').AppConfig)
    ).toBe(false);
  });

  it('builds OpenAI-compatible realtime websocket URLs', () => {
    expect(openAiCompatibleRealtimeWsUrl('https://llm.puradigital.it/v1', 'gpt-test')).toBe(
      'wss://llm.puradigital.it/v1/realtime?model=gpt-test'
    );
  });
});
