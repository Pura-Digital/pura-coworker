import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const stylesPath = path.resolve(process.cwd(), 'src/renderer/styles/globals.css');

describe('dark theme palette', () => {
  it('uses the Aiden deep-blue palette for the default theme', () => {
    const source = fs.readFileSync(stylesPath, 'utf8');
    expect(source).toContain('Aiden deep-blue palette');
    expect(source).toContain('--color-background: #071427;');
    expect(source).toContain('--color-surface: #122742;');
    expect(source).toContain('--color-text-primary: #eaf2ff;');
  });

  it('keeps the accent within the blue-violet family', () => {
    const source = fs.readFileSync(stylesPath, 'utf8');
    expect(source).toContain('--color-accent: #7f93ee;');
    expect(source).toContain('--color-accent-hover: #96adff;');
  });
});
