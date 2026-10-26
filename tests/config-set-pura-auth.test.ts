import { describe, expect, it } from 'vitest';
import { inferPuraAuthModeForDigitalSet } from '../src/shared/pura-connect';

describe('config set pura auth mode', () => {
  it('defaults subscription when no api key on pura digital set', () => {
    expect(
      inferPuraAuthModeForDigitalSet({
        provider: 'custom',
        customProtocol: 'openai',
        baseUrl: 'https://llm.puradigital.it/v1',
        apiKey: '',
      })
    ).toBe('subscription');
  });

  it('defaults apiKey for legacy sets with a platform key', () => {
    expect(
      inferPuraAuthModeForDigitalSet({
        provider: 'custom',
        customProtocol: 'openai',
        baseUrl: 'https://llm.puradigital.it/v1',
        apiKey: 'sk-test',
      })
    ).toBe('apiKey');
  });

  it('respects explicit puraAuthMode', () => {
    expect(
      inferPuraAuthModeForDigitalSet({
        puraAuthMode: 'subscription',
        provider: 'custom',
        customProtocol: 'openai',
        baseUrl: 'https://llm.puradigital.it/v1',
        apiKey: 'sk-test',
      })
    ).toBe('subscription');
  });
});
