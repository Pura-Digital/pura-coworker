import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, ExternalLink, Loader2, Search, Store, X } from 'lucide-react';
import {
  SKILLS_MARKETPLACE_BASE_URL,
  type SkillsMarketplaceItem,
} from '../../../shared/skills-marketplace';

interface PluginMarketplaceModalProps {
  installedSkillNames: Set<string>;
  installActionKey: string | null;
  onClose: () => void;
  onInstall: (item: SkillsMarketplaceItem) => void;
}

function mergeUniqueItems(
  existing: SkillsMarketplaceItem[],
  incoming: SkillsMarketplaceItem[]
): SkillsMarketplaceItem[] {
  const seen = new Set(existing.map((item) => item.marketplaceId));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.marketplaceId)) continue;
    seen.add(item.marketplaceId);
    merged.push(item);
  }
  return merged.sort((a, b) => b.installs - a.installs);
}

export function PluginMarketplaceModal({
  installedSkillNames,
  installActionKey,
  onClose,
  onInstall,
}: PluginMarketplaceModalProps) {
  const { t } = useTranslation();
  const [allItems, setAllItems] = useState<SkillsMarketplaceItem[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextDiscoveryIndex, setNextDiscoveryIndex] = useState(0);
  const [error, setError] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const discoveryIndexRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const isSearchMode = debouncedSearch.trim().length >= 2;

  const displayedItems = useMemo(() => allItems, [allItems]);

  useEffect(() => {
    discoveryIndexRef.current = nextDiscoveryIndex;
  }, [nextDiscoveryIndex]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadCatalogPage = useCallback(
    async (discoveryIndex: number, append: boolean) => {
      const result = await window.electronAPI.skills.browseMarketplace({
        discoveryIndex,
        limit: 100,
      });

      if (!result.success) {
        throw new Error(result.error || t('skills.marketplaceLoadFailed'));
      }

      setAllItems((current) =>
        append ? mergeUniqueItems(current, result.items) : mergeUniqueItems([], result.items)
      );
      setNextDiscoveryIndex(result.nextDiscoveryIndex ?? discoveryIndex + 1);
      setHasMore(result.hasMore);
      return result;
    },
    [t]
  );

  const loadSearchResults = useCallback(
    async (query: string) => {
      const result = await window.electronAPI.skills.browseMarketplace({
        search: query,
        limit: 100,
      });

      if (!result.success) {
        throw new Error(result.error || t('skills.marketplaceSearchFailed'));
      }

      setAllItems(mergeUniqueItems([], result.items));
      setHasMore(false);
      setNextDiscoveryIndex(0);
    },
    [t]
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError('');

      try {
        if (debouncedSearch.length >= 2) {
          await loadSearchResults(debouncedSearch);
        } else {
          discoveryIndexRef.current = 0;
          await loadCatalogPage(0, false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('skills.marketplaceLoadFailed'));
          if (debouncedSearch.length < 2) {
            setAllItems([]);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, loadCatalogPage, loadSearchResults, t]);

  const loadMore = useCallback(async () => {
    if (isSearchMode || !hasMoreRef.current || loadingMoreRef.current) {
      return;
    }

    setLoadingMore(true);
    setError('');

    try {
      await loadCatalogPage(discoveryIndexRef.current, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skills.marketplaceLoadFailed'));
    } finally {
      setLoadingMore(false);
    }
  }, [isSearchMode, loadCatalogPage, t]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel || isSearchMode) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: '120px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isSearchMode, loadMore, loading, allItems.length]);

  function isSkillInstalled(item: SkillsMarketplaceItem): boolean {
    const normalizedName = item.name.trim().toLowerCase();
    const normalizedId = item.skillId.trim().toLowerCase();
    for (const name of installedSkillNames) {
      const value = name.trim().toLowerCase();
      if (value === normalizedName || value === normalizedId) {
        return true;
      }
    }
    return false;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="app-floating-surface relative flex w-full max-w-2xl max-h-[80vh] flex-col rounded-2xl border border-border-subtle shadow-2xl">
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
            {isSearchMode
              ? t('skills.marketplaceSearchResultsRemote', { count: displayedItems.length })
              : t('skills.marketplaceCatalogCount', { count: displayedItems.length })}
          </p>
          {error && <p className="text-[11px] text-error">{error}</p>}
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5"
        >
          {loading ? (
            <div className="flex items-center justify-center py-10 text-text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-text-muted">
                {isSearchMode ? t('skills.marketplaceNoResults') : t('skills.marketplaceEmpty')}
              </p>
            </div>
          ) : (
            <>
              {displayedItems.map((item) => {
                const installed = isSkillInstalled(item);
                const isInstalling = installActionKey === `install:${item.installRef}`;

                return (
                  <div
                    key={item.marketplaceId}
                    className="rounded-lg border border-border-subtle bg-background overflow-hidden"
                  >
                    <div className="flex items-start gap-2 px-2.5 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-medium text-text-primary truncate">
                            {item.name}
                          </span>
                          <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-accent/10 text-accent shrink-0">
                            {t('skills.communityLabel')}
                          </span>
                          {item.installs > 0 && (
                            <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-surface-muted text-text-muted shrink-0">
                              {t('skills.marketplaceInstallCount', { count: item.installs })}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-text-muted mt-0.5 font-mono truncate">
                          {item.source}@{item.skillId}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={item.detailUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-accent hover:bg-surface-hover transition-colors"
                          aria-label={t('skills.marketplaceOpenDetail')}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {installed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-success/10 text-success text-[11px]">
                            <CheckCircle className="w-3.5 h-3.5" />
                            {t('skills.pluginInstalled')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onInstall(item)}
                            disabled={installActionKey !== null}
                            className="px-2 py-1 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  </div>
                );
              })}
              {!isSearchMode && hasMore && (
                <div ref={loadMoreSentinelRef} className="py-3 flex justify-center">
                  {loadingMore && (
                    <Loader2 className="w-5 h-5 animate-spin text-text-muted" aria-hidden />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border-muted flex items-center justify-between gap-3">
          <a
            href={SKILLS_MARKETPLACE_BASE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-accent transition-colors"
          >
            skills.sh
            <ExternalLink className="w-3 h-3" />
          </a>
          <span className="text-[10px] text-text-muted font-mono truncate">
            {SKILLS_MARKETPLACE_BASE_URL}
          </span>
        </div>
      </div>
    </div>
  );
}
