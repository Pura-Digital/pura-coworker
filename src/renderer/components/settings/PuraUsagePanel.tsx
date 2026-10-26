import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

type UsageShape = {
  monthly_used_percent: number | string;
  monthly_remaining_percent: number | string;
  weekly_used_percent: number | string;
  weekly_remaining_percent: number | string;
  weekly_reset_at: string;
  period_end: string;
  blocked_reason: string | null;
};

function toPercent(value: number | string): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export function PuraUsagePanel({
  configSetId,
  refreshKey,
}: {
  configSetId: string;
  refreshKey?: string | number;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<{
    usage?: UsageShape;
    error?: string;
    loading: boolean;
  }>({ loading: true });

  useEffect(() => {
    let active = true;
    setState({ loading: true });
    void window.electronAPI?.puraConnect?.fetchUsage?.(configSetId).then((result) => {
      if (!active) return;
      if (result?.ok && result.usage) {
        setState({ usage: result.usage as UsageShape, loading: false });
      } else {
        setState({
          error: result?.error || 'usage_failed',
          loading: false,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [configSetId, refreshKey]);

  const { usage, error, loading } = state;

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('api.puraConnect.usageLoading')}
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-error" role="alert">
        {t('api.puraConnect.usageUnavailable', { error })}
      </p>
    );
  }

  if (!usage) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-muted bg-surface-hover/50 p-4">
      <h4 className="text-sm font-medium text-text-primary">{t('api.puraConnect.usageTitle')}</h4>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <p className="text-text-muted">{t('api.puraConnect.monthly')}</p>
          <p className="font-medium tabular-nums">{toPercent(usage.monthly_used_percent)}% used</p>
          <p className="text-xs text-text-muted">
            {t('api.puraConnect.remaining', {
              percent: toPercent(usage.monthly_remaining_percent).toFixed(0),
            })}
          </p>
        </div>
        <div>
          <p className="text-text-muted">{t('api.puraConnect.weekly')}</p>
          <p className="font-medium tabular-nums">{toPercent(usage.weekly_used_percent)}% used</p>
          <p className="text-xs text-text-muted">
            {t('api.puraConnect.remaining', {
              percent: toPercent(usage.weekly_remaining_percent).toFixed(0),
            })}
          </p>
        </div>
      </div>
      {usage.blocked_reason ? (
        <p className="text-xs text-warning">{usage.blocked_reason}</p>
      ) : null}
    </div>
  );
}
