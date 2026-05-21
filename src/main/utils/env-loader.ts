/**
 * Load .env files from development and packaged app locations.
 */

import * as fs from 'fs';
import { join, resolve } from 'path';
import { config as loadDotenv } from 'dotenv';
import { app } from 'electron';
import { log, logWarn } from './logger';

/**
 * Attempt to load environment variables from known locations.
 * Later files do not override variables already set (override: false).
 */
export function loadAppEnvironmentFiles(mainDirname: string): void {
  const candidates: string[] = [resolve(mainDirname, '../../.env')];

  try {
    candidates.push(join(app.getPath('userData'), '.env'));
  } catch {
    // app.getPath may fail very early; dev .env still attempted
  }

  let loadedAny = false;
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) {
      continue;
    }
    log('[dotenv] Loading from:', envPath);
    const result = loadDotenv({ path: envPath, override: false });
    if (result.error) {
      logWarn('[dotenv] Failed to load .env:', envPath, result.error.message);
      continue;
    }
    loadedAny = true;
  }

  if (!loadedAny) {
    logWarn('[dotenv] No .env file found in known locations');
  } else {
    log('[dotenv] Environment files loaded');
  }
}
