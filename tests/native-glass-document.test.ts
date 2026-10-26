import { describe, expect, it } from 'vitest';
import {
  shouldUseNativeOsGlassDocument,
  supportsNativeOsGlassPlatform,
} from '../src/renderer/utils/native-glass-document';

describe('native glass document class', () => {
  it('enables native glass on macOS for both themes and on Windows in light only', () => {
    expect(supportsNativeOsGlassPlatform('linux')).toBe(false);
    expect(shouldUseNativeOsGlassDocument('darwin', 'dark')).toBe(true);
    expect(shouldUseNativeOsGlassDocument('darwin', 'light')).toBe(true);
    expect(shouldUseNativeOsGlassDocument('win32', 'dark')).toBe(false);
    expect(shouldUseNativeOsGlassDocument('win32', 'light')).toBe(true);
    expect(shouldUseNativeOsGlassDocument(undefined, 'light')).toBe(false);
  });
});
