import os from 'node:os';
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

export type WindowsBackgroundMaterial = 'mica' | 'acrylic';

/** Mica needs Windows 11 (build ≥ 22000); Win10 uses Acrylic. */
export function resolveWindowsBackgroundMaterial(osRelease: string): WindowsBackgroundMaterial {
  const build = Number.parseInt(osRelease.split('.')[2] ?? '0', 10);
  if (Number.isFinite(build) && build >= 22000) {
    return 'mica';
  }
  return 'acrylic';
}

function windowsBackgroundMaterialForHost(): WindowsBackgroundMaterial {
  return resolveWindowsBackgroundMaterial(os.release());
}

/** Opaque fallbacks when native OS glass is unavailable (e.g. Linux). */
export const DARK_BG = '#060b17';
export const LIGHT_BG = '#f5f3ee';

/** Fully transparent — lets macOS vibrancy / Windows Mica show through. */
export const TRANSPARENT_WINDOW_BG = '#00000000';

export type EffectiveUiTheme = 'dark' | 'light';

export function supportsNativeOsWindowGlass(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin' || platform === 'win32';
}

/** macOS vibrancy in both themes; Windows Mica/Acrylic in light only (dark stays opaque on Win). */
export function shouldUseNativeOsWindowGlass(
  platform: NodeJS.Platform = process.platform,
  effectiveTheme: EffectiveUiTheme = 'dark'
): boolean {
  if (platform === 'darwin') {
    return true;
  }
  return platform === 'win32' && effectiveTheme === 'light';
}

export function opaqueWindowBackgroundForTheme(theme: EffectiveUiTheme): string {
  return theme === 'dark' ? DARK_BG : LIGHT_BG;
}

export function windowBackgroundColorForTheme(
  theme: EffectiveUiTheme,
  platform: NodeJS.Platform = process.platform
): string {
  if (shouldUseNativeOsWindowGlass(platform, theme)) {
    return TRANSPARENT_WINDOW_BG;
  }
  return opaqueWindowBackgroundForTheme(theme);
}

export function applyNativeOsWindowGlassToOptions(
  options: BrowserWindowConstructorOptions,
  platform: NodeJS.Platform = process.platform,
  effectiveTheme: EffectiveUiTheme = 'dark'
): void {
  if (!shouldUseNativeOsWindowGlass(platform, effectiveTheme)) {
    return;
  }

  options.transparent = true;
  options.backgroundColor = TRANSPARENT_WINDOW_BG;

  if (platform === 'darwin') {
    options.vibrancy = 'sidebar';
    options.visualEffectState = 'followWindow';
  } else if (platform === 'win32') {
    options.backgroundMaterial = windowsBackgroundMaterialForHost();
  }
}

function setWebContentsBackgroundColor(window: BrowserWindow, color: string): void {
  if (window.isDestroyed()) {
    return;
  }
  try {
    const contents = window.webContents as typeof window.webContents & {
      setBackgroundColor?: (color: string) => void;
    };
    contents.setBackgroundColor?.(color);
  } catch {
    // Older Electron builds may not expose webContents.setBackgroundColor.
  }
}

function clearMacVibrancy(window: BrowserWindow): void {
  if (window.isDestroyed() || process.platform !== 'darwin') {
    return;
  }
  try {
    window.setVibrancy(null);
  } catch {
    // Ignore if vibrancy was never enabled.
  }
}

function clearWindowsBackgroundMaterial(window: BrowserWindow): void {
  if (window.isDestroyed() || process.platform !== 'win32') {
    return;
  }
  try {
    const win = window as BrowserWindow & { setBackgroundMaterial?: (material: string) => void };
    win.setBackgroundMaterial?.('none');
  } catch {
    // Ignore if background material is unavailable.
  }
}

export function syncNativeOsWindowGlass(
  window: BrowserWindow,
  effectiveTheme: EffectiveUiTheme
): void {
  const platform = process.platform;
  const opaque = opaqueWindowBackgroundForTheme(effectiveTheme);

  if (!shouldUseNativeOsWindowGlass(platform, effectiveTheme)) {
    window.setBackgroundColor(opaque);
    setWebContentsBackgroundColor(window, opaque);
    clearMacVibrancy(window);
    clearWindowsBackgroundMaterial(window);
    return;
  }

  window.setBackgroundColor(TRANSPARENT_WINDOW_BG);
  setWebContentsBackgroundColor(window, TRANSPARENT_WINDOW_BG);

  if (platform === 'darwin') {
    window.setVibrancy('sidebar');
    return;
  }

  if (platform === 'win32') {
    window.setBackgroundMaterial(windowsBackgroundMaterialForHost());
  }
}

/** Re-apply after navigation — Electron can reset WebContents to opaque white. */
export function refreshNativeOsWindowGlass(
  window: BrowserWindow,
  effectiveTheme: EffectiveUiTheme
): void {
  syncNativeOsWindowGlass(window, effectiveTheme);
}
