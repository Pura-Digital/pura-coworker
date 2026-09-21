import { describe, expect, it } from 'vitest';
import {
  migrateLegacyUiZoom,
  normalizeDisplayScale,
  toElectronZoomFactor,
  UI_ZOOM_BASE,
} from '../src/shared/ui-zoom';

describe('ui-zoom', () => {
  it('uses 90% Electron zoom as the standard 100% UI', () => {
    expect(toElectronZoomFactor(1)).toBe(UI_ZOOM_BASE);
    expect(UI_ZOOM_BASE).toBe(0.9);
  });

  it('migrates legacy browser-native 100% zoom to the Aiden baseline', () => {
    expect(migrateLegacyUiZoom(1)).toBe(1);
    expect(toElectronZoomFactor(migrateLegacyUiZoom(1))).toBe(0.9);
  });

  it('migrates legacy absolute 80% zoom to a similar display scale', () => {
    expect(migrateLegacyUiZoom(0.8)).toBeCloseTo(0.89, 2);
  });

  it('keeps display scale values after migration', () => {
    expect(normalizeDisplayScale(1.25)).toBe(1.25);
    expect(toElectronZoomFactor(1.25)).toBe(1.13);
  });
});
