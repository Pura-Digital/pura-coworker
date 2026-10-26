import { PURA_CONNECT_REDIRECT_URI } from '../../shared/pura-connect';

const DEFAULT_API_BASE = 'https://ai.puradigital.it/v1';

function envTrim(key: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  return typeof value === 'string' ? value.trim() : '';
}

export function getPuraConnectClientOptions() {
  const apiBase =
    envTrim('VITE_PURA_OAUTH_API_BASE') || envTrim('VITE_PURA_API_BASE') || DEFAULT_API_BASE;
  const clientId = envTrim('VITE_PURA_CONNECT_CLIENT_ID') || envTrim('VITE_PURA_CLIENT_ID') || '';
  const redirectUri =
    envTrim('VITE_PURA_CONNECT_REDIRECT_URI') ||
    envTrim('VITE_PURA_REDIRECT_URI') ||
    PURA_CONNECT_REDIRECT_URI;
  return { apiBase, clientId, redirectUri };
}

export function isPuraConnectConfigured(): boolean {
  return Boolean(getPuraConnectClientOptions().clientId);
}

export function getPuraBrowserConnectionOptions(locale: 'it' | 'en' = 'it') {
  const { apiBase, clientId, redirectUri } = getPuraConnectClientOptions();
  return { apiBase, clientId, redirectUri, locale };
}
