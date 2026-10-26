import { describe, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

function packagedConfig(env: Record<string, string> = {}) {
  const result = buildSync({
    entryPoints: ['src/main/pura/pura-oauth-config.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: {
      'import.meta.env': JSON.stringify({ VITE_PURA_CONNECT_CLIENT_ID: 'public-aiden-client' }),
    },
  });
  const module = {
    exports: {} as { getPuraClientConfig(): { clientId: string; redirectUri: string } },
  };
  vm.runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    process: { env },
  });
  return module.exports.getPuraClientConfig();
}

describe('packaged Pura public configuration', () => {
  it('works from Finder without a development .env file', () => {
    const config = packagedConfig();
    expect(config.clientId).toBe('public-aiden-client');
    expect(config.redirectUri).toBe('com.puradigital.aiden://pura-oauth');
  });
  it('retains an explicit runtime client override', () => {
    expect(packagedConfig({ VITE_PURA_CONNECT_CLIENT_ID: 'runtime-client' }).clientId).toBe(
      'runtime-client'
    );
  });
});
