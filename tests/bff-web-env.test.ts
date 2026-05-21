import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  applyBffWebEnvToProcess,
  buildBashSpawnEnv,
  getBffEnvForSpawn,
  resolveBffWebEnv,
} from '../src/main/tools/bff-web-env';

describe('bff-web-env', () => {
  const prevBff = process.env.BFF_BASE_URL;
  const prevKey = process.env.WEB_SERVICES_KEY;

  afterEach(() => {
    if (prevBff === undefined) delete process.env.BFF_BASE_URL;
    else process.env.BFF_BASE_URL = prevBff;
    if (prevKey === undefined) delete process.env.WEB_SERVICES_KEY;
    else process.env.WEB_SERVICES_KEY = prevKey;
  });

  beforeEach(() => {
    delete process.env.BFF_BASE_URL;
    delete process.env.WEB_SERVICES_KEY;
  });

  it('resolves from process.env', () => {
    process.env.BFF_BASE_URL = 'https://bff.example.com/';
    process.env.WEB_SERVICES_KEY = 'secret';
    const env = resolveBffWebEnv();
    expect(env.configured).toBe(true);
    expect(env.bffBaseUrl).toBe('https://bff.example.com');
    expect(env.webServicesKey).toBe('secret');
  });

  it('prefers config over process.env', () => {
    process.env.BFF_BASE_URL = 'https://env.example.com';
    process.env.WEB_SERVICES_KEY = 'env-key';
    const env = resolveBffWebEnv({
      bffBaseUrl: 'https://cfg.example.com',
      webServicesKey: 'cfg-key',
    });
    expect(env.bffBaseUrl).toBe('https://cfg.example.com');
    expect(env.webServicesKey).toBe('cfg-key');
  });

  it('applyBffWebEnvToProcess writes normalized base URL', () => {
    applyBffWebEnvToProcess({
      configured: true,
      bffBaseUrl: 'https://bff.example.com/',
      webServicesKey: 'k',
    });
    expect(process.env.BFF_BASE_URL).toBe('https://bff.example.com');
    expect(process.env.WEB_SERVICES_KEY).toBe('k');
  });

  it('getBffEnvForSpawn merges into base env', () => {
    process.env.BFF_BASE_URL = 'https://bff.example.com';
    process.env.WEB_SERVICES_KEY = 'secret';
    const merged = getBffEnvForSpawn({ PATH: '/bin', HOME: '/home' });
    expect(merged.PATH).toBe('/bin');
    expect(merged.BFF_BASE_URL).toBe('https://bff.example.com');
    expect(merged.WEB_SERVICES_KEY).toBe('secret');
  });

  it('buildBashSpawnEnv omits BFF when unset', () => {
    const env = buildBashSpawnEnv();
    expect(env.BFF_BASE_URL).toBeUndefined();
    expect(env.WEB_SERVICES_KEY).toBeUndefined();
    expect(env.PATH).toBeDefined();
  });
});
