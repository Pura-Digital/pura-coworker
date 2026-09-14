import { describe, expect, it } from 'vitest';
import {
  LEGACY_CUSTOM_ANTHROPIC_BASE_URL,
  LEGACY_CUSTOM_ANTHROPIC_MODEL,
  OFFICIAL_CUSTOM_ANTHROPIC_BASE_URL,
  OFFICIAL_CUSTOM_OPENAI_BASE_URL,
  normalizeLegacyCustomProfileDefaults,
} from '../src/shared/custom-profile-defaults';

describe('custom profile defaults', () => {
  it('migrates legacy GLM anthropic base URL to official Anthropic endpoint', () => {
    const migrated = normalizeLegacyCustomProfileDefaults('custom:anthropic', {
      baseUrl: LEGACY_CUSTOM_ANTHROPIC_BASE_URL,
      model: LEGACY_CUSTOM_ANTHROPIC_MODEL,
    });

    expect(migrated.baseUrl).toBe(OFFICIAL_CUSTOM_ANTHROPIC_BASE_URL);
    expect(migrated.model).toBe('');
  });

  it('fills empty custom openai base URL with official OpenAI endpoint', () => {
    const migrated = normalizeLegacyCustomProfileDefaults('custom:openai', {
      baseUrl: '',
      model: '',
    });

    expect(migrated.baseUrl).toBe(OFFICIAL_CUSTOM_OPENAI_BASE_URL);
  });

  it('keeps custom third-party anthropic endpoints untouched', () => {
    const customUrl = 'https://proxy.example.com/anthropic';
    const migrated = normalizeLegacyCustomProfileDefaults('custom:anthropic', {
      baseUrl: customUrl,
      model: 'claude-sonnet-4-6',
    });

    expect(migrated.baseUrl).toBe(customUrl);
    expect(migrated.model).toBe('claude-sonnet-4-6');
  });
});
