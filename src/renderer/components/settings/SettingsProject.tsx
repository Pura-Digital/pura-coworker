import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  FolderOpen,
  Plug,
  BookOpen,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  ToggleLeft,
  ToggleRight,
  CheckCircle,
} from 'lucide-react';
import { useAppStore } from '../../store';
import type { Project, ProjectConfigMode, McpServerConfigRef } from '../../types';
import type { McpServerConfig } from '../../../shared/ipc-types';

interface SettingsProjectProps {
  project: Project;
  onClose: () => void;
}

type Tab = 'connectors' | 'skills';

interface ModeChoiceModalProps {
  resourceType: 'connectors' | 'skills';
  onChoice: (mode: ProjectConfigMode) => void;
  onCancel: () => void;
}

function ModeChoiceModal({ resourceType, onChoice, onCancel }: ModeChoiceModalProps) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface shadow-2xl p-6">
        <h3 className="text-[14px] font-semibold text-text-primary mb-2">
          {t('project.modeChoiceTitle', { resource: t(`project.${resourceType}`) })}
        </h3>
        <p className="text-[12px] text-text-muted mb-5">
          {t('project.modeChoiceDescription')}
        </p>
        <div className="space-y-2">
          <button
            onClick={() => onChoice('merge')}
            className="w-full text-left rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 hover:bg-accent/10 transition-colors"
          >
            <div className="text-[13px] font-medium text-text-primary">{t('project.modeMerge')}</div>
            <div className="text-[11px] text-text-muted mt-0.5">{t('project.modeMergeHint')}</div>
          </button>
          <button
            onClick={() => onChoice('replace')}
            className="w-full text-left rounded-xl border border-border-subtle bg-background px-4 py-3 hover:bg-surface-hover transition-colors"
          >
            <div className="text-[13px] font-medium text-text-primary">{t('project.modeReplace')}</div>
            <div className="text-[11px] text-text-muted mt-0.5">{t('project.modeReplaceHint')}</div>
          </button>
        </div>
        <button
          onClick={onCancel}
          className="w-full mt-3 px-4 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-hover transition-colors"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

