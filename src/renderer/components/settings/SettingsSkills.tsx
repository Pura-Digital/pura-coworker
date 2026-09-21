import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle,
  Package,
  Trash2,
  Plus,
  FolderOpen,
  Globe,
  RefreshCw,
  Store,
  ChevronDown,
  ChevronRight,
  Power,
  PowerOff,
} from 'lucide-react';
import type { Skill, PluginCatalogItemV2, InstalledPlugin, PluginComponentKind } from '../../types';
import { useAppStore } from '../../store';
import {
  SettingsAlert,
  SettingsCard,
  SettingsDisclosure,
} from './shared';
import type { LocalizedBanner } from './shared';
import { PluginMarketplaceModal } from './PluginMarketplaceModal';

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
const componentOrder: PluginComponentKind[] = ['skills', 'commands', 'agents', 'hooks', 'mcp'];

function normalizePluginLookupKey(value: string | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function SettingsSkills({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const skillsStorageChangedAt = useAppStore((state) => state.skillsStorageChangedAt);
  const skillsStorageChangeEvent = useAppStore((state) => state.skillsStorageChangeEvent);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [storagePath, setStoragePath] = useState('');
  const [plugins, setPlugins] = useState<PluginCatalogItemV2[]>([]);
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
  const [installedPluginsByKey, setInstalledPluginsByKey] = useState<
    Record<string, InstalledPlugin>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [isPluginLoading, setIsPluginLoading] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [pluginActionKey, setPluginActionKey] = useState<string | null>(null);
  const [pluginToastMessage, setPluginToastMessage] = useState('');
  const [error, setError] = useState<LocalizedBanner | null>(null);
  const [success, setSuccess] = useState<LocalizedBanner | null>(null);
  const pluginToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!skillsStorageChangeEvent) return;
    if (skillsStorageChangeEvent.reason === 'fallback') {
      setError({ text: t('skills.storagePathFallback') });
      return;
    }
    if (skillsStorageChangeEvent.reason === 'watcher_error') {
      setError({
        text: t('skills.storageWatcherError', {
          message: skillsStorageChangeEvent.message || '',
        }),
      });
    }
  }, [skillsStorageChangeEvent, t]);

  useEffect(() => {
    if (!addMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!addMenuRef.current?.contains(event.target as Node)) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [addMenuOpen]);

  function showPluginInstallToast(message: string) {
    setPluginToastMessage(message);
    if (pluginToastTimerRef.current) {
      clearTimeout(pluginToastTimerRef.current);
    }
    pluginToastTimerRef.current = setTimeout(() => {
      setPluginToastMessage('');
      pluginToastTimerRef.current = null;
    }, 5000);
  }

  const loadSkills = useCallback(async (silent = false) => {
    try {
      const [skillsResult, storagePathResult] = await Promise.allSettled([
        window.electronAPI.skills.getAll(),
        window.electronAPI.skills.getStoragePath(),
      ]);
      const errors: string[] = [];

      if (skillsResult.status === 'fulfilled') {
        setSkills(skillsResult.value || []);
      } else {
        errors.push(
          skillsResult.reason instanceof Error
            ? skillsResult.reason.message
            : tRef.current('skills.failedToLoad')
        );
      }
      if (storagePathResult.status === 'fulfilled') {
        setStoragePath(storagePathResult.value || '');
      } else {
        errors.push(
          storagePathResult.reason instanceof Error
            ? storagePathResult.reason.message
            : tRef.current('skills.storagePathUnavailable')
        );
      }

      if (errors.length > 0) {
        throw new Error(errors.join(' | '));
      }

      if (!silent) {
        setError(null);
      }
    } catch (err) {
      console.error('Failed to load skills:', err);
      if (!silent) {
        setError({
          text:
            err instanceof Error && err.message
              ? `${tRef.current('skills.failedToLoad')}: ${err.message}`
              : tRef.current('skills.failedToLoad'),
        });
      }
    }
  }, []);

  const loadInstalledPlugins = useCallback(async () => {
    try {
      const installed = await window.electronAPI.plugins.listInstalled();
      const nextInstalled = installed || [];
      setInstalledPlugins(nextInstalled);

      const nextInstalledByKey: Record<string, InstalledPlugin> = {};
      const addLookupKey = (key: string, plugin: InstalledPlugin) => {
        if (!key || nextInstalledByKey[key]) return;
        nextInstalledByKey[key] = plugin;
      };
      for (const plugin of nextInstalled) {
        const candidates = [
          plugin.name,
          plugin.name?.toLowerCase(),
          normalizePluginLookupKey(plugin.name),
          plugin.pluginId,
          plugin.pluginId?.toLowerCase(),
          normalizePluginLookupKey(plugin.pluginId),
        ].filter((value): value is string => Boolean(value));
        for (const key of candidates) {
          addLookupKey(key, plugin);
        }
      }
      setInstalledPluginsByKey(nextInstalledByKey);
    } catch (err) {
      console.error('Failed to load installed plugins:', err);
    }
  }, []);

  const loadPlugins = useCallback(async () => {
    try {
      setIsPluginLoading(true);
      const catalog = await window.electronAPI.plugins.listCatalog({ installableOnly: false });
      setPlugins(catalog || []);
      await loadInstalledPlugins();
      setError(null);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : tRef.current('skills.pluginInstallFailed') });
    } finally {
      setIsPluginLoading(false);
    }
  }, [loadInstalledPlugins]);

  useEffect(() => {
    if (!isElectron || !isActive) {
      return () => {
        if (pluginToastTimerRef.current) {
          clearTimeout(pluginToastTimerRef.current);
        }
      };
    }

    void loadSkills();
    void loadInstalledPlugins();

    return () => {
      if (pluginToastTimerRef.current) {
        clearTimeout(pluginToastTimerRef.current);
      }
    };
  }, [isActive, loadInstalledPlugins, loadSkills]);

  useEffect(() => {
    if (isElectron && isActive && skillsStorageChangedAt > 0) {
      void loadSkills(true);
    }
  }, [isActive, loadSkills, skillsStorageChangedAt]);

  async function handleOpenMarketplace() {
    setShowMarketplace(true);
    setAddMenuOpen(false);
    await loadPlugins();
  }

  async function handleInstall() {
    setAddMenuOpen(false);
    try {
      const folderPath = await window.electronAPI.invoke<string | null>({
        type: 'folder.select',
        payload: {},
      });
      if (!folderPath) return;

      setIsLoading(true);
      const validation = await window.electronAPI.skills.validate(folderPath);

      if (!validation.valid) {
        setError({ text: `Invalid skill folder: ${validation.errors.join(', ')}` });
        return;
      }

      const result = await window.electronAPI.skills.install(folderPath);
      if (result.success) {
        await loadSkills();
        setError(null);
        setSuccess(null);
      }
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.failedToInstall') });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectStoragePath() {
    try {
      const folderPath = await window.electronAPI.invoke<string | null>({
        type: 'folder.select',
        payload: {},
      });
      if (!folderPath) return;

      setIsLoading(true);
      const result = await window.electronAPI.skills.setStoragePath(folderPath, true);
      if (result.success) {
        setStoragePath(result.path);
        await loadSkills(true);
        setError(null);
        setSuccess({
          text: t('skills.storagePathUpdated', {
            migrated: result.migratedCount,
            skipped: result.skippedCount,
          }),
        });
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err) {
      setError({
        text: err instanceof Error ? err.message : t('skills.storagePathUpdateFailed'),
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOpenStoragePath() {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.skills.openStoragePath();
      if (!result.success) {
        setError({ text: result.error || t('skills.storagePathOpenFailed') });
        return;
      }
      setStoragePath(result.path);
      setError(null);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.storagePathOpenFailed') });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshSkills() {
    setIsLoading(true);
    try {
      await loadSkills();
      await loadInstalledPlugins();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(skillId: string, skillName: string) {
    if (!confirm(t('skills.deleteSkill', { name: skillName }))) return;

    setIsLoading(true);
    try {
      await window.electronAPI.skills.delete(skillId);
      await loadSkills();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.failedToDelete') });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleEnabled(skill: Skill) {
    setIsLoading(true);
    try {
      await window.electronAPI.skills.setEnabled(skill.id, !skill.enabled);
      await loadSkills();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.failedToToggle') });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleInstallPlugin(plugin: PluginCatalogItemV2) {
    const installTarget = plugin.pluginId ?? plugin.name;
    setPluginActionKey(`install:${installTarget}`);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.electronAPI.plugins.install(installTarget);
      await loadSkills();
      await loadPlugins();
      const message = t('skills.pluginInstallSuccess', { name: result.plugin.name });
      setSuccess({ text: message });
      showPluginInstallToast(message);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.pluginInstallFailed') });
    } finally {
      setPluginActionKey(null);
    }
  }

  async function handleSetPluginEnabled(plugin: InstalledPlugin, enabled: boolean) {
    setPluginActionKey(`enabled:${plugin.pluginId}`);
    setError(null);
    try {
      await window.electronAPI.plugins.setEnabled(plugin.pluginId, enabled);
      await loadInstalledPlugins();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.pluginInstallFailed') });
    } finally {
      setPluginActionKey(null);
    }
  }

  async function handleSetComponentEnabled(
    plugin: InstalledPlugin,
    component: PluginComponentKind,
    enabled: boolean
  ) {
    setPluginActionKey(`component:${plugin.pluginId}:${component}`);
    setError(null);
    try {
      await window.electronAPI.plugins.setComponentEnabled(plugin.pluginId, component, enabled);
      await loadInstalledPlugins();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.pluginInstallFailed') });
    } finally {
      setPluginActionKey(null);
    }
  }

  async function handleUninstallPlugin(plugin: InstalledPlugin) {
    if (!confirm(t('skills.pluginUninstall', { name: plugin.name }))) {
      return;
    }

    setPluginActionKey(`uninstall:${plugin.pluginId}`);
    setError(null);
    try {
      await window.electronAPI.plugins.uninstall(plugin.pluginId);
      await loadPlugins();
      await loadSkills();
      showPluginInstallToast(t('skills.pluginUninstalled', { name: plugin.name }));
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('skills.pluginInstallFailed') });
    } finally {
      setPluginActionKey(null);
    }
  }

  const builtinSkills = skills.filter((skill) => skill.type === 'builtin');
  const userSkills = skills.filter((skill) => skill.type !== 'builtin');
  const enabledSkillCount = skills.filter((skill) => skill.enabled).length;

  return (
    <div className="space-y-3">
      {error && (
        <SettingsAlert variant="error">{error.key ? t(error.key) : error.text}</SettingsAlert>
      )}
      {success && (
        <SettingsAlert variant="success">{success.key ? t(success.key) : success.text}</SettingsAlert>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleOpenMarketplace()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-sm font-medium text-text-primary hover:border-accent/30 hover:bg-surface-hover transition-colors"
        >
          <Store className="w-4 h-4" />
          {t('skills.addFromMarketplace')}
        </button>
        <div className="relative" ref={addMenuRef}>
          <button
            type="button"
            onClick={() => setAddMenuOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('common.add')}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${addMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-lg border border-border-subtle bg-surface shadow-lg py-1">
              <button
                type="button"
                onClick={() => void handleInstall()}
                className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover transition-colors"
              >
                {t('skills.installFromFolder')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {userSkills.length === 0 ? (
          <div className="rounded-lg border border-border-subtle bg-background text-center py-6 text-text-muted">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('skills.noSkills')}</p>
            <p className="text-xs mt-1">{t('skills.installSkillsDesc')}</p>
          </div>
        ) : (
          userSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggleEnabled={() => handleToggleEnabled(skill)}
              onDelete={() => handleDelete(skill.id, skill.name)}
              isLoading={isLoading}
            />
          ))
        )}
      </div>

      {builtinSkills.length > 0 && (
        <AidenOfficeTaskCard
          skills={builtinSkills}
          isLoading={isLoading}
          onToggleEnabled={handleToggleEnabled}
        />
      )}

      {installedPlugins.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide px-0.5">
            {t('skills.installedPlugins')}
          </h3>
          {installedPlugins.map((plugin) => (
            <InstalledPluginCard
              key={plugin.pluginId}
              plugin={plugin}
              pluginActionKey={pluginActionKey}
              onToggleEnabled={(enabled) => handleSetPluginEnabled(plugin, enabled)}
              onToggleComponent={(component, enabled) =>
                handleSetComponentEnabled(plugin, component, enabled)
              }
              onUninstall={() => handleUninstallPlugin(plugin)}
            />
          ))}
        </div>
      )}

      <SettingsDisclosure title={t('skills.advancedStorage')} description={t('skills.storagePathHint')}>
        <p className="text-xs text-text-muted break-all mb-3">
          {storagePath || t('skills.storagePathUnavailable')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <button
            onClick={handleSelectStoragePath}
            disabled={isLoading}
            className="btn btn-secondary text-sm py-2"
          >
            <FolderOpen className="w-4 h-4" />
            {t('skills.selectStoragePath')}
          </button>
          <button
            onClick={handleOpenStoragePath}
            disabled={isLoading}
            className="btn btn-secondary text-sm py-2"
          >
            <Globe className="w-4 h-4" />
            {t('skills.openStoragePath')}
          </button>
          <button
            onClick={handleRefreshSkills}
            disabled={isLoading}
            className="btn btn-secondary text-sm py-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('skills.refreshSkills')}
          </button>
        </div>
      </SettingsDisclosure>

      <div className="text-xs text-text-muted text-center pt-1">
        {t('skills.skillsAvailable', { count: enabledSkillCount })}
      </div>

      {showMarketplace && (
        <PluginMarketplaceModal
          plugins={plugins}
          installedPluginsByKey={installedPluginsByKey}
          isLoading={isPluginLoading}
          pluginActionKey={pluginActionKey}
          onClose={() => setShowMarketplace(false)}
          onInstall={handleInstallPlugin}
        />
      )}

      {pluginToastMessage && (
        <div className="fixed right-6 bottom-6 z-[80] max-w-md rounded-lg border border-success/30 bg-surface px-4 py-3 shadow-elevated">
          <div className="flex items-start gap-2 text-success text-sm">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{pluginToastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SkillRow({
  skill,
  onToggleEnabled,
  onDelete,
  isLoading,
  showTypeBadge = true,
}: {
  skill: Skill;
  onToggleEnabled: () => void;
  onDelete: (() => void) | null;
  isLoading: boolean;
  showTypeBadge?: boolean;
}) {
  const { t } = useTranslation();
  const typeLabel =
    skill.type === 'builtin'
      ? t('skills.typeBuiltin')
      : skill.type === 'mcp'
        ? t('skills.typeMcp')
        : t('skills.typeCustom');

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${
          skill.enabled ? 'bg-success' : 'bg-text-muted'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-[13px] font-medium text-text-primary truncate">{skill.name}</h3>
          {showTypeBadge && (
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-surface-muted text-text-muted shrink-0">
              {typeLabel}
            </span>
          )}
        </div>
        {skill.description && (
          <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{skill.description}</p>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onToggleEnabled}
          disabled={isLoading}
          className={`p-1.5 rounded-md transition-colors ${
            skill.enabled
              ? 'text-success hover:bg-success/10'
              : 'text-text-muted hover:bg-surface-muted'
          }`}
          title={skill.enabled ? t('common.disable') : t('common.enable')}
        >
          {skill.enabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isLoading}
            className="p-1.5 rounded-md text-error hover:bg-error/10 transition-colors"
            title={t('common.delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function SkillCard({
  skill,
  onToggleEnabled,
  onDelete,
  isLoading,
}: {
  skill: Skill;
  onToggleEnabled: () => void;
  onDelete: (() => void) | null;
  isLoading: boolean;
}) {
  return (
    <SettingsCard className="!p-0 overflow-hidden">
      <div className="px-2.5 py-2">
        <SkillRow
          skill={skill}
          onToggleEnabled={onToggleEnabled}
          onDelete={onDelete}
          isLoading={isLoading}
        />
      </div>
    </SettingsCard>
  );
}

function AidenOfficeTaskCard({
  skills,
  isLoading,
  onToggleEnabled,
}: {
  skills: Skill[];
  isLoading: boolean;
  onToggleEnabled: (skill: Skill) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const enabledCount = skills.filter((skill) => skill.enabled).length;

  return (
    <div className="space-y-1.5 pt-1">
      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide px-0.5">
        {t('skills.aidenOfficeTask')}
      </h3>
      <SettingsCard className="!p-0 overflow-hidden">
        <div className="px-2.5 py-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="w-full flex items-center gap-2 text-left"
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                enabledCount > 0 ? 'bg-success' : 'bg-text-muted'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="text-[13px] font-medium text-text-primary truncate">
                  {t('skills.aidenOfficeTask')}
                </h3>
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-surface-muted text-text-muted shrink-0">
                  {t('skills.aidenOfficeTaskCount', { enabled: enabledCount, total: skills.length })}
                </span>
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">{t('skills.aidenOfficeTaskDesc')}</p>
            </div>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
            )}
          </button>

          {expanded && (
            <div className="mt-2 pt-2 border-t border-border-subtle space-y-2">
              {skills.map((skill) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  onToggleEnabled={() => onToggleEnabled(skill)}
                  onDelete={null}
                  isLoading={isLoading}
                  showTypeBadge={false}
                />
              ))}
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}

function InstalledPluginCard({
  plugin,
  pluginActionKey,
  onToggleEnabled,
  onToggleComponent,
  onUninstall,
}: {
  plugin: InstalledPlugin;
  pluginActionKey: string | null;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleComponent: (component: PluginComponentKind, enabled: boolean) => void;
  onUninstall: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const componentEntries = componentOrder.filter((component) => plugin.componentCounts[component] > 0);
  const isBusy = pluginActionKey?.startsWith(`component:${plugin.pluginId}`) ||
    pluginActionKey === `enabled:${plugin.pluginId}` ||
    pluginActionKey === `uninstall:${plugin.pluginId}`;

  return (
    <SettingsCard className="!p-0 overflow-hidden">
      <div className="px-2.5 py-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              plugin.enabled ? 'bg-success' : 'bg-text-muted'
            }`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-[13px] font-medium text-text-primary truncate">{plugin.name}</h3>
              {plugin.version && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-surface-muted text-text-muted shrink-0">
                  v{plugin.version}
                </span>
              )}
            </div>
            {plugin.description && (
              <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{plugin.description}</p>
            )}
            {componentEntries.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent transition-colors mt-0.5"
              >
                <Package className="w-3 h-3" />
                <span>
                  {t('skills.pluginComponents', {
                    skills: plugin.componentCounts.skills,
                    commands: plugin.componentCounts.commands,
                    agents: plugin.componentCounts.agents,
                    hooks: plugin.componentCounts.hooks,
                    mcp: plugin.componentCounts.mcp,
                  })}
                </span>
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onToggleEnabled(!plugin.enabled)}
              disabled={isBusy}
              className={`p-1.5 rounded-md transition-colors ${
                plugin.enabled
                  ? 'text-success hover:bg-success/10'
                  : 'text-text-muted hover:bg-surface-muted'
              }`}
              title={plugin.enabled ? t('common.disable') : t('common.enable')}
            >
              {plugin.enabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onUninstall}
              disabled={isBusy}
              className="p-1.5 rounded-md text-error hover:bg-error/10 transition-colors"
              title={t('skills.pluginManageUninstall')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {expanded && componentEntries.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border-subtle space-y-1">
            {componentEntries.map((component) => {
              const enabled = plugin.componentsEnabled[component];
              return (
                <div
                  key={`${plugin.pluginId}:${component}`}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="text-[11px] text-text-secondary">
                    <span className="font-medium">{component}</span>
                    <span className="text-text-muted"> ({plugin.componentCounts[component]})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleComponent(component, !enabled)}
                    disabled={isBusy}
                    className={`px-2 py-1 rounded text-[10px] ${
                      enabled
                        ? 'bg-success/10 text-success hover:bg-success/20'
                        : 'bg-surface text-text-muted hover:bg-surface-active'
                    } disabled:opacity-50`}
                  >
                    {enabled ? t('skills.pluginDisable') : t('skills.pluginEnable')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
