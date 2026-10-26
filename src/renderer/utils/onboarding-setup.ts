import type { AppConfig, ApiTestInput, ApiTestResult } from '../types';

export type OnboardingDefaults = Pick<
  AppConfig,
  'defaultWorkdir' | 'theme' | 'memoryEnabled' | 'anonymizationEnabled'
>;

/** Verify the chosen model before committing the first-run setup. */
export async function completeOnboarding(
  config: Partial<AppConfig>,
  defaults: OnboardingDefaults,
  test: (input: ApiTestInput) => Promise<ApiTestResult>,
  save: (config: Partial<AppConfig>) => Promise<void>,
  connectionError: string
) {
  const result = await test({
    provider: config.provider!,
    customProtocol: config.customProtocol,
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl,
    model: config.model,
    puraAuthMode: config.puraAuthMode,
    useLiveRequest: true,
  });
  if (!result.ok) throw new Error(connectionError);
  await save({ ...config, ...defaults, onboardingCompleted: true });
}

/** Legacy configured installs skip the tour until their config migration is hydrated. */
export function shouldShowOnboarding(config: AppConfig | null): boolean {
  return Boolean(config && !(config.onboardingCompleted ?? config.isConfigured));
}
