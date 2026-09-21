import { useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle, ChevronDown, type LucideIcon } from 'lucide-react';

// ==================== Layout ====================

export function SettingsPage({ children }: { children: ReactNode }) {
  return <div className="space-y-6 w-full max-w-3xl min-w-0 pb-4">{children}</div>;
}

export function SettingsCard({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`card p-5 space-y-4 ${className}`}>
      {children}
    </section>
  );
}

export function SettingsCardHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-accent flex-shrink-0" />}
          <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
        </div>
        {description && <p className="text-xs leading-5 text-text-muted">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

// ==================== Controls ====================

export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && <p className="mt-0.5 text-xs leading-5 text-text-muted">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export function SettingsField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium text-text-primary">{label}</label>
        {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function SettingsToggle({
  enabled,
  disabled,
  onToggle,
  label,
  description,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label?: string;
  description?: string;
}) {
  const toggle = (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={enabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 flex-shrink-0 ${
        enabled ? 'bg-accent' : 'bg-surface-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  if (!label) return toggle;

  return (
    <SettingsRow label={label} description={description}>
      {toggle}
    </SettingsRow>
  );
}

export function SettingsSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: T; label: ReactNode; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="settings-segment-track" role="group">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled || opt.disabled}
            onClick={() => onChange(opt.value)}
            data-selected={selected ? 'true' : 'false'}
            aria-pressed={selected}
            className="settings-segment-option disabled:opacity-50"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsOptionList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; description?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
              selected
                ? 'bg-[var(--color-segment-selected-bg)] border-[var(--color-segment-selected-border)] shadow-[0_0_0_1px_var(--color-segment-selected-border)]'
                : 'border-border-subtle bg-surface hover:border-accent/40 hover:bg-surface-hover'
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{opt.label}</p>
              {opt.description && (
                <p className="text-xs text-text-muted mt-0.5">{opt.description}</p>
              )}
            </div>
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selected ? 'border-accent bg-accent' : 'border-border'
              }`}
            >
              {selected && <CheckCircle className="w-3 h-3 text-white" strokeWidth={3} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ==================== Feedback ====================

const feedbackToastTone = {
  error: {
    border: 'border-error/30',
    text: 'text-error',
    icon: AlertCircle,
  },
  success: {
    border: 'border-success/30',
    text: 'text-success',
    icon: CheckCircle,
  },
} as const;

export function SettingsFeedbackToast({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  const message = error || success;
  if (!message) {
    return null;
  }

  const variant = error ? 'error' : 'success';
  const tone = feedbackToastTone[variant];
  const Icon = tone.icon;

  return (
    <div
      className={`fixed right-6 bottom-6 z-[80] max-w-md rounded-lg border bg-surface px-4 py-3 shadow-elevated ${tone.border}`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex items-start gap-2 text-sm ${tone.text}`}>
        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  );
}

export function SettingsAlert({
  variant,
  children,
}: {
  variant: 'error' | 'success' | 'warning' | 'info';
  children: ReactNode;
}) {
  const styles = {
    error: 'bg-error/10 text-error border-error/20',
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    info: 'bg-accent/10 text-accent border-accent/20',
  };
  const Icon = variant === 'success' ? CheckCircle : AlertCircle;

  return (
    <div
      className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm ${styles[variant]}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ==================== Navigation & Disclosure ====================

export function SettingsSubNav<T extends string>({
  items,
  active,
  onChange,
}: {
  items: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      className="settings-subnav-track"
      role="tablist"
      style={{ ['--subnav-count' as string]: items.length }}
    >
      {items.map((item) => {
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            data-selected={selected ? 'true' : 'false'}
            className="settings-subnav-option"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsDisclosure({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover/50 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{title}</p>
          {description && !open && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{description}</p>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border-subtle">{children}</div>
      )}
    </div>
  );
}

export function SettingsStickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 lg:-mx-8 px-4 lg:px-8 py-4 mt-2 bg-background/95 backdrop-blur-sm border-t border-border-muted">
      {children}
    </div>
  );
}
