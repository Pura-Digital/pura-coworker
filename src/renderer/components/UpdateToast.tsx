import { useEffect } from 'react';
import { CheckCircle2, Download, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UpdaterSnapshot } from '../../shared/updater-types';

interface Props {
  status: UpdaterSnapshot | null;
  onDownload: () => void;
  onInstall: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateToast({ status, onDownload, onInstall, onRetry, onDismiss }: Props) {
  const { t } = useTranslation();

  const phase = status?.phase;

  useEffect(() => {
    if (phase !== 'up-to-date') {
      return;
    }
    const timer = setTimeout(() => {
      onDismiss();
    }, 5000);
    return () => clearTimeout(timer);
  }, [phase, onDismiss]);

  if (!status) {
    return null;
  }

  const { version, progress, transferred, total, error } = status;

  if (phase === 'disabled' || phase === 'idle' || phase === 'checking') {
    return null;
  }

  const versionLabel = version ? `v${version}` : '';

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-sm">
      <div className="rounded-[1.4rem] border border-border-subtle bg-background/95 backdrop-blur-md shadow-elevated overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              phase === 'up-to-date'
                ? 'bg-success/10 text-success'
                : phase === 'error'
                  ? 'bg-error/10 text-error'
                  : 'bg-accent/10 text-accent'
            }`}
          >
            {phase === 'up-to-date' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : phase === 'downloaded' ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">
              {phase === 'available' &&
                t('updater.availableTitle', {
                  version: versionLabel,
                  defaultValue: 'Update {{version}} available',
                })}
              {phase === 'downloading' &&
                t('updater.downloadingTitle', {
                  version: versionLabel,
                  defaultValue: 'Downloading {{version}}…',
                })}
              {phase === 'downloaded' &&
                t('updater.readyTitle', {
                  version: versionLabel,
                  defaultValue: 'Update {{version}} ready',
                })}
              {phase === 'up-to-date' &&
                t('updater.upToDateTitle', { defaultValue: "You're on the latest version" })}
              {phase === 'error' && t('updater.errorTitle', { defaultValue: 'Update failed' })}
            </p>

            <p className="mt-0.5 text-xs text-text-muted">
              {phase === 'available' &&
                t('updater.availableBody', {
                  defaultValue: 'Click download to get the latest version.',
                })}
              {phase === 'downloading' &&
                transferred != null &&
                total != null &&
                t('updater.downloadingBody', {
                  transferred: formatSize(transferred),
                  total: formatSize(total),
                  defaultValue: '{{transferred}} of {{total}}',
                })}
              {phase === 'downloaded' &&
                t('updater.readyBody', {
                  defaultValue: 'Restart Aiden to install the update.',
                })}
              {phase === 'up-to-date' &&
                t('updater.upToDateBody', {
                  version: versionLabel,
                  defaultValue: 'Aiden {{version}} is up to date.',
                })}
              {phase === 'error' &&
                (error || t('updater.errorBody', { defaultValue: 'Try again later.' }))}
            </p>

            {phase === 'downloading' && progress != null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
              </div>
            )}
          </div>

          {phase !== 'downloading' && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-text-muted transition-colors hover:text-text-primary"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {(phase === 'available' || phase === 'downloaded' || phase === 'error') && (
          <div className="border-t border-border-muted px-4 py-3">
            {phase === 'available' && (
              <button
                type="button"
                onClick={onDownload}
                className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
              >
                {t('updater.downloadAction', { defaultValue: 'Download update' })}
              </button>
            )}
            {phase === 'downloaded' && (
              <button
                type="button"
                onClick={onInstall}
                className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
              >
                {t('updater.restartAction', { defaultValue: 'Restart to update' })}
              </button>
            )}
            {phase === 'error' && (
              <button
                type="button"
                onClick={onRetry}
                className="w-full rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
              >
                {t('updater.retryAction', { defaultValue: 'Try again' })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
