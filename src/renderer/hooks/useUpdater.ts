import { useCallback, useEffect, useState } from 'react';
import type { UpdaterSnapshot } from '../../shared/updater-types';
import { INITIAL_UPDATER_SNAPSHOT } from '../../shared/updater-types';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.updater !== undefined;

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isElectron) {
      return;
    }

    void window.electronAPI.updater.getStatus().then((snapshot) => {
      setStatus(snapshot);
    });
  }, []);

  useEffect(() => {
    if (!isElectron) {
      return;
    }

    const previousOn = window.electronAPI.on;
    const cleanup = previousOn((event) => {
      if (event.type !== 'updater.status') {
        return;
      }
      setStatus(event.payload);
      if (
        event.payload.phase === 'available' ||
        event.payload.phase === 'downloaded' ||
        event.payload.phase === 'up-to-date'
      ) {
        setDismissed(false);
      }
    });

    return cleanup;
  }, []);

  const visibleStatus =
    dismissed && status?.phase !== 'downloading' && status?.phase !== 'downloaded'
      ? null
      : status;

  const download = useCallback(async () => {
    if (!isElectron) return;
    setDismissed(false);
    await window.electronAPI.updater.download();
  }, []);

  const retry = useCallback(async () => {
    if (!isElectron) return;
    setDismissed(false);
    await window.electronAPI.updater.check();
  }, []);

  const install = useCallback(async () => {
    if (!isElectron) return;
    await window.electronAPI.updater.install();
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    status: visibleStatus?.phase === 'idle' ? null : visibleStatus,
    download,
    install,
    retry,
    dismiss,
  };
}

export { INITIAL_UPDATER_SNAPSHOT };
