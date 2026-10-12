import { createRequire } from 'node:module';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const tailwind = require('tailwindcss');
const config = require('../tailwind.config.js');

describe('theme surface utility generation', () => {
  it('generates solid colors and all opacity variants used by the glass layout', async () => {
    const classes =
      'bg-background bg-surface bg-background/88 bg-background/92 bg-background/95 bg-surface/95 border-border/80 text-text-primary/50';
    const result = await postcss([
      tailwind({ ...config, content: [{ raw: classes, extension: 'html' }] }),
    ]).process('@tailwind utilities;', { from: undefined });
    const selectors = new Map<string, string>();
    result.root.walkRules((rule) => {
      selectors.set(rule.selector, rule.toString());
    });
    for (const name of classes.split(' ')) {
      const selector = `.${name.replaceAll('/', '\\/')}`;
      expect(selectors.has(selector), `Missing utility ${name}`).toBe(true);
      expect(selectors.get(selector)).toContain('var(--color-');
    }
    expect(selectors.get('.bg-background\\/92')).toContain('0.92');
    expect(selectors.get('.bg-surface\\/95')).toContain('0.95');
  });
});
