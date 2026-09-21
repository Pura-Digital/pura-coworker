import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, FolderOpen, Loader2, Search, Store, X } from 'lucide-react';
import type { MCPServerConfig } from './shared';
import { SettingsDisclosure } from './shared';
import {
  applyMarketplaceConfiguration,
  filterMarketplaceItems,
  marketplaceConfigurationIsValid,
  MCP_REGISTRY_BASE_URL,
  type McpMarketplaceArgField,
  type McpMarketplaceConfiguration,
  type McpMarketplaceItem,
} from '../../../shared/mcp-registry';

interface McpMarketplaceModalProps {
  onClose: () => void;
  onAdd: (config: MCPServerConfig) => Promise<void>;
  isLoading: boolean;
}

function defaultConfigurationForItem(item: McpMarketplaceItem): McpMarketplaceConfiguration {
  const env: Record<string, string> = {};
  for (const key of [...item.requiredEnv, ...item.optionalEnv]) {
    env[key] = item.config.env?.[key] ?? '';
  }

  const args: Record<string, string> = {};
  for (const arg of [...item.requiredArgs, ...item.optionalArgs]) {
    args[arg.key] = arg.defaultValue ?? '';
  }

  return { env, args, displayName: item.title };
}

export function McpMarketplaceModal({ onClose, onAdd, isLoading }: McpMarketplaceModalProps) {
  const { t } = useTranslation();
  const [allItems, setAllItems] = useState<McpMarketplaceItem[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [remoteSearching, setRemoteSearching] = useState(false);
  const [remoteSearchedQuery, setRemoteSearchedQuery] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [configurations, setConfigurations] = useState<Record<string, McpMarketplaceConfiguration>>(
    {}
  );

  const displayedItems = useMemo(
    () => filterMarketplaceItems(allItems, search),
    [allItems, search]
  );

  const mergeItems = useCallback((incoming: McpMarketplaceItem[]) => {
    setAllItems((current) => {
      const seen = new Set(current.map((item) => item.registryName));
      const merged = [...current];
      for (const item of incoming) {
        if (seen.has(item.registryName)) continue;
        seen.add(item.registryName);
        merged.push(item);
      }
      return merged;
    });
  }, []);

  const loadCatalog = useCallback(async (cursor?: string) => {
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const result = await window.electronAPI.mcp.browseRegistry({
        cursor,
        limit: 80,
      });

      if (!result.success) {
        setError(result.error || t('mcp.marketplaceLoadFailed'));
        if (!cursor) setAllItems([]);
        return;
      }

      mergeItems(result.items);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.marketplaceLoadFailed'));
      if (!cursor) setAllItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [mergeItems, t]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setRemoteSearchedQuery(null);
  }, [search]);

  const runRemoteSearch = useCallback(
    async (query: string) => {
      if (!query || query.length < 2) return;

      setRemoteSearching(true);
      setError('');

      try {
        const result = await window.electronAPI.mcp.browseRegistry({
          search: query,
          remoteSearch: true,
          limit: 120,
        });

        if (!result.success) {
          setError(result.error || t('mcp.marketplaceSearchFailed'));
          return;
        }

        mergeItems(result.newItems ?? []);
        setNextCursor(result.nextCursor);
        setRemoteSearchedQuery(query);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('mcp.marketplaceSearchFailed'));
      } finally {
        setRemoteSearching(false);
      }
    },
    [mergeItems, t]
  );

  useEffect(() => {
    if (debouncedSearch.length < 2) return;
    if (remoteSearchedQuery === debouncedSearch) return;

    const hasLocalMatches = filterMarketplaceItems(allItems, debouncedSearch).length > 0;
    if (hasLocalMatches) {
      setRemoteSearchedQuery(debouncedSearch);
      return;
    }

    void runRemoteSearch(debouncedSearch);
  }, [allItems, debouncedSearch, remoteSearchedQuery, runRemoteSearch]);

  const canExtendSearch =
    Boolean(search.trim()) &&
    displayedItems.length === 0 &&
    !loading &&
    !remoteSearching &&
    remoteSearchedQuery === search.trim();

  function getConfiguration(item: McpMarketplaceItem): McpMarketplaceConfiguration {
    return configurations[item.registryName] ?? defaultConfigurationForItem(item);
  }

  function updateConfiguration(
    registryName: string,
    updater: (current: McpMarketplaceConfiguration) => McpMarketplaceConfiguration
  ) {
    setConfigurations((current) => {
      const item = allItems.find((entry) => entry.registryName === registryName);
      const base = current[registryName] ?? (item ? defaultConfigurationForItem(item) : { env: {}, args: {} });
      return {
        ...current,
        [registryName]: updater(base),
      };
    });
  }

  function openConfiguration(item: McpMarketplaceItem) {
    setExpandedItemId(item.registryName);
    setConfigurations((current) => ({
      ...current,
      [item.registryName]: current[item.registryName] ?? defaultConfigurationForItem(item),
    }));
  }

  async function handleAddItem(item: McpMarketplaceItem) {
    if (item.requiresConfiguration || item.optionalArgs.length > 0 || item.optionalEnv.length > 0) {
      openConfiguration(item);
      return;
    }

    await onAdd({
      id: `mcp-marketplace-${Date.now()}`,
      ...item.config,
      enabled: false,
    });
    onClose();
  }

  async function handleConfirmConfigured(item: McpMarketplaceItem) {
    const configuration = getConfiguration(item);
    if (!marketplaceConfigurationIsValid(item, configuration)) {
      setError(t('mcp.presetConfigIncomplete'));
      return;
    }

    await onAdd({
      id: `mcp-marketplace-${Date.now()}`,
      ...applyMarketplaceConfiguration(item, configuration),
      enabled: false,
    });
    onClose();
  }

  async function handlePickPath(item: McpMarketplaceItem, arg: McpMarketplaceArgField) {
    try {
      const result = await window.electronAPI.project.selectWorkDir();
      const selectedPath = result?.path;
      if (!result?.success || !selectedPath) return;
      updateConfiguration(item.registryName, (current) => ({
        ...current,
        args: { ...current.args, [arg.key]: selectedPath },
      }));
    } catch {
      setError(t('project.errorSelectingDir'));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-full max-w-2xl max-h-[80vh] flex-col rounded-2xl border border-border-subtle bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-muted">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
              <Store className="w-4 h-4 text-accent" />
              {t('mcp.marketplaceTitle')}
            </h2>
            <p className="text-[11px] text-text-muted mt-1">{t('mcp.marketplaceSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-surface-hover transition-colors text-text-secondary"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border-muted space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('mcp.marketplaceSearchPlaceholder')}
              className="w-full rounded-xl border border-border-subtle bg-background pl-9 pr-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <p className="text-[10px] text-text-muted flex items-center gap-2">
            {remoteSearching && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
            <span>
              {search
                ? remoteSearching
                  ? t('mcp.marketplaceSearchingRegistry')
                  : t('mcp.marketplaceSearchResults', {
                      shown: displayedItems.length,
                      total: allItems.length,
                    })
                : t('mcp.marketplaceCatalogCount', { count: allItems.length })}
            </span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {error && (
            <div className="rounded-lg border border-error/25 bg-error/5 px-3 py-2 text-xs text-error">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-sm text-text-muted">
                {search.trim()
                  ? remoteSearching
                    ? t('mcp.marketplaceSearchingRegistry')
                    : remoteSearchedQuery === search.trim()
                      ? t('mcp.marketplaceNoRegistryResults')
                      : t('mcp.marketplaceNoLocalResults')
                  : t('mcp.marketplaceEmpty')}
              </p>
              {canExtendSearch && (
                <button
                  type="button"
                  onClick={() => void runRemoteSearch(search.trim())}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  {t('mcp.marketplaceSearchRegistry')}
                </button>
              )}
            </div>
          ) : (
            displayedItems.map((item) => {
              const isExpanded = expandedItemId === item.registryName;
              const configuration = getConfiguration(item);
              const hasAdvanced =
                item.optionalEnv.length > 0 || item.optionalArgs.length > 0 || item.connectionType === 'local';

              return (
                <div
                  key={item.registryName}
                  className="rounded-lg border border-border-subtle bg-background overflow-hidden"
                >
                  <div className="flex items-start gap-2 px-2.5 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-medium text-text-primary truncate">
                          {item.title}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-accent/10 text-accent shrink-0">
                          {t('mcp.communityLabel')}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-surface-muted text-text-muted shrink-0">
                          {item.connectionType === 'local' ? t('mcp.typeLocal') : t('mcp.typeRemote')}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{item.description}</p>
                      )}
                      <p className="text-[10px] text-text-muted mt-1 font-mono truncate">{item.registryName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedItemId(null);
                        } else {
                          void handleAddItem(item);
                        }
                      }}
                      disabled={isLoading}
                      className="px-2 py-1 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isExpanded
                        ? t('common.cancel')
                        : item.requiresConfiguration
                          ? t('mcp.configure')
                          : t('common.add')}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border-subtle px-3 py-3 space-y-3 bg-accent/5">
                      {item.requiredEnv.map((envKey) => (
                        <ConfigField
                          key={envKey}
                          label={item.envDescription[envKey] || envKey}
                          value={configuration.env[envKey] || ''}
                          secret={item.envSecrets[envKey]}
                          onChange={(value) =>
                            updateConfiguration(item.registryName, (current) => ({
                              ...current,
                              env: { ...current.env, [envKey]: value },
                            }))
                          }
                        />
                      ))}

                      {item.requiredArgs.map((arg) => (
                        <ArgField
                          key={arg.key}
                          arg={arg}
                          value={configuration.args[arg.key] || ''}
                          onChange={(value) =>
                            updateConfiguration(item.registryName, (current) => ({
                              ...current,
                              args: { ...current.args, [arg.key]: value },
                            }))
                          }
                          onPickPath={() => void handlePickPath(item, arg)}
                          pickPathLabel={t('mcp.marketplacePickPath')}
                        />
                      ))}

                      {hasAdvanced && (
                        <SettingsDisclosure title={t('mcp.marketplaceAdvancedConfig')}>
                          <div className="space-y-3 pt-2">
                            <ConfigField
                              label={t('mcp.name')}
                              value={configuration.displayName || ''}
                              onChange={(value) =>
                                updateConfiguration(item.registryName, (current) => ({
                                  ...current,
                                  displayName: value,
                                }))
                              }
                            />

                            {item.optionalEnv.map((envKey) => (
                              <ConfigField
                                key={envKey}
                                label={item.envDescription[envKey] || envKey}
                                value={configuration.env[envKey] || ''}
                                secret={item.envSecrets[envKey]}
                                onChange={(value) =>
                                  updateConfiguration(item.registryName, (current) => ({
                                    ...current,
                                    env: { ...current.env, [envKey]: value },
                                  }))
                                }
                              />
                            ))}

                            {item.optionalArgs.map((arg) => (
                              <ArgField
                                key={arg.key}
                                arg={arg}
                                value={configuration.args[arg.key] || ''}
                                onChange={(value) =>
                                  updateConfiguration(item.registryName, (current) => ({
                                    ...current,
                                    args: { ...current.args, [arg.key]: value },
                                  }))
                                }
                                onPickPath={() => void handlePickPath(item, arg)}
                                pickPathLabel={t('mcp.marketplacePickPath')}
                              />
                            ))}
                          </div>
                        </SettingsDisclosure>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedItemId(null)}
                          className="px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleConfirmConfigured(item)}
                          disabled={isLoading}
                          className="px-4 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                        >
                          {t('common.add')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {nextCursor && !loading && !search && (
            <button
              type="button"
              onClick={() => void loadCatalog(nextCursor)}
              disabled={loadingMore}
              className="w-full py-2 rounded-lg border border-border-subtle text-xs text-text-secondary hover:text-accent hover:border-accent/30 transition-colors"
            >
              {loadingMore ? t('common.loading') : t('mcp.marketplaceLoadMore')}
            </button>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border-muted flex items-center justify-between gap-3">
          <a
            href="https://github.com/modelcontextprotocol/registry"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-accent transition-colors"
          >
            MCP Registry
            <ExternalLink className="w-3 h-3" />
          </a>
          <span className="text-[10px] text-text-muted font-mono truncate">{MCP_REGISTRY_BASE_URL}</span>
        </div>
      </div>
    </div>
  );
}

function ConfigField({
  label,
  value,
  onChange,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
      />
    </div>
  );
}

function ArgField({
  arg,
  value,
  onChange,
  onPickPath,
  pickPathLabel,
}: {
  arg: McpMarketplaceArgField;
  value: string;
  onChange: (value: string) => void;
  onPickPath: () => void;
  pickPathLabel: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">
        {arg.label}
        {arg.isRequired ? ' *' : ''}
      </label>
      {arg.description && (
        <p className="text-[10px] text-text-muted mb-1">{arg.description}</p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={arg.defaultValue}
          className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        {arg.isPath && (
          <button
            type="button"
            onClick={onPickPath}
            className="px-3 py-2 rounded-lg border border-border-subtle text-text-secondary hover:text-accent hover:border-accent/30 transition-colors"
            title={pickPathLabel}
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
