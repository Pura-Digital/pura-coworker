import { describe, expect, it } from 'vitest';
import { buildWebCustomTools } from '../src/main/tools/web-custom-tools';

describe('buildWebCustomTools', () => {
  it('includes WebSearch, WebFetch, and integrated BFF tools', () => {
    const tools = buildWebCustomTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(['WebSearch', 'WebFetch', 'BffWebSearch', 'BffWebCrawl']);
  });
});
