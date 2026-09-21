import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plug,
  CheckCircle,
  Edit3,
  Trash2,
  Plus,
  Power,
  PowerOff,
  Loader2,
  ChevronRight,
  ChevronDown,
  Store,
  X,
} from 'lucide-react';
import type { MCPServerConfig, MCPServerStatus, MCPToolInfo, MCPPreset } from './shared';
import {
  SettingsFeedbackToast,
  SettingsCard,
  SettingsDisclosure,
} from './shared';
import { McpPresetLogo } from '../McpPresetLogo';
import {
  presetUrlHasUnresolvedPlaceholders,
  resolvePresetUrl,
} from '../../../shared/mcp-preset-url';
import {
  applyOAuthFormToServerConfig,
  defaultCustomOAuthFormState,
  mcpStatusLabelKey,
  validateCustomOAuthForm,
  type CustomOAuthFormState,
} from '../../../shared/mcp-oauth-form';
import { MCP_OAUTH_REDIRECT_URI } from '../../../shared/mcp-oauth';
import {
  formatMcpServerDisplayName,
  isGuiOperateServerName,
} from '../../../shared/mcp-display-names';
import { McpMarketplaceModal } from './McpMarketplaceModal';

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

function serverMatchesPreset(server: MCPServerConfig, preset: MCPPreset): boolean {
  if (server.name === preset.name) return true;
  return isGuiOperateServerName(server.name) && isGuiOperateServerName(preset.name);
}

function isPresetAlreadyAdded(servers: MCPServerConfig[], preset: MCPPreset): boolean {
  return servers.some((server) => {
    if (!serverMatchesPreset(server, preset)) return false;
    if (preset.type === 'stdio') {
      return server.command === preset.command;
    }
    return server.type === preset.type;
  });
}

const PRESET_DESC_KEYS: Record<string, string> = {
  archiveye: 'mcp.presetDesc.archiveye',
  chrome: 'mcp.presetDesc.chrome',
  'gui-operate': 'mcp.presetDesc.computerUse',
};

type AddPanelMode = 'local' | 'remote';

function presetUserDescription(presetKey: string, t: (key: string) => string): string {
  const key = PRESET_DESC_KEYS[presetKey];
  return key ? t(key) : '';
}

function friendlyConnectionType(
  type: MCPServerConfig['type'],
  t: (key: string) => string
): string {
  if (type === 'stdio') return t('mcp.typeLocal');
  return t('mcp.typeCloud');
}

function presetEnvLabel(preset: MCPPreset, envKey: string): string {
  return preset.envDescription?.[envKey] || envKey;
}

