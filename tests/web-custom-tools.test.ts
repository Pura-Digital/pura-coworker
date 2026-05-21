import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildWebCustomTools } from '../src/main/tools/web-custom-tools';

describe('buildWebCustomTools', () => {
  it('always includes WebSearch and WebFetch', () => {
    const tools = buildWebCustomTools({ configured: false });
    const names = tools.map((t) => t.name);
    expect(names).toContain('WebSearch');
    expect(names).toContain('WebFetch');
    expect(names).not.toContain('BffWebSearch');
    expect(names).not.toContain('BffWebCrawl');
  });

  it('adds BFF tools when configured', () => {
    const tools = buildWebCustomTools({
      configured: true,
      bffBaseUrl: 'https://bff.example.com',
      webServicesKey: 'secret',
    });
    const names = tools.map((t) => t.name);
    expect(names).toEqual(['WebSearch', 'WebFetch', 'BffWebSearch', 'BffWebCrawl']);
  });
});
