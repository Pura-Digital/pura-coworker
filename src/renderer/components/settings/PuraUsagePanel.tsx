import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { formatAppDateTime } from '../../utils/i18n-format';

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

function formatUsagePercent(usedPercent: number): string {
  if (usedPercent <= 0) {
    return '0%';
  }
  if (usedPercent < 10) {
    return `${usedPercent.toFixed(1)}%`;
  }
  return `${Math.round(usedPercent)}%`;
}

function usageFillClass(usedPercent: number): string {
  if (usedPercent > 95) return 'bg-error';
  if (usedPercent > 80) return 'bg-warning';
  return 'bg-accent';
}

function UsageProgressRow({
  label,
  usedPercent,
}: {
  label: string;
  usedPercent: number;
}) {
  const displayPercent = formatUsagePercent(usedPercent);
  const fillClass = usageFillClass(usedPercent);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-text-primary">{label}</span>
        <span className="shrink-0 tabular-nums text-text-primary">{displayPercent}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-background-secondary"
        role="progressbar"
        aria-valuenow={Math.round(usedPercent * 10) / 10}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${displayPercent}`}
      >
        <div
          className={`h-full min-w-0 rounded-full transition-all duration-500 ease-out ${fillClass}`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
    </div>
  );
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

  const monthlyUsed = toPercent(usage.monthly_used_percent);
  const weeklyUsed = toPercent(usage.weekly_used_percent);
  const weeklyReset = usage.weekly_reset_at ? formatAppDateTime(usage.weekly_reset_at) : null;
  const periodEnd = usage.period_end ? formatAppDateTime(usage.period_end) : null;

  return (
    <div className="space-y-4 rounded-xl border border-border-muted bg-surface-hover/50 p-4">
      <h4 className="text-sm font-semibold text-text-primary">{t('api.puraConnect.usageTitle')}</h4>
      <div className="space-y-4">
        <UsageProgressRow
          label={t('api.puraConnect.monthlyUsage')}
          usedPercent={monthlyUsed}
        />
        <UsageProgressRow
          label={t('api.puraConnect.weeklyUsage')}
          usedPercent={weeklyUsed}
        />
      </div>
      {weeklyReset && periodEnd ? (
        <p className="text-xs leading-relaxed text-text-muted">
          {t('api.puraConnect.usagePeriodMeta', {
            weeklyReset: t('api.puraConnect.weeklyReset', { date: weeklyReset }),
            periodEnd: t('api.puraConnect.periodEnd', { date: periodEnd }),
          })}
        </p>
      ) : null}
      {usage.blocked_reason ? (
        <p className="text-xs text-warning">{usage.blocked_reason}</p>
      ) : null}
    </div>
  );
}
