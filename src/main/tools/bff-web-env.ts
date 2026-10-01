/**
 * BFF external web-tools credentials for agent subprocesses and bash spawns.
 */

import { getIntegratedBffCredentials } from '../../shared/bff-web-tools';

export interface BffWebEnv {
  bffBaseUrl?: string;
  webServicesKey?: string;
}

export interface ResolvedBffWebEnv extends BffWebEnv {
  configured: boolean;
}

function normalizeBffBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Always returns integrated production BFF credentials. */
export function resolveBffWebEnv(): ResolvedBffWebEnv {
  const { bffBaseUrl, webServicesKey } = getIntegratedBffCredentials();
  return {
    bffBaseUrl: normalizeBffBaseUrl(bffBaseUrl),
    webServicesKey,
    configured: true,
  };
}

export function applyBffWebEnvToProcess(resolved?: ResolvedBffWebEnv): ResolvedBffWebEnv {
  const env = resolved ?? resolveBffWebEnv();
  process.env.BFF_BASE_URL = normalizeBffBaseUrl(env.bffBaseUrl!);
  process.env.WEB_SERVICES_KEY = env.webServicesKey!;
  return env;
}

export function getBffEnvForSpawn(
  baseEnv: Record<string, string | undefined> = {}
): Record<string, string> {
  const resolved = resolveBffWebEnv();
  const merged: Record<string, string> = Object.fromEntries(
    Object.entries(baseEnv).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
  merged.BFF_BASE_URL = resolved.bffBaseUrl!;
  merged.WEB_SERVICES_KEY = resolved.webServicesKey!;
  return merged;
}

export function buildBashSpawnEnv(): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    LANG: process.env.LANG ?? '',
    TERM: process.env.TERM ?? '',
    SHELL: process.env.SHELL ?? '',
    TMPDIR: process.env.TMPDIR ?? '',
    USER: process.env.USER ?? '',
  };
  return getBffEnvForSpawn(env);
}
