import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApiConfigSet, ProviderModelInfo } from '../types';

interface ChatApiConfigSelectorProps {
  configSets: ApiConfigSet[];
  activeConfigSet?: ApiConfigSet;
  model?: string;
  disabled: boolean;
  onChange: (setId: string) => Promise<boolean>;
  onModelChange: (setId: string, model: string) => Promise<boolean>;
  loadModels: (setId: string) => Promise<ProviderModelInfo[]>;
}

export function ChatApiConfigSelector({
  configSets,
  activeConfigSet,
  model,
  disabled,
  onChange,
  onModelChange,
  loadModels,
}: ChatApiConfigSelectorProps) {
  const { t } = useTranslation();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [models, setModels] = useState<ProviderModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 320, maxHeight: 360 });
  const selectedSet = configSets.find((set) => set.id === selectedSetId);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const positionPanel = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 24);
      const above = rect.top - 16;
      const below = window.innerHeight - rect.bottom - 16;
      const placeAbove = above >= below;
      const maxHeight = Math.min(380, Math.max(0, placeAbove ? above : below));
      const height = Math.min(panelRef.current?.scrollHeight || maxHeight, maxHeight);
      setPosition({
        width,
        maxHeight,
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        top: placeAbove ? rect.top - height - 8 : rect.bottom + 8,
      });
    };
    positionPanel();
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
    };
  }, [open, selectedSetId, models, loading, failed, query]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !panelRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('input, button:not(:disabled)')?.focus();
  }, [open, selectedSetId]);

  useEffect(() => {
    if (!open || !selectedSetId) return;
    let cancelled = false;
    setModels([]);
    setLoading(true);
    setFailed(false);
    void loadModels(selectedSetId)
      .then((items) => {
        if (!cancelled) setModels(items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedSetId, refresh, loadModels]);

  // Keep a manually configured model available even if discovery does not return it.
  const currentModel =
    selectedSetId === activeConfigSet?.id
      ? model
      : selectedSet?.profiles[selectedSet.activeProfileKey]?.model;
  const availableModels = Array.from(
    new Map(
      [...(currentModel ? [{ id: currentModel, name: currentModel }] : []), ...models].map(
        (item) => [item.id, item]
      )
    ).values()
  );
  const filteredModels = availableModels.filter((item) =>
    `${item.name} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  const rowClass =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed';

  if (!activeConfigSet) {
    return <span className="truncate text-xs text-text-muted">{model || t('chat.noModel')}</span>;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${t('api.configSet')}: ${activeConfigSet.name}${model ? ` · ${model}` : ''}`}
        title={`${activeConfigSet.name}${model ? ` · ${model}` : ''}`}
        disabled={disabled}
        onClick={() => {
          setSelectedSetId(null);
          setQuery('');
          setOpen(!open);
        }}
        className="flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="min-w-0 truncate text-text-primary">{activeConfigSet.name}</span>
        {model && (
          <span className="hidden min-w-0 truncate text-text-muted sm:inline">{model}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={
              selectedSet ? `${selectedSet.name} · ${t('api.model')}` : t('api.configSet')
            }
            style={position}
            className="fixed z-[100] overflow-y-auto rounded-2xl border border-border-muted bg-background p-2 shadow-xl"
            onBlur={(event) => {
              if (
                event.relatedTarget &&
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== triggerRef.current
              )
                setOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
              if (
                event.key === 'ArrowLeft' &&
                event.target instanceof HTMLButtonElement &&
                selectedSetId
              ) {
                event.preventDefault();
                setSelectedSetId(null);
                setQuery('');
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const items = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled)')
                );
                const index = items.indexOf(document.activeElement as HTMLElement);
                items[
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                ]?.focus();
              }
            }}
          >
            {selectedSet ? (
              <>
                <div className="flex items-center gap-1 border-b border-border-muted pb-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSetId(null);
                      setQuery('');
                    }}
                    aria-label={t('api.configSet')}
                    className="rounded-lg p-2 text-text-muted hover:bg-surface-hover"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                    {selectedSet.name}
                  </span>
                  <button
                    type="button"
                    disabled={loading || disabled}
                    onClick={() => setRefresh((value) => value + 1)}
                    aria-label={t('api.refreshModels')}
                    title={t('api.refreshModels')}
                    className="rounded-lg p-2 text-text-muted hover:bg-surface-hover disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={t('api.model')}
                  placeholder={t('api.model')}
                  className="mb-2 w-full rounded-lg border border-border-muted bg-transparent px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
                {loading && (
                  <p role="status" className="flex items-center gap-2 p-3 text-xs text-text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('common.loading')}
                  </p>
                )}
                {failed && (
                  <p role="alert" className="p-3 text-xs text-error">
                    {t('api.refreshModelsFailed')}
                  </p>
                )}
                {!loading && !failed && filteredModels.length === 0 && (
                  <p className="p-3 text-xs text-text-muted">{t('api.noModelsAvailable')}</p>
                )}
                {filteredModels.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    className={rowClass}
                    aria-pressed={item.id === currentModel}
                    title={item.id}
                    onClick={async () => {
                      if (await onModelChange(selectedSet.id, item.id)) close();
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.name || item.id}</span>
                    {item.id === currentModel && <Check className="h-4 w-4 shrink-0 text-accent" />}
                  </button>
                ))}
              </>
            ) : (
              <>
                <p className="px-3 py-2 text-xs font-medium text-text-muted">
                  {t('api.configSet')}
                </p>
                {configSets.map((set) => (
                  <button
                    key={set.id}
                    type="button"
                    disabled={disabled}
                    className={rowClass}
                    aria-pressed={set.id === activeConfigSet.id}
                    onClick={async () => {
                      if (await onChange(set.id)) {
                        setQuery('');
                        setSelectedSetId(set.id);
                      }
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{set.name}</span>
                    {set.id === activeConfigSet.id && (
                      <Check className="h-4 w-4 shrink-0 text-accent" />
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                  </button>
                ))}
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
