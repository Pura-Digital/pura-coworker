export const OFFICIAL_CUSTOM_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const OFFICIAL_CUSTOM_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const LEGACY_CUSTOM_ANTHROPIC_BASE_URL = 'https://open.bigmodel.cn/api/anthropic';
export const LEGACY_CUSTOM_ANTHROPIC_MODEL = 'glm-5';

export function isLegacyCustomAnthropicBaseUrl(baseUrl: string | undefined): boolean {
  const value = baseUrl?.trim() || '';
  return value === LEGACY_CUSTOM_ANTHROPIC_BASE_URL;
}

export function normalizeLegacyCustomProfileDefaults<
  T extends { baseUrl?: string; model?: string },
>(profileKey: string, profile: T): T {
  if (profileKey === 'custom:anthropic' && isLegacyCustomAnthropicBaseUrl(profile.baseUrl)) {
    const next = { ...profile, baseUrl: OFFICIAL_CUSTOM_ANTHROPIC_BASE_URL };
    if ((profile.model?.trim() || '') === LEGACY_CUSTOM_ANTHROPIC_MODEL) {
      next.model = '';
    }
    return next;
  }

  if (profileKey === 'custom:openai' && !(profile.baseUrl?.trim() || '')) {
    return { ...profile, baseUrl: OFFICIAL_CUSTOM_OPENAI_BASE_URL };
  }

  return profile;
}
