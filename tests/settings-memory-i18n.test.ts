import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const settingsMemoryPath = path.resolve(
  process.cwd(),
  'src/renderer/components/settings/SettingsMemory.tsx'
);
const localePaths = {
  en: path.resolve(process.cwd(), 'src/renderer/i18n/locales/en.json'),
  it: path.resolve(process.cwd(), 'src/renderer/i18n/locales/it.json'),
  zh: path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh.json'),
};

function getValueByPath(source: unknown, keyPath: string): unknown {
  return keyPath.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
}

describe('SettingsMemory i18n coverage', () => {
  it('maps every memory translation key in all supported locales', () => {
    const source = fs.readFileSync(settingsMemoryPath, 'utf8');
    const memoryKeys = Array.from(
      new Set(
        Array.from(source.matchAll(/t\(\s*['"`](memory\.[^'"`]+)['"`]/g), (match) => match[1])
      )
    ).sort();

    expect(memoryKeys.length).toBeGreaterThan(0);

    for (const [locale, localePath] of Object.entries(localePaths)) {
      const translations = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      const missingKeys = memoryKeys.filter(
        (key) => getValueByPath(translations, key) === undefined
      );

      expect(missingKeys, `${locale} is missing memory translations`).toEqual([]);
    }
  });
});
