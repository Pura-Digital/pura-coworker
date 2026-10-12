import { useEffect, useState } from 'react';
import { Download, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnonymizationStatus } from '../../shared/anonymization-types';

export function AnonymizationSettings({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AnonymizationStatus | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const api = window.electronAPI?.anonymization;
    if (!api) return;
    let active = true;
    const unsubscribe = api.onEvent((event) => {
      if (active && event.type === 'status') setStatus(event.status);
    });
    void api
      .status()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {
        if (active) setError(t('anonymization.unavailable'));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [t]);
  const progress = status?.totalBytes
    ? Math.round((status.downloadedBytes / status.totalBytes) * 100)
    : 0;
  const download = async () => {
    setError('');
    try {
      await window.electronAPI.anonymization.download();
    } catch {
      setError(t('anonymization.downloadFailed'));
    }
  };
  return (
    <section className="space-y-3" aria-label={t('anonymization.title')}>
      <div className="flex items-center gap-2 font-medium">
        <ShieldCheck className="w-4 h-4" />
        {t('anonymization.title')}
      </div>
      <p className="text-xs text-text-muted">{t('anonymization.description')}</p>
      {(status?.model === 'ready' || enabled) && (
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-sm">{t('anonymization.enable')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(event) => onChange(event.target.checked)}
            className="accent-accent w-5 h-5"
          />
        </label>
      )}
      {status?.model === 'ready' ? null : status?.model === 'downloading' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('anonymization.downloading', { progress })}
          </div>
          <progress
            className="w-full accent-accent"
            value={status.downloadedBytes}
            max={status.totalBytes}
            aria-label={t('anonymization.download')}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void window.electronAPI.anonymization.cancelDownload()}
          >
            {t('anonymization.cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!status}
          onClick={() => void download()}
        >
          <Download className="w-4 h-4" />
          {t('anonymization.download')}
        </button>
      )}
      {(error || status?.error) && (
        <p role="alert" className="text-xs text-error">
          {error || status?.error}
        </p>
      )}
    </section>
  );
}
