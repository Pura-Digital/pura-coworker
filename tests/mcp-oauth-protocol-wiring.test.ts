import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.resolve(process.cwd(), 'src/main/index.ts');
const puraLifecyclePath = path.resolve(process.cwd(), 'src/main/pura/pura-oauth-lifecycle.ts');
const builderPath = path.resolve(process.cwd(), 'electron-builder.yml');
const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('MCP OAuth protocol wiring', () => {
  it('registers custom scheme in electron-builder', () => {
    const source = fs.readFileSync(builderPath, 'utf8');
    expect(source).toContain('com.puradigital.aiden');
    expect(source).toContain('protocols:');
  });

  it('registers lifecycle handlers in main process', () => {
    const indexSource = fs.readFileSync(indexPath, 'utf8');
    const puraLifecycleSource = fs.readFileSync(puraLifecyclePath, 'utf8');
    expect(indexSource).toContain('registerMcpOAuthProtocolHandlers');
    expect(indexSource).toContain('registerPuraConnectProtocolHandlers');
    expect(indexSource).toContain('captureSecondInstanceDeepLinks');
    expect(indexSource).toContain('processMcpOAuthCallbacks');
    expect(puraLifecycleSource).toContain("app.on('open-url'");
  });

  it('exposes OAuth IPC methods in preload', () => {
    const source = fs.readFileSync(preloadPath, 'utf8');
    expect(source).toContain("'mcp.startOAuth'");
    expect(source).toContain("'mcp.disconnectOAuth'");
  });
});
