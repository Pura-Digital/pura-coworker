import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface PuraConnectionState {
  configured: boolean;
  connected: boolean;
  puraUserId: number | null;
}

export function usePuraLlm(configSetId: string) {
  const { i18n } = useTranslation();
  const [connection, setConnection] = useState<PuraConnectionState>({
    configured: false,
    connected: false,
    puraUserId: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageRefreshKey, setUsageRefreshKey] = useState(0);

  const refreshConnection = useCallback(async () => {
    const api = window.electronAPI?.puraConnect;
    if (!api?.getConnectionState) {
      setConnection({ configured: false, connected: false, puraUserId: null });
      return;
    }
    const state = await api.getConnectionState(configSetId);
    setConnection(state);
  }, [configSetId]);

  useEffect(() => {
    void refreshConnection();
    const api = window.electronAPI?.puraConnect;
    const unsubscribe = api?.onConnectionChanged?.((payload) => {
      if (payload.configSetId === configSetId) {
        void refreshConnection();
        setUsageRefreshKey((key) => key + 1);
      }
    });
    return () => unsubscribe?.();
  }, [configSetId, refreshConnection]);

  const connect = useCallback(async () => {
    const api = window.electronAPI?.puraConnect;
    if (!api?.startConnection) {
      setError('App not ready');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const locale = i18n.language?.startsWith('en') ? 'en' : 'it';
      const result = await api.startConnection({ locale, configSetId });
      if (!result.success) {
        setError(result.error || 'Connection failed');
      } else {
        await refreshConnection();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [configSetId, i18n.language, refreshConnection]);

  const disconnect = useCallback(async () => {
    const api = window.electronAPI?.puraConnect;
    setBusy(true);
    setError(null);
    try {
      await api?.disconnect?.(configSetId);
      await refreshConnection();
      setUsageRefreshKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }, [configSetId, refreshConnection]);

  return {
    connection,
    busy,
    error,
    connect,
    disconnect,
    refreshConnection,
    usageRefreshKey,
  };
}
