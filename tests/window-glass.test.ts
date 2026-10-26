import { describe, expect, it } from 'vitest';
import os from 'node:os';
import type { BrowserWindowConstructorOptions } from 'electron';
import {
  DARK_BG,
  LIGHT_BG,
  TRANSPARENT_WINDOW_BG,
  applyNativeOsWindowGlassToOptions,
  opaqueWindowBackgroundForTheme,
  resolveWindowsBackgroundMaterial,
  shouldUseNativeOsWindowGlass,
  supportsNativeOsWindowGlass,
  windowBackgroundColorForTheme,
} from '../src/main/window-glass';

describe('native OS window glass', () => {
  it('picks Mica on Windows 11 and Acrylic on Windows 10', () => {
    expect(resolveWindowsBackgroundMaterial('10.0.22631')).toBe('mica');
    expect(resolveWindowsBackgroundMaterial('10.0.19045')).toBe('acrylic');
  });

  it('enables vibrancy on macOS and background material on Windows for light theme only', () => {
    const macOptions: BrowserWindowConstructorOptions = {};
    applyNativeOsWindowGlassToOptions(macOptions, 'darwin', 'light');
    expect(macOptions.transparent).toBe(true);
    expect(macOptions.backgroundColor).toBe(TRANSPARENT_WINDOW_BG);
    expect(macOptions.vibrancy).toBe('sidebar');
    expect(macOptions.visualEffectState).toBe('followWindow');

    const macDarkOptions: BrowserWindowConstructorOptions = {};
    applyNativeOsWindowGlassToOptions(macDarkOptions, 'darwin', 'dark');
    expect(macDarkOptions.transparent).toBe(true);
    expect(macDarkOptions.vibrancy).toBe('sidebar');

    const win11Options: BrowserWindowConstructorOptions = {};
    applyNativeOsWindowGlassToOptions(win11Options, 'win32', 'light');
    expect(win11Options.transparent).toBe(true);
    expect(win11Options.backgroundMaterial).toBe(resolveWindowsBackgroundMaterial(os.release()));

    // Host OS release is not Windows in CI/dev — material selection is validated above per build.
    expect(['mica', 'acrylic']).toContain(win11Options.backgroundMaterial);
  });

  it('keeps opaque backgrounds on Linux and on dark Windows', () => {
    expect(supportsNativeOsWindowGlass('linux')).toBe(false);
    expect(windowBackgroundColorForTheme('dark', 'linux')).toBe(DARK_BG);
    expect(windowBackgroundColorForTheme('light', 'linux')).toBe(LIGHT_BG);
    expect(opaqueWindowBackgroundForTheme('dark')).toBe(DARK_BG);

    expect(shouldUseNativeOsWindowGlass('darwin', 'dark')).toBe(true);
    expect(shouldUseNativeOsWindowGlass('darwin', 'light')).toBe(true);
    expect(shouldUseNativeOsWindowGlass('win32', 'dark')).toBe(false);
    expect(windowBackgroundColorForTheme('dark', 'darwin')).toBe(TRANSPARENT_WINDOW_BG);
    expect(windowBackgroundColorForTheme('light', 'darwin')).toBe(TRANSPARENT_WINDOW_BG);
    expect(windowBackgroundColorForTheme('dark', 'win32')).toBe(DARK_BG);
  });

  it('uses transparent window color when native glass is supported and theme is light', () => {
    expect(windowBackgroundColorForTheme('light', 'win32')).toBe(TRANSPARENT_WINDOW_BG);
  });
});
