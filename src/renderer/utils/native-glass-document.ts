export type EffectiveUiTheme = 'dark' | 'light';

export function supportsNativeOsGlassPlatform(platform?: string): boolean {
  return platform === 'darwin' || platform === 'win32';
}

/** macOS vibrancy in both themes; Windows native glass in light only. */
export function shouldUseNativeOsGlassDocument(
  platform?: string,
  effectiveTheme: EffectiveUiTheme = 'dark'
): boolean {
  if (platform === 'darwin') {
    return true;
  }
  return platform === 'win32' && effectiveTheme === 'light';
}

export function syncNativeGlassDocumentClass(
  effectiveTheme: EffectiveUiTheme,
  platform?: string
): void {
  const useNativeGlass = shouldUseNativeOsGlassDocument(platform, effectiveTheme);
  document.documentElement.classList.toggle('native-os-glass', useNativeGlass);

  if (useNativeGlass) {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return;
  }

  document.documentElement.style.removeProperty('background');
  document.body.style.removeProperty('background');
}