export function SettingsProject({ project, onClose }: SettingsProjectProps) {
  const { t } = useTranslation();
  const updateProject = useAppStore((s) => s.updateProject);

  const [activeTab, setActiveTab] = useState<Tab>('connectors');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local copies of project config (edited locally, saved on confirm)
  const [mcpServers, setMcpServers] = useState<McpServerConfigRef[]>(project.mcpServers ?? []);
  const [mcpMode, setMcpMode] = useState<ProjectConfigMode | undefined>(project.mcpMode);
  const [skillIds, setSkillIds] = useState<string[]>(project.skillIds ?? []);
  const [skillsMode, setSkillsMode] = useState<ProjectConfigMode | undefined>(project.skillsMode);

  // Global skills list for the skills tab
  const [availableSkills, setAvailableSkills] = useState<
    Array<{ id: string; name: string; description?: string }>
  >([]);
  useEffect(() => {
    window.electronAPI?.skills
      ?.getAll()
      .then((skills) => setAvailableSkills(skills.filter((s) => s.enabled)))
      .catch(() => { /* non-critical */ });
  }, []);

  // Global MCP server list for the connectors inherit preview
  const [globalMcpServers, setGlobalMcpServers] = useState<McpServerConfig[]>([]);
  useEffect(() => {
    window.electronAPI?.mcp
      ?.getServers()
      .then((servers) => setGlobalMcpServers(servers.filter((s) => s.enabled)))
      .catch(() => { /* non-critical */ });
  }, []);

  // Mode choice modal state
  const [pendingModeFor, setPendingModeFor] = useState<'connectors' | 'skills' | null>(null);

  // New MCP server form
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpType, setNewMcpType] = useState<'stdio' | 'sse' | 'streamable-http'>('stdio');
  const [newMcpCommand, setNewMcpCommand] = useState('');
  const [newMcpArgs, setNewMcpArgs] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await window.electronAPI?.project?.update(project.id, {
        mcpServers: mcpServers as McpServerConfig[],
        mcpMode: mcpMode ?? null,
        skillIds,
        skillsMode: skillsMode ?? null,
      });
      if (!result?.success) {
        setError(result?.error ?? t('project.saveError'));
        return;
      }
      if (result.project) {
        updateProject(project.id, {
          mcpServers: result.project.mcpServers as McpServerConfigRef[],
          mcpMode: result.project.mcpMode,
          skillIds: result.project.skillIds,
          skillsMode: result.project.skillsMode,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('project.saveError'));
    } finally {
      setIsSaving(false);
    }
  }, [project.id, mcpServers, mcpMode, skillIds, skillsMode, updateProject, onClose, t]);

  const handleAddMcpServer = useCallback(() => {
    if (!newMcpName.trim()) return;
    const newServer: McpServerConfigRef = {
      id: `proj-${Date.now()}`,
      name: newMcpName.trim(),
      type: newMcpType,
      enabled: true,
      ...(newMcpType === 'stdio'
        ? {
            command: newMcpCommand.trim() || undefined,
            args: newMcpArgs
              .split(' ')
              .map((a) => a.trim())
              .filter(Boolean),
          }
        : { url: newMcpUrl.trim() || undefined }),
    };

    if (mcpServers.length === 0 && !mcpMode) {
      // First connector — ask user for mode
      setPendingModeFor('connectors');
    }
    setMcpServers((prev) => [...prev, newServer]);
    setNewMcpName('');
    setNewMcpCommand('');
    setNewMcpArgs('');
    setNewMcpUrl('');
    setShowAddMcp(false);
  }, [newMcpName, newMcpType, newMcpCommand, newMcpArgs, newMcpUrl, mcpServers, mcpMode]);

  const handleRemoveMcpServer = useCallback((serverId: string) => {
    setMcpServers((prev) => {
      const next = prev.filter((s) => s.id !== serverId);
      if (next.length === 0) setMcpMode(undefined);
      return next;
    });
  }, []);

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      setSkillIds((prev) => {
        const isCurrentlySelected = prev.includes(skillId);
        const next = isCurrentlySelected ? prev.filter((id) => id !== skillId) : [...prev, skillId];
        if (!isCurrentlySelected && next.length === 1 && !skillsMode) {
          setPendingModeFor('skills');
        }
        if (next.length === 0) setSkillsMode(undefined);
        return next;
      });
    },
    [skillsMode]
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'connectors', label: t('project.connectorsTab'), icon: <Plug className="w-3.5 h-3.5" /> },
    { id: 'skills', label: t('project.skillsTab'), icon: <BookOpen className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative w-full max-w-lg rounded-2xl border border-border-subtle bg-surface shadow-2xl flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border-muted flex-shrink-0">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold text-text-primary truncate">{project.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <FolderOpen className="w-3 h-3 text-text-muted flex-shrink-0" />
                <span className="text-[11px] text-text-muted truncate">{project.workDir}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="ml-3 w-8 h-8 rounded-xl flex items-center justify-center hover:bg-surface-hover transition-colors text-text-secondary flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border-muted px-6 flex-shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-1 py-3 mr-4 text-[13px] font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
            {activeTab === 'connectors' && (
              <div className="space-y-4">
                {/* Mode banner */}
                {mcpMode ? (
                  <div className="flex items-center justify-between rounded-xl bg-accent/5 border border-accent/20 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />
                      <div>
                        <div className="text-[12px] font-medium text-text-primary">
                          {mcpMode === 'merge'
                            ? t('project.modeMergeActive')
                            : t('project.modeReplaceActive')}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {mcpMode === 'merge'
                            ? t('project.modeMergeActiveHint', { count: globalMcpServers.length })
                            : t('project.modeReplaceActiveHint')}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setMcpMode((prev) => (prev === 'merge' ? 'replace' : 'merge'))
                      }
                      className="text-accent flex-shrink-0"
                      title={t('project.switchMode')}
                    >
                      {mcpMode === 'merge' ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-surface-hover/60 border border-border-muted px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-text-muted flex-shrink-0" />
                      <span className="text-[12px] text-text-muted">{t('project.inheritingConnectors')}</span>
                    </div>
                  </div>
                )}

                {/* Project MCP servers list */}
                {mcpServers.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-text-muted uppercase tracking-wide">
                      {t('project.projectConnectors')}
                    </div>
                    {mcpServers.map((server) => (
                      <div
                        key={server.id}
                        className="flex items-center gap-3 rounded-xl border border-border-subtle bg-background px-3 py-2.5"
                      >
                        <Plug className="w-4 h-4 text-accent flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-text-primary truncate">
                            {server.name}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            {server.type} {server.command ?? server.url ?? ''}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveMcpServer(server.id)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-text-muted hover:text-error hover:bg-error/10 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add connector form */}
                {showAddMcp ? (
                  <div className="rounded-xl border border-border-subtle bg-background p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-text-secondary">
                        {t('project.addConnector')}
                      </span>
                      <button
                        onClick={() => setShowAddMcp(false)}
                        className="text-text-muted hover:text-text-primary transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={newMcpName}
                      onChange={(e) => setNewMcpName(e.target.value)}
                      placeholder={t('mcp.namePlaceholder')}
                      className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                    />
                    <select
                      value={newMcpType}
                      onChange={(e) =>
                        setNewMcpType(e.target.value as typeof newMcpType)
                      }
                      className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[12px] text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="stdio">{t('mcp.typeStdioLocal')}</option>
                      <option value="sse">{t('mcp.typeSseRemote')}</option>
                      <option value="streamable-http">{t('mcp.typeStreamableHttp')}</option>
                    </select>
                    {newMcpType === 'stdio' ? (
                      <>
                        <input
                          type="text"
                          value={newMcpCommand}
                          onChange={(e) => setNewMcpCommand(e.target.value)}
                          placeholder={t('mcp.commandPlaceholder')}
                          className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                        />
                        <input
                          type="text"
                          value={newMcpArgs}
                          onChange={(e) => setNewMcpArgs(e.target.value)}
                          placeholder={t('mcp.argumentsPlaceholder')}
                          className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                        />
                      </>
                    ) : (
                      <input
                        type="text"
                        value={newMcpUrl}
                        onChange={(e) => setNewMcpUrl(e.target.value)}
                        placeholder={t('mcp.urlPlaceholder')}
                        className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                      />
                    )}
                    <button
                      onClick={handleAddMcpServer}
                      disabled={!newMcpName.trim()}
                      className="w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
                    >
                      {t('project.addConnectorConfirm')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddMcp(true)}
                    className="flex items-center gap-2 text-[12px] text-accent hover:text-accent/80 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('project.addConnector')}
                  </button>
                )}
              </div>
            )}

            {activeTab === 'skills' && (
              <div className="space-y-4">
                {/* Mode banner */}
                {skillsMode ? (
                  <div className="flex items-center justify-between rounded-xl bg-accent/5 border border-accent/20 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />
                      <div>
                        <div className="text-[12px] font-medium text-text-primary">
                          {skillsMode === 'merge'
                            ? t('project.skillsModeMergeActive')
                            : t('project.skillsModeReplaceActive')}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {skillsMode === 'merge'
                            ? t('project.skillsModeMergeHint')
                            : t('project.skillsModeReplaceHint')}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setSkillsMode((prev) => (prev === 'merge' ? 'replace' : 'merge'))
                      }
                      className="text-accent flex-shrink-0"
                      title={t('project.switchMode')}
                    >
                      {skillsMode === 'merge' ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-surface-hover/60 border border-border-muted px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-text-muted flex-shrink-0" />
                      <span className="text-[12px] text-text-muted">{t('project.inheritingSkills')}</span>
                    </div>
                  </div>
                )}

                {/* Available skills checkboxes */}
                {availableSkills.length === 0 ? (
                  <div className="text-[12px] text-text-muted text-center py-4">
                    {t('project.noSkillsAvailable')}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-text-muted uppercase tracking-wide">
                      {t('project.skillsOverride')}
                    </div>
                    {availableSkills.map((skill) => (
                      <label
                        key={skill.id}
                        className="flex items-center gap-3 rounded-xl border border-border-subtle bg-background px-3 py-2.5 cursor-pointer hover:bg-surface-hover/60 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={skillIds.includes(skill.id)}
                          onChange={() => handleToggleSkill(skill.id)}
                          className="w-4 h-4 rounded accent-accent"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-text-primary">{skill.name}</div>
                          {skill.description && (
                            <div className="text-[11px] text-text-muted truncate">
                              {skill.description}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {error && (
            <div className="px-6 pb-0 flex-shrink-0">
              <div className="rounded-lg bg-error/10 border border-error/20 px-3 py-2">
                <p className="text-[12px] text-error">{error}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 px-6 py-4 border-t border-border-muted flex-shrink-0">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl text-[13px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('common.save')
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mode choice modal — appears when user adds first item */}
      {pendingModeFor && (
        <ModeChoiceModal
          resourceType={pendingModeFor}
          onChoice={(mode) => {
            if (pendingModeFor === 'connectors') setMcpMode(mode);
            else setSkillsMode(mode);
            setPendingModeFor(null);
          }}
          onCancel={() => setPendingModeFor(null)}
        />
      )}
    </>
  );
}