export function SettingsConnectors({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [statuses, setStatuses] = useState<MCPServerStatus[]>([]);
  const [tools, setTools] = useState<MCPToolInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null);
  const [addPanel, setAddPanel] = useState<AddPanelMode | null>(null);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [presets, setPresets] = useState<Record<string, MCPPreset>>({});
  const [configuringPreset, setConfiguringPreset] = useState<{
    key: string;
    preset: MCPPreset;
  } | null>(null);
  const [presetEnvValues, setPresetEnvValues] = useState<Record<string, string>>({});

  // Auto-refresh
  const loadPresets = useCallback(async () => {
    try {
      const loaded = (await window.electronAPI.mcp.getPresets()) as Record<string, MCPPreset>;
      setPresets(loaded || {});
    } catch (err) {
      console.error('Failed to load presets:', err);
    }
  }, []);

  const loadServers = useCallback(async () => {
    try {
      const loaded = (await window.electronAPI.mcp.getServers()) as MCPServerConfig[];
      setServers(loaded || []);
      setError('');
    } catch (err) {
      console.error('Failed to load servers:', err);
      setError(tRef.current('mcp.loadServersFailed'));
    }
  }, []);

  const loadStatuses = useCallback(async () => {
    try {
      const loaded = (await window.electronAPI.mcp.getServerStatus()) as MCPServerStatus[];
      setStatuses(loaded || []);
    } catch (err) {
      console.error('Failed to load statuses:', err);
    }
  }, []);

  const loadTools = useCallback(async () => {
    try {
      const loaded = (await window.electronAPI.mcp.getTools()) as MCPToolInfo[];
      setTools(loaded || []);
    } catch (err) {
      console.error('Failed to load tools:', err);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadServers(), loadStatuses(), loadTools(), loadPresets()]);
  }, [loadPresets, loadServers, loadStatuses, loadTools]);

  useEffect(() => {
    if (!isElectron || !isActive) {
      return;
    }
    void loadAll();
    const interval = setInterval(() => {
      void loadTools();
      void loadStatuses();
    }, 3000);
    return () => clearInterval(interval);
  }, [isActive, loadAll, loadStatuses, loadTools]);

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

  async function handleAddPreset(presetKey: string) {
    const preset = presets[presetKey];
    if (!preset) return;

    if (isPresetAlreadyAdded(servers, preset)) {
      setError(t('mcp.presetAlreadyConfigured', { name: formatMcpServerDisplayName(preset.name) }));
      return;
    }

    // Check if preset requires environment variables
    if (preset.requiresEnv && preset.requiresEnv.length > 0) {
      // Initialize env values from preset defaults
      const initialEnv: Record<string, string> = {};
      preset.requiresEnv.forEach((key: string) => {
        initialEnv[key] = preset.env?.[key] || '';
      });
      setPresetEnvValues(initialEnv);
      setConfiguringPreset({ key: presetKey, preset });
      return;
    }

    // No env required, add directly
    await addPresetServer(presetKey, preset, {});
  }

  async function addPresetServer(
    presetKey: string,
    preset: MCPPreset,
    envOverrides: Record<string, string>
  ) {
    const resolvedUrl = resolvePresetUrl(preset.url, envOverrides);
    if (presetUrlHasUnresolvedPlaceholders(resolvedUrl)) {
      setError(t('mcp.presetConfigIncomplete'));
      return;
    }

    const serverConfig: MCPServerConfig = {
      id: `mcp-${presetKey}-${Date.now()}`,
      name: preset.name,
      type: preset.type,
      // STDIO fields
      command: preset.command,
      args: preset.args,
      env: preset.type === 'stdio' ? { ...preset.env, ...envOverrides } : undefined,
      // Remote fields
      url: resolvedUrl,
      headers: preset.headers,
      authType: preset.authType,
      oauth: preset.oauth,
      enabled: false,
    };

    await handleSaveServer(serverConfig);
    setAddPanel(null);
    setConfiguringPreset(null);
    setPresetEnvValues({});
  }

  async function handleSaveServer(server: MCPServerConfig) {
    setIsLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.mcp.saveServer(server);
      if (result && !result.success && result.error) {
        setError(result.error);
        // Keep form open so the user can see and act on the error
        return;
      }
      await loadAll();
      setEditingServer(null);
      setAddPanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.saveServerFailed'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteServer(serverId: string) {
    if (!confirm(t('mcp.deleteConnectorConfirm'))) return;
    setIsLoading(true);
    try {
      await window.electronAPI.mcp.deleteServer(serverId);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.deleteServerFailed'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleEnabled(server: MCPServerConfig) {
    await handleSaveServer({ ...server, enabled: !server.enabled });
  }

  async function handleStartOAuth(serverId: string) {
    setIsLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.mcp.startOAuth(serverId);
      if (!result.success) {
        setError(result.error || t('mcp.oauthStartFailed'));
        return;
      }
      await loadStatuses();
      await loadTools();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.oauthStartFailed'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisconnectOAuth(serverId: string) {
    setIsLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.mcp.disconnectOAuth(serverId);
      if (!result.success) {
        setError(result.error || t('mcp.oauthDisconnectFailed'));
        return;
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.oauthDisconnectFailed'));
    } finally {
      setIsLoading(false);
    }
  }

  function getServerStatus(serverId: string) {
    return statuses.find((s) => s.id === serverId);
  }

  function getServerTools(serverId: string) {
    return tools.filter((t) => t.serverId === serverId);
  }

  function openAddPanel(mode: AddPanelMode) {
    setAddPanel((current) => (current === mode ? null : mode));
    setAddMenuOpen(false);
    setEditingServer(null);
    setConfiguringPreset(null);
  }

  return (
    <div className="space-y-3">
      <SettingsFeedbackToast error={error} />

      {/* List header + add menu */}
      {!editingServer && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setShowMarketplace(true);
              setAddPanel(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-sm font-medium text-text-primary hover:border-accent/30 hover:bg-surface-hover transition-colors"
          >
            <Store className="w-4 h-4" />
            {t('mcp.addFromMarketplace')}
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
                  onClick={() => openAddPanel('local')}
                  className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover transition-colors"
                >
                  {t('mcp.typeLocal')}
                </button>
                <button
                  type="button"
                  onClick={() => openAddPanel('remote')}
                  className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover transition-colors"
                >
                  {t('mcp.typeRemote')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom connector form */}
      {addPanel && !editingServer && !configuringPreset && (
        <CustomConnectorPanel
          mode={addPanel}
          onSave={handleSaveServer}
          onClose={() => setAddPanel(null)}
          isLoading={isLoading}
        />
      )}

      {/* Edit Form */}
      {editingServer && (
        <ServerForm
          server={editingServer}
          connectionMode={editingServer.type === 'stdio' ? 'local' : 'remote'}
          onSave={handleSaveServer}
          onCancel={() => setEditingServer(null)}
          isLoading={isLoading}
        />
      )}

      {/* Preset Environment Configuration Modal */}
      {configuringPreset && (
        <div className="p-4 rounded-lg border border-accent/30 bg-accent/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <McpPresetLogo presetKey={configuringPreset.key} />
              <h3 className="text-sm font-medium text-text-primary">
                {t('mcp.configure')} {formatMcpServerDisplayName(configuringPreset.preset.name)}
              </h3>
            </div>
            <button
              onClick={() => {
                setConfiguringPreset(null);
                setPresetEnvValues({});
              }}
              className="text-text-muted hover:text-text-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-text-muted">
            This connector requires configuration before it can be added.
          </p>
          <div className="space-y-3">
            {configuringPreset.preset.requiresEnv?.map((envKey: string) => (
              <div key={envKey}>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  {presetEnvLabel(configuringPreset.preset, envKey)}
                </label>
                <input
                  type="password"
                  value={presetEnvValues[envKey] || ''}
                  onChange={(e) =>
                    setPresetEnvValues((prev) => ({ ...prev, [envKey]: e.target.value }))
                  }
                  placeholder={`Enter ${envKey}`}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setConfiguringPreset(null);
                setPresetEnvValues({});
              }}
              className="px-3 py-1.5 rounded-md text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() =>
                void addPresetServer(
                  configuringPreset.key,
                  configuringPreset.preset,
                  presetEnvValues
                )
              }
              disabled={
                isLoading ||
                configuringPreset.preset.requiresEnv?.some(
                  (key: string) => !presetEnvValues[key]?.trim()
                )
              }
              className="px-4 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {t('common.add')}
            </button>
          </div>
        </div>
      )}

      {/* Server List */}
      {!editingServer && (
        <div className="space-y-1.5">
          {servers.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-background text-center py-6 text-text-muted">
              <Plug className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('mcp.noConnectors')}</p>
              <p className="text-xs mt-1">{t('mcp.addConnector')}</p>
            </div>
          ) : (
            servers.map((server) => {
              const status = getServerStatus(server.id);
              const serverTools = getServerTools(server.id);

              return (
                <ServerCard
                  key={server.id}
                  server={server}
                  status={status}
                  toolCount={serverTools.length}
                  tools={serverTools}
                  onEdit={() => {
                    setAddPanel(null);
                    setEditingServer(server);
                  }}
                  onDelete={() => handleDeleteServer(server.id)}
                  onToggleEnabled={() => handleToggleEnabled(server)}
                  onAuthenticate={() => handleStartOAuth(server.id)}
                  onDisconnectOAuth={() => handleDisconnectOAuth(server.id)}
                  isLoading={isLoading}
                />
              );
            })
          )}
        </div>
      )}

      {/* Presets */}
      {!editingServer && !configuringPreset && Object.keys(presets).length > 0 && (
        <div className="space-y-1.5 pt-1">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide px-0.5">
            {t('mcp.quickAddPresets')}
          </h3>
          <div className="space-y-1">
            {Object.entries(presets).map(([key, preset]) => (
              <PresetCard
                key={key}
                presetKey={key}
                preset={preset}
                isAdded={isPresetAlreadyAdded(servers, preset)}
                isLoading={isLoading}
                onAdd={() => handleAddPreset(key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="text-xs text-text-muted text-center pt-1">
        {t('mcp.toolsAvailable', { count: tools.length })}
      </div>

      {showMarketplace && (
        <McpMarketplaceModal
          onClose={() => setShowMarketplace(false)}
          onAdd={handleSaveServer}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

function PresetCard({
  presetKey,
  preset,
  isAdded,
  isLoading,
  onAdd,
}: {
  presetKey: string;
  preset: MCPPreset;
  isAdded: boolean;
  isLoading: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const requiresConfig = preset.requiresEnv && preset.requiresEnv.length > 0;
  const description = presetUserDescription(presetKey, t);

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border ${
        isAdded
          ? 'border-border-subtle bg-surface-muted/50 opacity-70'
          : 'border-border-subtle bg-surface hover:border-accent/25 transition-colors'
      }`}
    >
      <McpPresetLogo presetKey={presetKey} className="!h-7 !w-8" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-text-primary truncate">
            {formatMcpServerDisplayName(preset.name)}
          </span>
          {requiresConfig && !isAdded && (
            <span className="px-1 py-0.5 text-[9px] font-medium rounded-full bg-warning/10 text-warning shrink-0">
              {t('mcp.requiresToken')}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[11px] text-text-muted truncate leading-4">{description}</p>
        )}
      </div>
      {isAdded ? (
        <div className="flex items-center gap-1 text-success text-[11px] shrink-0">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>{t('mcp.added')}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={isLoading}
          className="px-2 py-1 rounded-md bg-accent text-white text-[11px] font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 shrink-0"
        >
          {requiresConfig ? t('mcp.configure') : t('common.add')}
        </button>
      )}
    </div>
  );
}

function CustomConnectorPanel({
  mode,
  onSave,
  onClose,
  isLoading,
}: {
  mode: AddPanelMode;
  onSave: (server: MCPServerConfig) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-accent/25 bg-accent/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-text-primary">
          {mode === 'local' ? t('mcp.typeLocal') : t('mcp.typeRemote')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors"
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ServerForm
        connectionMode={mode}
        onSave={onSave}
        onCancel={onClose}
        isLoading={isLoading}
        compact
      />
    </div>
  );
}

function ServerCard({
  server,
  status,
  toolCount,
  tools,
  onEdit,
  onDelete,
  onToggleEnabled,
  onAuthenticate,
  onDisconnectOAuth,
  isLoading,
}: {
  server: MCPServerConfig;
  status?: MCPServerStatus;
  toolCount: number;
  tools: MCPToolInfo[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
  onAuthenticate: () => void;
  onDisconnectOAuth: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  // Fall back to 'connecting' for enabled servers when status poll hasn't returned yet
  const serverStatus = status?.status ?? (server.enabled ? 'connecting' : 'disabled');
  const [showTools, setShowTools] = useState(false);

  const technicalDetail =
    server.type === 'stdio'
      ? `${server.command} ${server.args?.join(' ') || ''}`.trim()
      : server.url || '';

  const statusClass =
    serverStatus === 'connected'
      ? 'bg-success/10 text-success'
      : serverStatus === 'failed'
        ? 'bg-error/10 text-error'
        : serverStatus === 'auth-required' || serverStatus === 'authenticating'
          ? 'bg-accent/10 text-accent'
          : serverStatus === 'connecting'
            ? 'bg-warning/10 text-warning'
            : 'bg-surface-muted text-text-muted';

  return (
    <SettingsCard className="!p-0 overflow-hidden">
      <div className="px-2.5 py-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              serverStatus === 'connected'
                ? 'bg-success'
                : serverStatus === 'failed'
                  ? 'bg-error'
                  : serverStatus === 'auth-required' || serverStatus === 'authenticating'
                    ? 'bg-accent'
                    : serverStatus === 'connecting'
                      ? 'bg-warning'
                      : 'bg-text-muted'
            }`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-[13px] font-medium text-text-primary truncate">
                {formatMcpServerDisplayName(server.name)}
              </h3>
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-surface-muted text-text-muted shrink-0">
                {friendlyConnectionType(server.type, t)}
              </span>
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full shrink-0 ${statusClass}`}>
                {t(mcpStatusLabelKey(serverStatus), {
                  defaultValue:
                    serverStatus === 'failed'
                      ? 'Connection failed'
                      : serverStatus === 'disabled'
                        ? 'Disabled'
                        : undefined,
                })}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                type="button"
                onClick={() => setShowTools(!showTools)}
                className="flex items-center gap-1 text-[11px] text-text-muted hover:text-accent transition-colors"
              >
                <Plug className="w-3 h-3" />
                <span>{t('mcp.toolsAvailable', { count: toolCount })}</span>
                {showTools ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
              {server.authType === 'oauth' &&
                (serverStatus === 'auth-required' || serverStatus === 'authenticating') && (
                  <button
                    type="button"
                    onClick={onAuthenticate}
                    disabled={isLoading || serverStatus === 'authenticating'}
                    className="text-[11px] text-accent hover:underline disabled:opacity-50"
                  >
                    {serverStatus === 'authenticating' ? t('mcp.authenticating') : t('mcp.reconnect')}
                  </button>
                )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onToggleEnabled}
              disabled={isLoading}
              className={`p-1.5 rounded-md transition-colors ${
                server.enabled
                  ? 'text-success hover:bg-success/10'
                  : 'text-text-muted hover:bg-surface-muted'
              }`}
              title={
                server.enabled ? t('common.disable') || 'Disable' : t('common.enable') || 'Enable'
              }
            >
              {server.enabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onEdit}
              disabled={isLoading}
              className="p-1.5 rounded-md text-text-muted hover:bg-surface-muted transition-colors"
              title={t('common.edit')}
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isLoading}
              className="p-1.5 rounded-md text-error hover:bg-error/10 transition-colors"
              title={t('common.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {showTools && tools.length > 0 && (
          <div className="mt-2 pl-4 pr-1 py-2 rounded-md bg-surface-muted/80 border border-border-subtle max-h-36 overflow-y-auto space-y-1">
            {tools.map((tool, idx) => {
              const parts = tool.name.split('__');
              const displayName = parts.length > 1 ? parts[parts.length - 1] : tool.name;
              return (
                <div
                  key={idx}
                  className="text-[11px] text-text-secondary font-mono truncate"
                  title={tool.description || tool.name}
                >
                  {displayName}
                </div>
              );
            })}
          </div>
        )}
        {showTools && tools.length === 0 && (
          <div className="mt-2 pl-4 text-[11px] text-text-muted">{t('mcp.notConnected')}</div>
        )}
        {technicalDetail && (
          <div className="mt-1 pl-4">
            <SettingsDisclosure title={t('mcp.showTechnicalDetails')}>
              <p className="font-mono text-[10px] text-text-secondary break-all">{technicalDetail}</p>
            </SettingsDisclosure>
          </div>
        )}
        {server.authType === 'oauth' && serverStatus === 'connected' && (
          <div className="mt-1 pl-4">
            <button
              type="button"
              onClick={onDisconnectOAuth}
              disabled={isLoading}
              className="text-[11px] text-text-muted hover:text-error transition-colors"
            >
              {t('mcp.disconnectOAuth')}
            </button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

function ServerForm({
  server,
  connectionMode,
  compact = false,
  onSave,
  onCancel,
  isLoading,
}: {
  server?: MCPServerConfig;
  connectionMode?: AddPanelMode;
  compact?: boolean;
  onSave: (server: MCPServerConfig) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const defaultType =
    server?.type ||
    (connectionMode === 'remote' ? 'streamable-http' : connectionMode === 'local' ? 'stdio' : 'stdio');
  const [name, setName] = useState(server?.name || '');
  const [type, setType] = useState<'stdio' | 'sse' | 'streamable-http'>(defaultType);
  const [command, setCommand] = useState(server?.command || '');
  const [args, setArgs] = useState(server?.args?.join(' ') || '');
  const [url, setUrl] = useState(server?.url || '');
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  // Environment variables (for tokens, etc.)
  const [envVars, setEnvVars] = useState<Record<string, string>>(server?.env || {});
  const [showEnvSection, setShowEnvSection] = useState(Object.keys(server?.env || {}).length > 0);
  const [oauthForm, setOAuthForm] = useState<CustomOAuthFormState>(() =>
    defaultCustomOAuthFormState(server)
  );

  useEffect(() => {
    if (connectionMode === 'local') {
      setType('stdio');
    } else if (connectionMode === 'remote' && type === 'stdio') {
      setType('streamable-http');
    }
  }, [connectionMode, type]);

  function handleEnvChange(key: string, value: string) {
    setEnvVars((prev) => ({ ...prev, [key]: value }));
  }

  const [isAddingEnvVar, setIsAddingEnvVar] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  const handleAddEnvVar = () => {
    setIsAddingEnvVar(true);
    setShowEnvSection(true);
  };

  const handleSaveNewEnvVar = () => {
    if (newEnvKey.trim()) {
      setEnvVars((prev) => ({ ...prev, [newEnvKey.trim()]: newEnvValue.trim() }));
      setNewEnvKey('');
      setNewEnvValue('');
      setIsAddingEnvVar(false);
    }
  };

  const handleCancelNewEnvVar = () => {
    setNewEnvKey('');
    setNewEnvValue('');
    setIsAddingEnvVar(false);
  };

  function handleRemoveEnvVar(key: string) {
    setEnvVars((prev) => {
      const newVars = { ...prev };
      delete newVars[key];
      return newVars;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let config: MCPServerConfig = {
      id: server?.id || `mcp-${Date.now()}`,
      name: name.trim(),
      type,
      enabled,
    };

    if (type === 'stdio') {
      if (!command.trim()) {
        alert(t('mcp.commandRequired'));
        return;
      }
      config.command = command.trim();
      config.args = args.trim() ? args.trim().split(/\s+/) : [];
      // Include environment variables
      if (Object.keys(envVars).length > 0) {
        config.env = envVars;
      }
    } else {
      if (!url.trim()) {
        alert(t('mcp.urlRequired'));
        return;
      }
      config.url = url.trim();

      const oauthValidationError = validateCustomOAuthForm(type, url, oauthForm);
      if (oauthValidationError) {
        alert(oauthValidationError);
        return;
      }
      config = applyOAuthFormToServerConfig(config, oauthForm);
    }

    onSave(config);
  }

  const fieldClass = compact
    ? 'w-full px-3 py-1.5 rounded-md bg-background border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30'
    : 'w-full px-4 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30';
  const labelClass = compact
    ? 'block text-xs font-medium text-text-primary mb-1'
    : 'block text-sm font-medium text-text-primary mb-2';

  return (
    <form
      onSubmit={handleSubmit}
      className={
        compact
          ? 'space-y-2.5'
          : 'rounded-lg border border-border bg-surface p-4 space-y-4'
      }
    >
      {!compact && (
        <h3 className="font-medium text-text-primary">
          {server ? t('mcp.editConnector') : t('mcp.addConnectorTitle')}
        </h3>
      )}

      <div>
        <label className={labelClass}>{t('mcp.name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('mcp.namePlaceholder')}
          className={fieldClass}
          required
        />
      </div>

      {!connectionMode && (
        <div>
          <label className={labelClass}>{t('mcp.type')}</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setType('stdio')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                type === 'stdio'
                  ? 'bg-accent text-white'
                  : 'bg-surface-muted text-text-secondary hover:bg-surface-active'
              }`}
            >
              {t('mcp.typeStdioLocal')}
            </button>
            <button
              type="button"
              onClick={() => setType('sse')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                type === 'sse'
                  ? 'bg-accent text-white'
                  : 'bg-surface-muted text-text-secondary hover:bg-surface-active'
              }`}
            >
              {t('mcp.typeSseRemote')}
            </button>
            <button
              type="button"
              onClick={() => setType('streamable-http')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                type === 'streamable-http'
                  ? 'bg-accent text-white'
                  : 'bg-surface-muted text-text-secondary hover:bg-surface-active'
              }`}
            >
              {t('mcp.typeStreamableHttp')}
            </button>
          </div>
        </div>
      )}

      {connectionMode === 'remote' && (
        <div>
          <label className={labelClass}>{t('mcp.type')}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('streamable-http')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                type === 'streamable-http'
                  ? 'bg-accent text-white'
                  : 'bg-surface-muted text-text-secondary hover:bg-surface-active'
              }`}
            >
              {t('mcp.typeStreamableHttp')}
            </button>
            <button
              type="button"
              onClick={() => setType('sse')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                type === 'sse'
                  ? 'bg-accent text-white'
                  : 'bg-surface-muted text-text-secondary hover:bg-surface-active'
              }`}
            >
              {t('mcp.typeSseRemote')}
            </button>
          </div>
        </div>
      )}

      {type === 'stdio' ? (
        <>
          <div>
            <label className={labelClass}>{t('mcp.command')}</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t('mcp.commandPlaceholder')}
              className={`${fieldClass} font-mono`}
              required
            />
          </div>
          <div>
            <label className={labelClass}>{t('mcp.arguments')}</label>
            <input
              type="text"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder={t('mcp.argumentsPlaceholder')}
              className={`${fieldClass} font-mono`}
            />
            <p className="text-[11px] text-text-muted mt-1">{t('mcp.spaceSeparated')}</p>
          </div>

          {/* Environment Variables Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text-primary">
                {t('credentials.envVars')}
              </label>
              <button
                type="button"
                onClick={() => setShowEnvSection(!showEnvSection)}
                className="text-xs text-accent hover:text-accent-hover"
              >
                {showEnvSection ? t('mcp.hide') : t('mcp.show')}
              </button>
            </div>
            {showEnvSection && (
              <div className="space-y-2 p-3 rounded-lg bg-surface-muted border border-border">
                {Object.entries(envVars).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className="text-xs font-mono text-text-secondary w-32 truncate"
                      title={key}
                    >
                      {key}
                    </span>
                    <input
                      type="password"
                      value={value}
                      onChange={(e) => handleEnvChange(key, e.target.value)}
                      placeholder={`${t('mcp.envValuePlaceholder')}: ${key}`}
                      className="flex-1 px-3 py-1.5 rounded bg-background border border-border text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveEnvVar(key)}
                      className="p-1.5 rounded hover:bg-error/10 text-text-muted hover:text-error transition-colors"
                      title={t('mcp.removeVar')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {Object.keys(envVars).length === 0 && !isAddingEnvVar && (
                  <p className="text-xs text-text-muted text-center py-2">
                    {t('credentials.noEnvVars')}
                  </p>
                )}
                {isAddingEnvVar && (
                  <div className="space-y-2 p-2 rounded bg-background border border-accent/30">
                    <input
                      type="text"
                      value={newEnvKey}
                      onChange={(e) => setNewEnvKey(e.target.value)}
                      placeholder="NOTION_TOKEN"
                      className="w-full px-3 py-1.5 rounded bg-surface border border-border text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/30"
                      autoFocus
                    />
                    <input
                      type="password"
                      value={newEnvValue}
                      onChange={(e) => setNewEnvValue(e.target.value)}
                      placeholder={t('mcp.envValuePlaceholder')}
                      className="w-full px-3 py-1.5 rounded bg-surface border border-border text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveNewEnvVar}
                        disabled={!newEnvKey.trim()}
                        className="flex-1 py-1 px-3 rounded bg-accent text-white text-xs hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('common.save')}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelNewEnvVar}
                        className="flex-1 py-1 px-3 rounded bg-surface-muted text-text-secondary text-xs hover:bg-surface-active transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
                {!isAddingEnvVar && (
                  <button
                    type="button"
                    onClick={handleAddEnvVar}
                    className="w-full mt-2 py-1.5 px-3 rounded border border-dashed border-border hover:border-accent hover:bg-accent/5 text-xs text-text-secondary hover:text-accent transition-colors flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('credentials.envVars')}
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-text-muted">{t('credentials.usedForTokens')}</p>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className={labelClass}>{t('mcp.url')}</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className={`${fieldClass} font-mono`}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              {t('mcp.authMode')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOAuthForm((prev) => ({ ...prev, authMode: 'manual' }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  oauthForm.authMode === 'manual'
                    ? 'bg-accent text-white'
                    : 'bg-surface-muted text-text-secondary hover:bg-surface-active'
                }`}
              >
                {t('mcp.authModeManual')}
              </button>
              <button
                type="button"
                onClick={() => setOAuthForm((prev) => ({ ...prev, authMode: 'oauth' }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  oauthForm.authMode === 'oauth'
                    ? 'bg-accent text-white'
                    : 'bg-surface-muted text-text-secondary hover:bg-surface-active'
                }`}
              >
                {t('mcp.authModeOAuth')}
              </button>
            </div>
          </div>

          {oauthForm.authMode === 'oauth' && (
            <div className="space-y-3 p-3 rounded-lg border border-accent/20 bg-accent/5">
              <p className="text-xs text-text-muted">{t('mcp.oauthRedirectHint')}</p>
              <p className="text-xs font-mono text-text-secondary break-all">{MCP_OAUTH_REDIRECT_URI}</p>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  {t('mcp.oauthScope')}
                </label>
                <input
                  type="text"
                  value={oauthForm.scope}
                  onChange={(e) =>
                    setOAuthForm((prev) => ({ ...prev, scope: e.target.value }))
                  }
                  placeholder={t('mcp.oauthScopePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  {t('mcp.oauthRegistration')}
                </label>
                <select
                  value={oauthForm.registrationStrategy}
                  onChange={(e) =>
                    setOAuthForm((prev) => ({
                      ...prev,
                      registrationStrategy: e.target.value as CustomOAuthFormState['registrationStrategy'],
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="auto">{t('mcp.oauthRegistrationAuto')}</option>
                  <option value="client_id">{t('mcp.oauthRegistrationClientId')}</option>
                  <option value="client_metadata_url">
                    {t('mcp.oauthRegistrationMetadataUrl')}
                  </option>
                </select>
              </div>

              {oauthForm.registrationStrategy === 'client_id' && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    {t('mcp.oauthClientId')}
                  </label>
                  <input
                    type="text"
                    value={oauthForm.clientId}
                    onChange={(e) =>
                      setOAuthForm((prev) => ({ ...prev, clientId: e.target.value }))
                    }
                    placeholder={t('mcp.oauthClientIdPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              )}

              {oauthForm.registrationStrategy === 'client_metadata_url' && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    {t('mcp.oauthMetadataUrl')}
                  </label>
                  <input
                    type="url"
                    value={oauthForm.clientMetadataUrl}
                    onChange={(e) =>
                      setOAuthForm((prev) => ({
                        ...prev,
                        clientMetadataUrl: e.target.value,
                      }))
                    }
                    placeholder={t('mcp.oauthMetadataUrlPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
        />
        <label htmlFor="enabled" className="text-sm text-text-primary">
          {t('mcp.enableConnector')}
        </label>
      </div>

      <div className={`flex gap-2 ${compact ? 'pt-1' : ''}`}>
        <button
          type="submit"
          disabled={isLoading}
          className={`flex-1 bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2 ${
            compact ? 'py-1.5 px-3 rounded-md text-sm' : 'py-2 px-4 rounded-lg'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('common.save')
          )}
        </button>
        {!compact && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-surface-muted text-text-secondary hover:bg-surface-active transition-colors"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
