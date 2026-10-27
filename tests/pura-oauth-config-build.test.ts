import { describe, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const PUBLIC_AIDEN_CLIENT_ID = 'pura_app_Ogu7FEKMw0pOO1BF0flbCXN-sFzyVsUS';
const entryPoints = [
  ['main', 'src/main/pura/pura-oauth-config.ts', 'getPuraClientConfig'],
  ['renderer', 'src/renderer/config/puraConnect.ts', 'getPuraConnectClientOptions'],
] as const;

type ClientConfig = { clientId: string; apiBase: string; redirectUri: string };

function packagedConfig(
  entryPoint: string,
  getter: string,
  buildEnv: Record<string, string> = {},
  runtimeEnv: Record<string, string> = {}
) {
  const result = buildSync({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    platform: entryPoint.includes('/renderer/') ? 'browser' : 'node',
    format: 'cjs',
    define: { 'import.meta.env': JSON.stringify(buildEnv) },
  });
  const module = {
    exports: {} as Record<string, () => ClientConfig | boolean>,
  };
  vm.runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    process: { env: runtimeEnv },
  });
  return {
    config: module.exports[getter]() as ClientConfig,
    configured: module.exports.isPuraConnectConfigured(),
  };
}

describe.each(entryPoints)('packaged Pura public configuration (%s)', (_, entryPoint, getter) => {
  it('enables the registered Aiden client without any development or CI environment', () => {
    const { config, configured } = packagedConfig(entryPoint, getter);
    expect(config).toEqual({
      clientId: PUBLIC_AIDEN_CLIENT_ID,
      apiBase: 'https://ai.puradigital.it/v1',
      redirectUri: 'com.puradigital.aiden://pura-oauth',
    });
    expect(configured).toBe(true);
  });

  it('uses the production client when build settings are empty or whitespace', () => {
    const { config, configured } = packagedConfig(entryPoint, getter, {
      VITE_PURA_CONNECT_CLIENT_ID: ' ',
      VITE_PURA_CLIENT_ID: '',
    });
    expect(config.clientId).toBe(PUBLIC_AIDEN_CLIENT_ID);
    expect(configured).toBe(true);
  });

  it('retains explicit public build overrides', () => {
    const { config } = packagedConfig(entryPoint, getter, {
      VITE_PURA_CONNECT_CLIENT_ID: ' custom-client ',
      VITE_PURA_OAUTH_API_BASE: ' https://oauth.example.test/v1 ',
      VITE_PURA_CONNECT_REDIRECT_URI: 'custom-app://pura-oauth',
    });
    expect(config).toEqual({
      clientId: 'custom-client',
      apiBase: 'https://oauth.example.test/v1',
      redirectUri: 'custom-app://pura-oauth',
    });
  });

  it('retains legacy client ID build overrides', () => {
    expect(
      packagedConfig(entryPoint, getter, { VITE_PURA_CLIENT_ID: 'legacy-client' }).config.clientId
    ).toBe('legacy-client');
  });
});

it('retains an explicit main-process runtime client override', () => {
  const { config } = packagedConfig(
    'src/main/pura/pura-oauth-config.ts',
    'getPuraClientConfig',
    { VITE_PURA_CONNECT_CLIENT_ID: 'build-client' },
    { VITE_PURA_CONNECT_CLIENT_ID: 'runtime-client' }
  );
  expect(config.clientId).toBe('runtime-client');
});
