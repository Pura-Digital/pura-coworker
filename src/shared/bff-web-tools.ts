/**
 * Built-in BFF external web-tools — shipped with every Aiden install (all LLM providers).
 */

export const INTEGRATED_BFF_BASE_URL = 'https://dapi.archiveye.ai';

export const INTEGRATED_WEB_SERVICES_KEY = 'osMvhg|>pgWM(EV%npQ{lG@-jJV[9k-B';

export function getIntegratedBffCredentials(): {
  bffBaseUrl: string;
  webServicesKey: string;
} {
  return {
    bffBaseUrl: INTEGRATED_BFF_BASE_URL.replace(/\/+$/, ''),
    webServicesKey: INTEGRATED_WEB_SERVICES_KEY,
  };
}
