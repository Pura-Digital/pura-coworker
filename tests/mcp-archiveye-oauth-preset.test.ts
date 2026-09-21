import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MCP_SERVER_PRESETS, mcpConfigStore } from '../src/main/mcp/mcp-config-store';

describe('Archiveye MCP preset', () => {
  it('creates an OAuth connector without an API key placeholder', () => {
    const preset = MCP_SERVER_PRESETS.archiveye;
    const server = mcpConfigStore.createFromPreset('archiveye');

    expect(preset).toMatchObject({
      name: 'Archiveye',
      type: 'streamable-http',
      url: 'https://mcp.archiveye.ai/user/mcp',
      authType: 'oauth',
      oauth: { registrationStrategy: 'auto' },
    });
    expect(preset.requiresEnv).toBeUndefined();
    expect(server).toMatchObject({
      name: 'Archiveye',
      type: 'streamable-http',
      url: 'https://mcp.archiveye.ai/user/mcp',
      enabled: false,
      authType: 'oauth',
      oauth: { registrationStrategy: 'auto' },
    });
    expect(JSON.stringify(server)).not.toContain('ARCHIVEYE_API_KEY');
  });

  it('copies preset OAuth settings into the renderer-created server config', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/renderer/components/settings/SettingsConnectors.tsx'),
      'utf8'
    );

    expect(source).toContain('authType: preset.authType');
    expect(source).toContain('oauth: preset.oauth');
  });
});
