import { describe, expect, it } from 'vitest';
import {
  applyBffWebEnvToProcess,
  buildBashSpawnEnv,
  getBffEnvForSpawn,
  resolveBffWebEnv,
} from '../src/main/tools/bff-web-env';
import { getIntegratedBffCredentials } from '../src/shared/bff-web-tools';

describe('bff-web-env', () => {
  it('always resolves integrated BFF credentials', () => {
    const integrated = getIntegratedBffCredentials();
    const env = resolveBffWebEnv();
    expect(env.configured).toBe(true);
    expect(env.bffBaseUrl).toBe(integrated.bffBaseUrl);
    expect(env.webServicesKey).toBe(integrated.webServicesKey);
  });

  it('applyBffWebEnvToProcess writes process.env', () => {
    const integrated = getIntegratedBffCredentials();
    applyBffWebEnvToProcess();
    expect(process.env.BFF_BASE_URL).toBe(integrated.bffBaseUrl);
    expect(process.env.WEB_SERVICES_KEY).toBe(integrated.webServicesKey);
  });

  it('getBffEnvForSpawn merges into base env', () => {
    const integrated = getIntegratedBffCredentials();
    const merged = getBffEnvForSpawn({ PATH: '/bin', HOME: '/home' });
    expect(merged.PATH).toBe('/bin');
    expect(merged.BFF_BASE_URL).toBe(integrated.bffBaseUrl);
    expect(merged.WEB_SERVICES_KEY).toBe(integrated.webServicesKey);
  });

  it('buildBashSpawnEnv includes BFF vars', () => {
    const integrated = getIntegratedBffCredentials();
    const env = buildBashSpawnEnv();
    expect(env.BFF_BASE_URL).toBe(integrated.bffBaseUrl);
    expect(env.WEB_SERVICES_KEY).toBe(integrated.webServicesKey);
    expect(env.PATH).toBeDefined();
  });
});
