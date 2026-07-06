export type UpdaterPhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error';

export interface UpdaterSnapshot {
  phase: UpdaterPhase;
  version: string | null;
  progress: number | null;
  transferred: number | null;
  total: number | null;
  error: string | null;
}

export const INITIAL_UPDATER_SNAPSHOT: UpdaterSnapshot = {
  phase: 'idle',
  version: null,
  progress: null,
  transferred: null,
  total: null,
  error: null,
};
