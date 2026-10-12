import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnonymizationAction, AnonymizationDecision } from '../../shared/anonymization-types';
import { useAppStore } from '../store';

export function AnonymizationDecisions() {
  const { t } = useTranslation();
  const [decisions, setDecisions] = useState<AnonymizationDecision[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const api = window.electronAPI?.anonymization;
    if (!api) return;
    let active = true;
    const resolvedIds = new Set<string>();
    const unsubscribe = api.onEvent((event) => {
      if (!active) return;
      if (event.type === 'decision')
        setDecisions((current) =>
          current.some((d) => d.id === event.decision.id)
            ? current.map((d) => (d.id === event.decision.id ? event.decision : d))
            : [...current, event.decision]
        );
      if (event.type === 'resolved') {
        resolvedIds.add(event.id);
        setDecisions((current) => current.filter((d) => d.id !== event.id));
      }
    });
    void api
      .decisions()
      .then((list) => {
        if (active)
          setDecisions((current) => {
            const latest = new Map(
              list.filter((d) => !resolvedIds.has(d.id)).map((d) => [d.id, d])
            );
            current.forEach((d) => latest.set(d.id, d));
            return [...latest.values()];
          });
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const current = decisions[0];
  const chatTitle = useAppStore(
    (state) => state.sessions.find((session) => session.id === current?.chatId)?.title
  );
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, [currentId]);
  if (!current) return null;
  const decide = async (action: AnonymizationAction) => {
    setError('');
    setSending(true);
    try {
      await window.electronAPI.anonymization.decide(current.id, action);
    } catch {
      setError(t('anonymization.decisionFailed'));
    } finally {
      setSending(false);
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-6">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="anonymization-decision-title"
        aria-describedby="anonymization-decision-reason"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            void decide('cancel');
          }
          if (event.key !== 'Tab') return;
          const buttons = [
            ...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ||
              []),
          ];
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        className="bg-bg-primary border border-border rounded-2xl shadow-xl p-6 max-w-lg w-full space-y-4"
      >
        <h2 id="anonymization-decision-title" className="font-semibold flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          {t('anonymization.attention')}
        </h2>
        <p className="text-xs text-text-muted">
          {t('anonymization.chat', { title: chatTitle || current.chatId.slice(0, 8) })}
        </p>
        <p id="anonymization-decision-reason" className="text-sm text-text-secondary">
          {current.reason}
        </p>
        <p className="text-sm text-error">{t('anonymization.clearWarning')}</p>
        {decisions.length > 1 && (
          <p className="text-xs text-text-muted">
            {t('anonymization.pending', { count: decisions.length })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          {current.actions.map((action) => (
            <button
              key={action}
              type="button"
              className={
                action === 'proceed' ? 'btn btn-secondary text-error' : 'btn btn-secondary'
              }
              disabled={(sending || current.state === 'restarting') && action !== 'cancel'}
              onClick={() => void decide(action)}
            >
              {action === 'restart' && current.state === 'restarting' && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {action === 'restart' && current.recovery === 'system-storage'
                ? t(
                    current.restartApp
                      ? window.electronAPI.platform === 'darwin'
                        ? 'anonymization.authorizeRestart'
                        : 'anonymization.restartApp'
                      : 'anonymization.authorizeAccess'
                  )
                : t(`anonymization.actions.${action}`)}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
