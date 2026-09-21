import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.resolve(process.cwd(), 'src/main/index.ts');

describe('MCP OAuth IPC handlers', () => {
  it('defines startOAuth and disconnectOAuth handlers with authType guard', () => {
    const source = fs.readFileSync(indexPath, 'utf8');
    expect(source).toContain("ipcMain.handle('mcp.startOAuth'");
    expect(source).toContain("ipcMain.handle('mcp.disconnectOAuth'");
    expect(source).toContain("config.authType !== 'oauth'");
    expect(source).toContain('authRequired: true');
  });
});
