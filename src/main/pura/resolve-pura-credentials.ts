import type { AppConfig } from '../config/config-store';
import { configStore } from '../config/config-store';
import { isPuraDigitalActive } from '../../shared/pura-digital';
import { isPuraAuthMode, type PuraAuthMode } from '../../shared/pura-connect';
import * as puraOAuthManager from './pura-oauth-manager';
import { getPuraInferenceBaseUrl } from './pura-oauth-config';

export type PuraCredentialResolution =
  | { active: false }
  | {
      active: true;
      configSetId: string;
      mode: PuraAuthMode;
      inferenceBaseUrl?: string;
      accessToken?: string;
    };

function resolveAuthModeForSet(
  set: AppConfig['configSets'][number] | undefined
): PuraAuthMode | undefined {
  if (!set) return undefined;
  if (isPuraAuthMode(set.puraAuthMode)) {
    return set.puraAuthMode;
  }
  const provider = set.provider;
  const protocol = set.customProtocol;
  const profile = set.profiles?.[set.activeProfileKey];
  const baseUrl = profile?.baseUrl;
  if (!isPuraDigitalActive(provider, protocol, baseUrl)) {
    return undefined;
  }
  const apiKey = profile?.apiKey?.trim();
  return apiKey ? 'apiKey' : 'subscription';
}

export function resolvePuraCredentialsForConfig(
  config: AppConfig = configStore.getAll()
): PuraCredentialResolution {
  const setId = config.activeConfigSetId;
  const set = config.configSets.find((item) => item.id === setId);
  if (!set) {
    return { active: false };
  }

  const provider = set.provider;
  const protocol = set.customProtocol;
  const profile = set.profiles?.[set.activeProfileKey];
  const baseUrl = profile?.baseUrl;
  if (!isPuraDigitalActive(provider, protocol, baseUrl)) {
    return { active: false };
  }

  const mode = resolveAuthModeForSet(set) ?? 'subscription';
  if (mode === 'subscription') {
    const connection = puraOAuthManager.getConnectionState(setId);
    if (!connection.connected) {
      return { active: true, configSetId: setId, mode };
    }
    return {
      active: true,
      configSetId: setId,
      mode,
      inferenceBaseUrl: getPuraInferenceBaseUrl(),
      accessToken: undefined, // refreshed async via getAccessTokenForSet
    };
  }

  return { active: true, configSetId: setId, mode };
}

export async function resolvePuraCredentialsAsync(
  config: AppConfig = configStore.getAll()
): Promise<PuraCredentialResolution> {
  const base = resolvePuraCredentialsForConfig(config);
  if (!base.active || base.mode !== 'subscription') {
    return base;
  }
  const connection = puraOAuthManager.getConnectionState(base.configSetId);
  if (!connection.connected) {
    return base;
  }
  const { getAccessTokenForSet } = await import('./pura-inference-service');
  const accessToken = await getAccessTokenForSet(base.configSetId);
  return {
    ...base,
    accessToken: accessToken ?? undefined,
  };
}
