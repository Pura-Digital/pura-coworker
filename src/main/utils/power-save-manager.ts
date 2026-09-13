import { powerSaveBlocker } from 'electron';
import { log } from './logger';

let blockerId: number | null = null;
let runningSessionCount = 0;
let alwaysOnEnabled = false;

function stopBlocker(): void {
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
    powerSaveBlocker.stop(blockerId);
    log('[PowerSave] Stopped power save blocker');
  }
  blockerId = null;
}

function startBlocker(): void {
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
    return;
  }
  blockerId = powerSaveBlocker.start('prevent-app-suspension');
  log('[PowerSave] Started power save blocker');
}

function syncBlocker(): void {
  if (alwaysOnEnabled && runningSessionCount > 0) {
    startBlocker();
    return;
  }
  stopBlocker();
}

export function setAlwaysOnEnabled(enabled: boolean): void {
  alwaysOnEnabled = enabled;
  syncBlocker();
}

export function handleSessionStatusChange(status: string): void {
  if (status === 'running') {
    runningSessionCount += 1;
  } else if (status === 'idle' || status === 'error') {
    runningSessionCount = Math.max(0, runningSessionCount - 1);
  }
  syncBlocker();
}

export function resetPowerSaveState(): void {
  runningSessionCount = 0;
  stopBlocker();
}
