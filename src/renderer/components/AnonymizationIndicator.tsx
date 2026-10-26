import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AnonymizationStatus } from '../../shared/anonymization-types';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';

export function AnonymizationIndicator() {
  const { t } = useTranslation();
  const enabled = useAppStore(
    (s) => s.appConfig?.provider !== 'ollama' && s.appConfig?.anonymizationEnabled === true
  );
  const [status, setStatus] = useState<AnonymizationStatus | null>(null);
  useEffect(() => {
    const api = window.electronAPI?.anonymization;
    if (!enabled || !api) return;
    let active = true;
    const unsubscribe = api.onEvent((event) => {
      if (active && event.type === 'status') setStatus(event.status);
    });
    void api
      .status()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled]);
  if (!enabled) return null;
  const unavailable = status && (status.model !== 'ready' || status.service === 'error');
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2 py-1 text-xs"
      title={t('anonymization.description')}
    >
      {unavailable ? (
        <ShieldAlert className="w-3 h-3" />
      ) : status?.service === 'starting' ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <ShieldCheck className="w-3 h-3" />
      )}
      {t(unavailable ? 'anonymization.notReady' : 'anonymization.active')}
    </span>
  );
}
