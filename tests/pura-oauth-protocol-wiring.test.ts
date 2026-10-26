import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PURA_CONNECT_REDIRECT_URI } from '../src/shared/pura-connect';

const indexPath = path.resolve(process.cwd(), 'src/main/index.ts');
const lifecyclePath = path.resolve(process.cwd(), 'src/main/pura/pura-oauth-lifecycle.ts');
const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('Pura OAuth protocol wiring', () => {
  it('uses the fixed Pura Connect redirect URI', () => {
    expect(PURA_CONNECT_REDIRECT_URI).toBe('com.puradigital.aiden://pura-oauth');
  });

  it('registers lifecycle handlers in main process', () => {
    const indexSource = fs.readFileSync(indexPath, 'utf8');
    const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');
    expect(indexSource).toContain('registerPuraConnectProtocolHandlers');
    expect(indexSource).toContain('captureStartupDeepLinks');
    expect(indexSource).toContain('pura-test-connection');
    expect(lifecycleSource).toContain("app.on('open-url'");
  });

  it('exposes Pura Connect IPC methods in preload', () => {
    const source = fs.readFileSync(preloadPath, 'utf8');
    expect(source).toContain('puraConnect');
    expect(source).toContain("'pura-start-connection'");
    expect(source).toContain("'pura-test-connection'");
  });
});
