import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Loader2, Search, Store, X } from 'lucide-react';
import type { InstalledPlugin, PluginCatalogItemV2 } from '../../types';

interface PluginMarketplaceModalProps {
  plugins: PluginCatalogItemV2[];
  installedPluginsByKey: Record<string, InstalledPlugin>;
  isLoading: boolean;
  pluginActionKey: string | null;
  onClose: () => void;
  onInstall: (plugin: PluginCatalogItemV2) => void;
}

function normalizePluginLookupKey(value: string | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCatalogLookupKeys(plugin: PluginCatalogItemV2): string[] {
  const keys = new Set<string>();
  const addKey = (value: string | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    keys.add(trimmed);
    keys.add(trimmed.toLowerCase());
    const normalized = normalizePluginLookupKey(trimmed);
    if (normalized) keys.add(normalized);
  };

  addKey(plugin.name);
  addKey(plugin.pluginId);
  addKey(plugin.pluginId?.split('@')[0]);

  return [...keys];
}

function findInstalledPlugin(
  plugin: PluginCatalogItemV2,
  installedPluginsByKey: Record<string, InstalledPlugin>
): InstalledPlugin | undefined {
  return getCatalogLookupKeys(plugin)
    .map((key) => installedPluginsByKey[key])
    .find((item): item is InstalledPlugin => Boolean(item));
}

function filterPlugins(plugins: PluginCatalogItemV2[], query: string): PluginCatalogItemV2[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return plugins;

  return plugins.filter((plugin) => {
    const haystack = [
      plugin.name,
      plugin.description,
      plugin.pluginId,
      plugin.authorName,
      plugin.installCommand,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export function PluginMarketplaceModal({
  plugins,
  installedPluginsByKey,
  isLoading,
  pluginActionKey,
  onClose,
  onInstall,
}: PluginMarketplaceModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const displayedPlugins = useMemo(() => filterPlugins(plugins, search), [plugins, search]);

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
              {t('skills.marketplaceTitle')}
            </h2>
            <p className="text-[11px] text-text-muted mt-1">{t('skills.marketplaceSubtitle')}</p>
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
              placeholder={t('skills.marketplaceSearchPlaceholder')}
              className="w-full rounded-xl border border-border-subtle bg-background pl-9 pr-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <p className="text-[10px] text-text-muted">
            {search.trim()
              ? t('skills.marketplaceSearchResults', {
                  shown: displayedPlugins.length,
                  total: plugins.length,
                })
              : t('skills.marketplaceCatalogCount', { count: plugins.length })}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : displayedPlugins.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-text-muted">
                {search.trim() ? t('skills.marketplaceNoResults') : t('skills.noPluginsFound')}
              </p>
            </div>
          ) : (
            displayedPlugins.map((plugin) => {
              const installedPlugin = findInstalledPlugin(plugin, installedPluginsByKey);
              const installTarget = plugin.pluginId ?? plugin.name;
              const isInstalling = pluginActionKey === `install:${installTarget}`;
              const isMarketplaceCatalog = plugin.catalogSource === 'claude-marketplace';
              const componentTotal = Object.values(plugin.componentCounts).reduce(
                (sum, count) => sum + count,
                0
              );

              return (
                <div
                  key={plugin.pluginId || plugin.name}
                  className="rounded-lg border border-border-subtle bg-background overflow-hidden"
                >
                  <div className="flex items-start gap-2 px-2.5 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-medium text-text-primary truncate">
                          {plugin.name}
                        </span>
                        {plugin.version && (
                          <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-surface-muted text-text-muted shrink-0">
                            v{plugin.version}
                          </span>
                        )}
                        {isMarketplaceCatalog && (
                          <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-accent/10 text-accent shrink-0">
                            {t('skills.communityLabel')}
                          </span>
                        )}
                        {componentTotal > 0 && (
                          <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-surface-muted text-text-muted shrink-0">
                            {t('skills.pluginSkillCount', {
                              count: plugin.componentCounts.skills,
                            })}
                          </span>
                        )}
                      </div>
                      {plugin.description && (
                        <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                          {plugin.description}
                        </p>
                      )}
                      {componentTotal > 0 && (
                        <p className="text-[10px] text-text-muted mt-1">
                          {t('skills.pluginComponents', {
                            skills: plugin.componentCounts.skills,
                            commands: plugin.componentCounts.commands,
                            agents: plugin.componentCounts.agents,
                            hooks: plugin.componentCounts.hooks,
                            mcp: plugin.componentCounts.mcp,
                          })}
                        </p>
                      )}
                      {isMarketplaceCatalog && !installedPlugin && componentTotal === 0 && (
                        <p className="text-[10px] text-text-muted mt-1">
                          {t('skills.pluginComponentsAvailableAfterInstall')}
                        </p>
                      )}
                      {!plugin.installable && !isMarketplaceCatalog && (
                        <p className="text-[10px] text-error mt-1">{t('skills.pluginNoComponents')}</p>
                      )}
                    </div>
                    {installedPlugin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-success/10 text-success text-[11px] shrink-0">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {t('skills.pluginInstalled')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onInstall(plugin)}
                        disabled={!plugin.installable || pluginActionKey !== null}
                        className="px-2 py-1 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        {isInstalling ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {t('common.install')}
                          </span>
                        ) : (
                          t('skills.pluginInstall')
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
