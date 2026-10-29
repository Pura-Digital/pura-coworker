import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const selectorPath = path.resolve(
  process.cwd(),
  'src/renderer/components/ChatApiConfigSelector.tsx'
);

describe('ChatApiConfigSelector Pura subscription label', () => {
  const source = readFileSync(selectorPath, 'utf8');

  it('loads Pura connection state on mount, not only when the popover opens', () => {
    expect(source).toContain('void refreshPuraConnections();');
    expect(source).not.toMatch(
      /if \(!open\) \{\s*return;\s*\}\s*void refreshPuraConnections\(\);/
    );
  });
});
