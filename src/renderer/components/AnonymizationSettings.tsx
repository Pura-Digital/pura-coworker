import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnonymizationStatus } from '../../shared/anonymization-types';
import { AnonymizationVeilIllustration } from './anonymization/AnonymizationVeilIllustration';
import { SettingsToggle } from './settings/shared';

const PILL_KEYS = ['pillDevice', 'pillPerChat', 'pillEngine'] as const;

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
  const modelReady = status?.model === 'ready';
  const showToggle = modelReady || enabled;

  return (
    <section
      className="card overflow-hidden p-0"
      aria-label={t('anonymization.brandName')}
    >
      <div className="grid sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div
          className={`relative flex min-h-[168px] items-center justify-center border-b border-border-subtle bg-gradient-to-br from-accent/25 via-accent/8 to-transparent p-6 sm:border-b-0 sm:border-r ${
            enabled ? '' : 'opacity-90'
          }`}
        >
          <AnonymizationVeilIllustration active={enabled} className="w-full max-w-[340px]" />
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              {t('anonymization.eyebrow')}
            </p>
            <h4 className="text-lg font-semibold tracking-tight text-text-primary">
              {t('anonymization.brandName')}
            </h4>
            <p className="text-xs leading-5 text-text-muted">{t('anonymization.description')}</p>
            <p className="text-[11px] leading-5 text-text-muted/80">{t('anonymization.disclaimer')}</p>
          </div>

          <ul className="flex flex-wrap gap-2" aria-label={t('anonymization.highlightsLabel')}>
            {PILL_KEYS.map((key) => (
              <li
                key={key}
                className="rounded-full border border-border-subtle bg-surface-hover/60 px-2.5 py-1 text-[10px] font-medium text-text-secondary"
              >
                {t(`anonymization.${key}`)}
              </li>
            ))}
          </ul>

          {showToggle && (
            <SettingsToggle
              label={t('anonymization.enable')}
              enabled={enabled}
              onToggle={() => onChange(!enabled)}
            />
          )}

          {modelReady ? null : status?.model === 'downloading' ? (
            <div className="space-y-2 rounded-xl border border-border-subtle bg-background/40 p-3">
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
              className="btn btn-secondary w-full sm:w-auto"
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
        </div>
      </div>
    </section>
  );
}
