import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { StoredTokens } from '@pura-ai/sdk';
import { logError } from '../utils/logger';

type TokenMap = Record<string, StoredTokens>;

const tokenFile = () => path.join(app.getPath('userData'), 'pura-oauth-tokens-by-set.bin');

let cached: TokenMap | null = null;
const listeners = new Set<(map: TokenMap) => void>();

function publish(): TokenMap {
  const snapshot = getAll();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (err) {
      logError('[PuraTokenStore] listener failed', err);
    }
  }
  return snapshot;
}

function encryptPayload(json: string): Buffer {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(json);
  }
  return Buffer.from(json, 'utf8');
}

function decryptPayload(buf: Buffer): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buf);
  }
  return buf.toString('utf8');
}

function persist(map: TokenMap): void {
  const payload = JSON.stringify(map);
  fs.writeFileSync(tokenFile(), encryptPayload(payload), { mode: 0o600 });
}

function loadMap(): TokenMap {
  if (cached !== null) {
    return cached;
  }
  try {
    const file = tokenFile();
    if (!fs.existsSync(file)) {
      cached = {};
      return cached;
    }
    const json = decryptPayload(fs.readFileSync(file));
    cached = JSON.parse(json) as TokenMap;
    return cached;
  } catch (err) {
    logError('[PuraTokenStore] load failed', err);
    cached = {};
    return cached;
  }
}

export function getAll(): TokenMap {
  return { ...loadMap() };
}

export function getForSet(configSetId: string): StoredTokens | null {
  const map = loadMap();
  return map[configSetId] ?? null;
}

export function setForSet(configSetId: string, tokens: StoredTokens | null): boolean {
  try {
    const map = { ...loadMap() };
    if (!tokens) {
      delete map[configSetId];
    } else {
      map[configSetId] = tokens;
    }
    persist(map);
    cached = map;
    publish();
    return true;
  } catch (err) {
    logError('[PuraTokenStore] set failed', err);
    return false;
  }
}

export function clearForSet(configSetId: string): void {
  setForSet(configSetId, null);
}

export function isConnected(configSetId: string): boolean {
  const tokens = getForSet(configSetId);
  return Boolean(tokens?.access_token && tokens?.refresh_token);
}

export function subscribe(listener: (map: TokenMap) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateCache(): void {
  cached = null;
}
