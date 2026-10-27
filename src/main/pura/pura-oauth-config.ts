import {
  DEFAULT_PURA_CONNECT_CLIENT_ID,
  PURA_CONNECT_REDIRECT_URI,
} from '../../shared/pura-connect';

const DEFAULT_API_BASE = 'https://ai.puradigital.it/v1';

function pickEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

export function getPuraClientConfig() {
  // Vite bakes these public OAuth settings into the packaged main process.
  // Finder launches do not inherit the development shell's .env file.
  const clientId =
    pickEnv('VITE_PURA_CONNECT_CLIENT_ID', 'VITE_PURA_CLIENT_ID') ||
    import.meta.env.VITE_PURA_CONNECT_CLIENT_ID?.trim() ||
    import.meta.env.VITE_PURA_CLIENT_ID?.trim() ||
    DEFAULT_PURA_CONNECT_CLIENT_ID;
  const apiBase =
    pickEnv('VITE_PURA_OAUTH_API_BASE', 'VITE_PURA_API_BASE') ||
    import.meta.env.VITE_PURA_OAUTH_API_BASE?.trim() ||
    import.meta.env.VITE_PURA_API_BASE?.trim() ||
    DEFAULT_API_BASE;
  const redirectUri =
    pickEnv('VITE_PURA_CONNECT_REDIRECT_URI', 'VITE_PURA_REDIRECT_URI') ||
    import.meta.env.VITE_PURA_CONNECT_REDIRECT_URI?.trim() ||
    import.meta.env.VITE_PURA_REDIRECT_URI?.trim() ||
    PURA_CONNECT_REDIRECT_URI;
  return { clientId, apiBase, redirectUri };
}

export function isPuraConnectConfigured(): boolean {
  return Boolean(getPuraClientConfig().clientId);
}

export function getPuraInferenceBaseUrl(): string {
  const { apiBase } = getPuraClientConfig();
  return `${apiBase.replace(/\/$/, '')}/integrations/inference`;
}
