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
  X,
} from 'lucide-react';
import type { MCPServerConfig, MCPServerStatus, MCPToolInfo, MCPPreset } from './shared';
import {
  SettingsAlert,
  SettingsCard,
  SettingsDisclosure,
} from './shared';
import { McpPresetLogo } from '../McpPresetLogo';
import {
  presetUrlHasUnresolvedPlaceholders,
  resolvePresetUrl,
} from '../../../shared/mcp-preset-url';

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

function isPresetAlreadyAdded(servers: MCPServerConfig[], preset: MCPPreset): boolean {
  return servers.some((server) => {
    if (server.name !== preset.name) return false;
    if (preset.type === 'stdio') {
      return server.command === preset.command;
    }
    return server.type === preset.type;
  });
}

const PRESET_DESC_KEYS: Record<string, string> = {
  archiveye: 'mcp.presetDesc.archiveye',
  chrome: 'mcp.presetDesc.chrome',
  notion: 'mcp.presetDesc.notion',
  'software-development': 'mcp.presetDesc.softwareDevelopment',
  'gui-operate': 'mcp.presetDesc.guiOperate',
};

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

function presetEnvLabel(preset: MCPPreset, envKey: string, t: (key: string) => string): string {
  if (envKey === 'ARCHIVEYE_API_KEY') {
    return t('mcp.presetArchiveyeApiKey');
  }
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [presets, setPresets] = useState<Record<string, MCPPreset>>({});
  const [showPresets, setShowPresets] = useState(true);
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

  async function handleAddPreset(presetKey: string) {
    const preset = presets[presetKey];
    if (!preset) return;

    if (isPresetAlreadyAdded(servers, preset)) {
      setError(t('mcp.presetAlreadyConfigured', { name: preset.name }));
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
      enabled: false,
    };

    await handleSaveServer(serverConfig);
    setShowPresets(false);
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
      setShowAddForm(false);
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

  function getServerStatus(serverId: string) {
    return statuses.find((s) => s.id === serverId);
  }

  function getServerTools(serverId: string) {
    return tools.filter((t) => t.serverId === serverId);
  }

  return (
    <div className="space-y-4">
      {error && <SettingsAlert variant="error">{error}</SettingsAlert>}

      {/* Add/Edit Form */}
      {(showAddForm || editingServer) && (
        <ServerForm
          server={editingServer || undefined}
          onSave={handleSaveServer}
          onCancel={() => {
            setShowAddForm(false);
            setEditingServer(null);
          }}
          isLoading={isLoading}
        />
      )}

      {/* Server List */}
      {!showAddForm && !editingServer && (
        <div className="space-y-3">
          {servers.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-background text-center py-8 text-text-muted">
              <Plug className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>{t('mcp.noConnectors')}</p>
              <p className="text-sm mt-1">{t('mcp.addConnector')}</p>
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
                  onEdit={() => setEditingServer(server)}
                  onDelete={() => handleDeleteServer(server.id)}
                  onToggleEnabled={() => handleToggleEnabled(server)}
                  isLoading={isLoading}
                />
              );
            })
          )}
        </div>
      )}

      {/* Preset Environment Configuration Modal */}
      {configuringPreset && (
        <div className="p-4 rounded-lg border border-accent/30 bg-accent/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <McpPresetLogo presetKey={configuringPreset.key} />
              <h3 className="text-sm font-medium text-text-primary">
                {t('mcp.configure')} {configuringPreset.preset.name}
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
                  {presetEnvLabel(configuringPreset.preset, envKey, t)}
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

      {/* Preset Servers */}
      {!showAddForm && !editingServer && !configuringPreset && Object.keys(presets).length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface-muted hover:bg-surface transition-colors"
          >
            <h3 className="text-sm font-medium text-text-primary">{t('mcp.quickAddPresets')}</h3>
            <div className="flex items-center gap-1.5 text-text-muted">
              <span className="text-xs">{showPresets ? t('mcp.hide') : t('mcp.show')}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showPresets ? 'rotate-180' : ''}`}
              />
            </div>
          </button>
          {showPresets && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(presets).map(([key, preset]) => {
                const isAdded = isPresetAlreadyAdded(servers, preset);
                const requiresConfig = preset.requiresEnv && preset.requiresEnv.length > 0;
                const description = presetUserDescription(key, t);
                return (
                  <div
                    key={key}
                    className={`p-4 rounded-xl border flex items-start gap-3 ${
                      isAdded
                        ? 'border-border-subtle bg-surface-muted/60 opacity-70'
                        : 'border-border-subtle bg-surface hover:border-accent/30 transition-colors'
                    }`}
                  >
                    <McpPresetLogo presetKey={key} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-text-primary">{preset.name}</span>
                        {requiresConfig && !isAdded && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-warning/10 text-warning">
                            {t('mcp.requiresToken')}
                          </span>
                        )}
                      </div>
                      {description && (
                        <p className="text-xs text-text-muted mt-1 leading-5">{description}</p>
                      )}
                    </div>
                    {isAdded ? (
                      <div className="flex items-center gap-1 text-success text-xs whitespace-nowrap">
                        <CheckCircle className="w-4 h-4" />
                        <span>{t('mcp.added')}</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAddPreset(key)}
                        disabled={isLoading}
                        className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {requiresConfig ? t('mcp.configure') : t('common.add')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Custom Button */}
      {!showAddForm && !editingServer && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-3 px-4 rounded-lg border-2 border-dashed border-border hover:border-accent hover:bg-accent/5 transition-all flex items-center justify-center gap-2 text-text-secondary hover:text-accent"
        >
          <Plus className="w-5 h-5" />
          {t('mcp.addCustomConnector')}
        </button>
      )}

      {/* Footer info */}
      <div className="text-sm text-text-muted text-center pt-2">
        {t('mcp.toolsAvailable', { count: tools.length })}
      </div>
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
  isLoading,
}: {
  server: MCPServerConfig;
  status?: MCPServerStatus;
  toolCount: number;
  tools: MCPToolInfo[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
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

  return (
    <SettingsCard className="!p-0 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  serverStatus === 'connected'
                    ? 'bg-success'
                    : serverStatus === 'failed'
                      ? 'bg-error'
                      : serverStatus === 'connecting'
                        ? 'bg-warning'
                        : 'bg-text-muted'
                }`}
              />
              <h3 className="font-medium text-text-primary">{server.name}</h3>
              <span className="px-2 py-0.5 text-xs rounded-full bg-surface-muted text-text-muted">
                {friendlyConnectionType(server.type, t)}
              </span>
            </div>
            <div className="text-sm text-text-muted space-y-2 min-w-0">
              <div
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full w-fit ${
                  serverStatus === 'connected'
                    ? 'bg-success/10 text-success'
                    : serverStatus === 'failed'
                      ? 'bg-error/10 text-error'
                      : serverStatus === 'connecting'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-accent/10 text-accent'
                }`}
              >
                {serverStatus === 'connected'
                  ? t('mcp.connected')
                  : serverStatus === 'failed'
                    ? t('mcp.failed', { defaultValue: 'Connection failed' })
                    : serverStatus === 'connecting'
                      ? t('mcp.connecting')
                      : t('mcp.disabled', { defaultValue: 'Disabled' })}
              </div>
              {technicalDetail && (
                <SettingsDisclosure title={t('mcp.showTechnicalDetails')}>
                  <p className="font-mono text-xs text-text-secondary break-all">{technicalDetail}</p>
                </SettingsDisclosure>
              )}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowTools(!showTools)}
                  className="flex items-center gap-1 hover:text-accent transition-colors"
                >
                  <Plug className="w-3 h-3" />
                  <span>{t('mcp.toolsAvailable', { count: toolCount })}</span>
                  {showTools ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Tools List */}
              {showTools && tools.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-surface-muted border border-border">
                  <div className="text-xs font-medium text-text-primary mb-2">
                    {t('mcp.toolsAvailable', { count: tools.length }).split(' ').slice(1).join(' ')}
                    :
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    {tools.map((tool, idx) => {
                      // Extract only the part after the last double underscore
                      const parts = tool.name.split('__');
                      const displayName = parts.length > 1 ? parts[parts.length - 1] : tool.name;
                      return (
                        <div
                          key={idx}
                          className="px-2 py-1.5 rounded bg-background border border-border text-xs text-text-secondary"
                          title={tool.description || tool.name}
                        >
                          <div className="font-mono text-accent break-words whitespace-normal">
                            {displayName}
                          </div>
                          {tool.description && (
                            <div className="text-text-muted mt-0.5 break-words whitespace-normal">
                              {tool.description}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {showTools && tools.length === 0 && (
                <div className="mt-3 p-3 rounded-lg bg-surface-muted text-xs text-text-muted">
                  {t('mcp.notConnected')}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onToggleEnabled}
              disabled={isLoading}
              className={`p-2 rounded-lg transition-colors ${
                server.enabled
                  ? 'bg-success/10 text-success hover:bg-success/20'
                  : 'bg-surface-muted text-text-muted hover:bg-surface-active'
              }`}
              title={
                server.enabled ? t('common.disable') || 'Disable' : t('common.enable') || 'Enable'
              }
            >
              {server.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
            </button>
            <button
              onClick={onEdit}
              disabled={isLoading}
              className="p-2 rounded-lg bg-surface-muted text-text-secondary hover:bg-surface-active transition-colors"
              title={t('common.edit')}
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={isLoading}
              className="p-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"
              title={t('common.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

function ServerForm({
  server,
  onSave,
  onCancel,
  isLoading,
}: {
  server?: MCPServerConfig;
  onSave: (server: MCPServerConfig) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(server?.name || '');
  const [type, setType] = useState<'stdio' | 'sse' | 'streamable-http'>(server?.type || 'stdio');
  const [command, setCommand] = useState(server?.command || '');
  const [args, setArgs] = useState(server?.args?.join(' ') || '');
  const [url, setUrl] = useState(server?.url || '');
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  // Environment variables (for tokens, etc.)
  const [envVars, setEnvVars] = useState<Record<string, string>>(server?.env || {});
  const [showEnvSection, setShowEnvSection] = useState(Object.keys(server?.env || {}).length > 0);

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

    const config: MCPServerConfig = {
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
    }

    onSave(config);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-surface p-4 space-y-4"
    >
      <h3 className="font-medium text-text-primary">
        {server ? t('mcp.editConnector') : t('mcp.addConnectorTitle')}
      </h3>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">{t('mcp.name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('mcp.namePlaceholder')}
          className="w-full px-4 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">{t('mcp.type')}</label>
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

      {type === 'stdio' ? (
        <>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              {t('mcp.command')}
            </label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t('mcp.commandPlaceholder')}
              className="w-full px-4 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 font-mono text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              {t('mcp.arguments')}
            </label>
            <input
              type="text"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder={t('mcp.argumentsPlaceholder')}
              className="w-full px-4 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 font-mono text-sm"
            />
            <p className="text-xs text-text-muted mt-1">{t('mcp.spaceSeparated')}</p>
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
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">{t('mcp.url')}</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
            className="w-full px-4 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 font-mono text-sm"
            required
          />
        </div>
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

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 py-2 px-4 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="px-4 py-2 rounded-lg bg-surface-muted text-text-secondary hover:bg-surface-active transition-colors"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
