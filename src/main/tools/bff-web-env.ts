/**
 * Resolve and propagate BFF external web-tools credentials for agent subprocesses.
 * Used by pi-coding-agent bash spawnHook, ToolExecutor, and native web custom tools.
 */

export interface BffWebEnv {
  bffBaseUrl?: string;
  webServicesKey?: string;
}

export interface ResolvedBffWebEnv extends BffWebEnv {
  configured: boolean;
}

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBffBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Resolve BFF credentials from optional config-store values and process.env.
 * Config values take precedence over environment when both are set.
 */
export function resolveBffWebEnv(config?: BffWebEnv): ResolvedBffWebEnv {
  const fromConfigBase = trimEnv(config?.bffBaseUrl);
  const fromConfigKey = trimEnv(config?.webServicesKey);
  const fromEnvBase = trimEnv(process.env.BFF_BASE_URL);
  const fromEnvKey = trimEnv(process.env.WEB_SERVICES_KEY);

  const bffBaseUrl = fromConfigBase ?? fromEnvBase;
  const webServicesKey = fromConfigKey ?? fromEnvKey;
  const configured = Boolean(bffBaseUrl && webServicesKey);

  return {
    bffBaseUrl: bffBaseUrl ? normalizeBffBaseUrl(bffBaseUrl) : undefined,
    webServicesKey,
    configured,
  };
}

/**
 * Write resolved BFF credentials into process.env so pi getShellEnv() and scripts see them.
 */
export function applyBffWebEnvToProcess(resolved?: ResolvedBffWebEnv): ResolvedBffWebEnv {
  const env = resolved ?? resolveBffWebEnv();
  if (env.bffBaseUrl) {
    process.env.BFF_BASE_URL = normalizeBffBaseUrl(env.bffBaseUrl);
  }
  if (env.webServicesKey) {
    process.env.WEB_SERVICES_KEY = env.webServicesKey;
  }
  return env;
}

/**
 * Minimal env slice forwarded to agent bash when BFF is configured.
 */
export function getBffEnvForSpawn(
  baseEnv: Record<string, string | undefined> = {}
): Record<string, string> {
  const resolved = resolveBffWebEnv();
  if (!resolved.configured) {
    return Object.fromEntries(
      Object.entries(baseEnv).filter((entry): entry is [string, string] => entry[1] !== undefined)
    );
  }
  const merged: Record<string, string> = Object.fromEntries(
    Object.entries(baseEnv).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
  if (resolved.bffBaseUrl) {
    merged.BFF_BASE_URL = resolved.bffBaseUrl;
  }
  if (resolved.webServicesKey) {
    merged.WEB_SERVICES_KEY = resolved.webServicesKey;
  }
  return merged;
}

/**
 * Environment for legacy ToolExecutor bash spawns (includes standard shell vars).
 */
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
