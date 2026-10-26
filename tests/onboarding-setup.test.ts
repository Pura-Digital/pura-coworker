import { describe, expect, it, vi } from 'vitest';
import { completeOnboarding, shouldShowOnboarding } from '../src/renderer/utils/onboarding-setup';
import type { AppConfig, ApiTestResult } from '../src/renderer/types';

const config: Partial<AppConfig> = {
  provider: 'custom',
  customProtocol: 'openai',
  apiKey: 'example-key',
  baseUrl: 'https://example.com/v1',
  model: 'chosen-model',
};
const defaults = {
  defaultWorkdir: '/work/reports',
  theme: 'system' as const,
  memoryEnabled: true,
  anonymizationEnabled: false,
};

describe('first-run setup', () => {
  it('verifies the selected model before saving credentials and all defaults together', async () => {
    const order: string[] = [];
    const test = vi.fn(async () => {
      order.push('test');
      return { ok: true };
    });
    const save = vi.fn(async () => {
      order.push('save');
    });
    await completeOnboarding(config, defaults, test, save, 'Connection failed');
    expect(order).toEqual(['test', 'save']);
    expect(test).toHaveBeenCalledWith({ ...config, useLiveRequest: true });
    expect(save).toHaveBeenCalledWith({ ...config, ...defaults, onboardingCompleted: true });
  });

  it.each(['unauthorized', 'network_error', 'not_found'] as const)(
    'does not save after %s',
    async (errorType) => {
      const test = vi.fn(async (): Promise<ApiTestResult> => ({ ok: false, errorType }));
      const save = vi.fn();
      await expect(
        completeOnboarding(config, defaults, test, save, 'Connection failed')
      ).rejects.toThrow('Connection failed');
      expect(save).not.toHaveBeenCalled();
    }
  );

  it('preserves a save failure so the onboarding can show it and allow a retry', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Disk unavailable'));
    await expect(
      completeOnboarding(config, defaults, async () => ({ ok: true }), save, 'Connection failed')
    ).rejects.toThrow('Disk unavailable');
  });

  it('supports a local model without an API key', async () => {
    const test = vi.fn(async () => ({ ok: true }));
    const save = vi.fn(async () => {});
    await completeOnboarding(
      { provider: 'ollama', model: 'local-model', baseUrl: 'http://localhost:11434/v1' },
      defaults,
      test,
      save,
      'Connection failed'
    );
    expect(test).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'ollama', apiKey: '', model: 'local-model' })
    );
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('onboarding visibility', () => {
  it('waits for the persisted configuration to load', () => {
    expect(shouldShowOnboarding(null)).toBe(false);
  });
  it('does not repeat for legacy configured users', () => {
    expect(shouldShowOnboarding({ ...config, isConfigured: true } as AppConfig)).toBe(false);
  });
  it('does not repeat when credentials are removed after completion', () => {
    expect(
      shouldShowOnboarding({
        ...config,
        isConfigured: false,
        onboardingCompleted: true,
      } as AppConfig)
    ).toBe(false);
  });
  it('requires completion on an unfinished installation even with credentials', () => {
    expect(
      shouldShowOnboarding({
        ...config,
        isConfigured: true,
        onboardingCompleted: false,
      } as AppConfig)
    ).toBe(true);
  });
});
