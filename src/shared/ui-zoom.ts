/** Electron zoom at our standard UI density (100% in settings). */
export const UI_ZOOM_BASE = 0.8;

export const UI_ZOOM_MIN_DISPLAY = 0.8;
export const UI_ZOOM_MAX_DISPLAY = 1.5;

export const UI_ZOOM_PRESETS = [
  { value: 0.8, label: '80%' },
  { value: 0.9, label: '90%' },
  { value: 1, label: '100%' },
  { value: 1.1, label: '110%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
] as const;

export function normalizeDisplayScale(value: unknown, fallback = 1): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(
    UI_ZOOM_MAX_DISPLAY,
    Math.max(UI_ZOOM_MIN_DISPLAY, Math.round(parsed * 100) / 100)
  );
}

export function toElectronZoomFactor(displayScale: number): number {
  const normalized = normalizeDisplayScale(displayScale);
  return Math.round(UI_ZOOM_BASE * normalized * 100) / 100;
}

/**
 * Migrate configs that stored absolute Electron zoom factors (pre-baseline).
 */
export function migrateLegacyUiZoom(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  const rounded = Math.round(parsed * 100) / 100;
  const legacyAbsolutePresets = new Set([0.8, 0.9, 1, 1.1, 1.25, 1.5]);
  if (!legacyAbsolutePresets.has(rounded)) {
    return normalizeDisplayScale(parsed, 1);
  }

  // Old "100%" was browser-native zoom; our standard UI is 80% Electron zoom.
  if (rounded === 1) {
    return 1;
  }

  return normalizeDisplayScale(rounded / UI_ZOOM_BASE, 1);
}
