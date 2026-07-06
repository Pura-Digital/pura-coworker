import { describe, expect, it } from 'vitest';
import {
  maskPresetUrl,
  presetUrlHasUnresolvedPlaceholders,
  resolvePresetUrl,
} from '../src/shared/mcp-preset-url';

describe('mcp-preset-url', () => {
  it('substitutes placeholders in preset URLs', () => {
    expect(
      resolvePresetUrl('https://mcp.archiveye.ai/user/{ARCHIVEYE_API_KEY}/mcp', {
        ARCHIVEYE_API_KEY: 'secret-key',
      })
    ).toBe('https://mcp.archiveye.ai/user/secret-key/mcp');
  });

  it('encodes special characters in URL segments', () => {
    expect(
      resolvePresetUrl('https://example.com/{TOKEN}/mcp', {
        TOKEN: 'a/b+c',
      })
    ).toBe('https://example.com/a%2Fb%2Bc/mcp');
  });

  it('masks unresolved placeholders for display', () => {
    expect(maskPresetUrl('https://mcp.archiveye.ai/user/{ARCHIVEYE_API_KEY}/mcp')).toBe(
      'https://mcp.archiveye.ai/user/***/mcp'
    );
  });

  it('detects unresolved placeholders', () => {
    expect(presetUrlHasUnresolvedPlaceholders('https://example.com/{TOKEN}/mcp')).toBe(true);
    expect(presetUrlHasUnresolvedPlaceholders('https://example.com/ready/mcp')).toBe(false);
  });
});
