import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { getArtifactIconComponent, getArtifactCatalog } from '../utils/artifact-steps';
import type { ArtifactCatalogItem } from '../utils/artifact-steps';
import {
  formatTokenCount,
  getCalledMcpConnectors,
  getReadSkills,
} from '../utils/context-session-items';
import { formatWorkingDirDisplayName } from '../../shared/workspace-path';
import { useIPC } from '../hooks/useIPC';
import type { TodoItem } from './message/types';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  FilePieChart,
  FileCode2,
  FileArchive,
  FileAudio2,
  FileVideo,
  Image as ImageIcon,
  FolderOpen,
  File,
  Plug,
  BookOpen,
} from 'lucide-react';
import type { TraceStep, MCPServerInfo } from '../types';

const EMPTY_STEPS: TraceStep[] = [];

export function ContextPanel() {
  const { t } = useTranslation();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const projects = useAppStore((s) => s.projects);
  const sessionStates = useAppStore((s) => s.sessionStates);
  const contextPanelCollapsed = useAppStore((s) => s.contextPanelCollapsed);
  const toggleContextPanel = useAppStore((s) => s.toggleContextPanel);
  const workingDir = useAppStore((s) => s.workingDir);
  const setGlobalNotice = useAppStore((s) => s.setGlobalNotice);
  const { getMCPServers } = useIPC();
  const [contextOpen, setContextOpen] = useState(true);
  const [artifactsOpen, setArtifactsOpen] = useState(true);
  const [utilArtifactsOpen, setUtilArtifactsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [mcpServers, setMcpServers] = useState<MCPServerInfo[]>([]);
  const [recentWorkspaceFiles, setRecentWorkspaceFiles] = useState<Array<{
    path: string;
    modifiedAt: number;
    size: number;
  }>>([]);

  const ss = activeSessionId ? sessionStates[activeSessionId] : undefined;
  const steps = ss?.traceSteps ?? EMPTY_STEPS;
  const activeSession = activeSessionId ? sessions.find(s => s.id === activeSessionId) : null;
  const currentWorkingDir = activeSession?.cwd || workingDir;
  const project = activeSession?.projectId
    ? projects.find((p) => p.id === activeSession.projectId)
    : null;
  const { outputs: outputArtifacts, utils: utilArtifacts } = useMemo(
    () => getArtifactCatalog(steps, recentWorkspaceFiles, currentWorkingDir),
    [currentWorkingDir, recentWorkspaceFiles, steps]
  );
  const canShowItemInFolder = typeof window !== 'undefined' && !!window.electronAPI?.showItemInFolder;

  const messages = useMemo(
    () => (activeSessionId ? sessionStates[activeSessionId]?.messages || [] : []),
    [activeSessionId, sessionStates]
  );

  const contextUsage = useMemo(() => {
    const contextWindow = activeSessionId ? sessionStates[activeSessionId]?.contextWindow : undefined;
    if (!contextWindow) return null;

    let lastInput = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].tokenUsage?.input) {
        lastInput = messages[i].tokenUsage!.input;
        break;
      }
    }

    const percentage = lastInput > 0
      ? Math.min((lastInput / contextWindow) * 100, 100)
      : 0;
    return { used: lastInput, total: contextWindow, percentage };
  }, [activeSessionId, sessionStates, messages]);

  const calledConnectors = useMemo(
    () => getCalledMcpConnectors(steps, messages, mcpServers),
    [messages, mcpServers, steps]
  );

  const readSkills = useMemo(
    () => getReadSkills(steps, messages),
    [messages, steps]
  );

  const latestTodos = useMemo((): TodoItem[] => {
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      if (step.toolName === 'TodoWrite' && Array.isArray(step.toolInput?.todos)) {
        return step.toolInput.todos as TodoItem[];
      }
    }
    return [];
  }, [steps]);

  const todoProgress = useMemo(() => {
    const total = latestTodos.length;
    if (total === 0) return null;
    const completed = latestTodos.filter((item) => item.status === 'completed').length;
    return { completed, total };
  }, [latestTodos]);

  const completedStepCount = useMemo(
    () => steps.reduce((n, s) => n + (s.status === 'completed' ? 1 : 0), 0),
    [steps]
  );

  useEffect(() => {
    if (contextPanelCollapsed) {
      return;
    }
    if (
      typeof window === 'undefined'
      || !window.electronAPI?.artifacts?.listRecentFiles
      || !currentWorkingDir
      || !activeSession?.createdAt
    ) {
      setRecentWorkspaceFiles([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const files = await window.electronAPI.artifacts.listRecentFiles(
          currentWorkingDir,
          activeSession.createdAt,
          50
        );
        if (!cancelled) {
          setRecentWorkspaceFiles(files || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load recent workspace files:', error);
          setRecentWorkspaceFiles([]);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeSession?.createdAt,
    activeSessionId,
    steps.length,
    completedStepCount,
    contextPanelCollapsed,
    currentWorkingDir,
  ]);

  const hasArtifacts = outputArtifacts.length > 0 || utilArtifacts.length > 0;

  useEffect(() => {
    if (contextPanelCollapsed) {
      return;
    }
    const loadMCPServers = async () => {
      try {
        const servers = await getMCPServers();
        setMcpServers(servers || []);
      } catch (error) {
        console.error('Failed to load MCP servers:', error);
      }
    };
    loadMCPServers();
    const interval = setInterval(loadMCPServers, 30000);
    return () => clearInterval(interval);
  }, [contextPanelCollapsed, getMCPServers]);

  const handleOpenFolder = async () => {
    if (!currentWorkingDir || !canShowItemInFolder) return;
    try {
      const revealed = await window.electronAPI!.showItemInFolder(currentWorkingDir);
      if (!revealed) {
        setGlobalNotice({
          id: `open-folder-failed-${Date.now()}`,
          type: 'warning',
          message: t('context.revealFailed'),
        });
      }
    } catch {
      setGlobalNotice({
        id: `open-folder-failed-${Date.now()}`,
        type: 'warning',
        message: t('context.revealFailed'),
      });
    }
  };

  if (contextPanelCollapsed) {
    return (
      <div className="w-10 bg-background border-l border-border-muted flex items-start justify-center pt-3">
        <button
          onClick={toggleContextPanel}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          title={t('context.expandPanel')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const folderLabel = project?.name
    || (currentWorkingDir
      ? formatWorkingDirDisplayName(currentWorkingDir, t('workspace.defaultFolderLabel'))
      : null);

  return (
    <div className="w-72 bg-background border-l border-border-muted flex flex-col overflow-hidden text-sm">
      <div className="px-3 h-10 flex items-center justify-end border-b border-border-muted shrink-0">
        <button
          onClick={toggleContextPanel}
          className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
          title={t('context.collapsePanel')}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {todoProgress && (
          <ContextCard
            title={t('context.progress')}
            trailing={
              <span className="text-xs text-text-muted">
                {t('context.progressCount', todoProgress)}
              </span>
            }
            expanded={progressOpen}
            onToggle={() => setProgressOpen((open) => !open)}
          >
            <ul className="space-y-1.5 pt-0.5">
              {latestTodos.map((todo, index) => (
                <li
                  key={todo.id || `${todo.content}-${index}`}
                  className={`text-xs leading-5 ${
                    todo.status === 'completed' || todo.status === 'cancelled'
                      ? 'text-text-muted line-through'
                      : todo.status === 'in_progress'
                        ? 'text-text-primary font-medium'
                        : 'text-text-secondary'
                  }`}
                >
                  {todo.activeForm || todo.content}
                </li>
              ))}
            </ul>
          </ContextCard>
        )}

        {folderLabel && (
          <ContextCard
            title={folderLabel}
            trailing={
              currentWorkingDir && canShowItemInFolder ? (
                <button
                  type="button"
                  onClick={() => void handleOpenFolder()}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                  title={t('context.openInFileManager')}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              ) : undefined
            }
            titleTooltip={currentWorkingDir ? formatPath(currentWorkingDir) : undefined}
          />
        )}

        <ContextCard
          title={t('context.artifacts')}
          trailing={
            hasArtifacts ? (
              <span className="text-xs text-text-muted">
                {outputArtifacts.length + utilArtifacts.length}
              </span>
            ) : undefined
          }
          expanded={artifactsOpen}
          onToggle={() => setArtifactsOpen((open) => !open)}
        >
          <div className="space-y-3 pt-0.5">
            <ContextSubsection label={t('context.outputArtifacts')}>
              {outputArtifacts.length > 0 ? (
                <ArtifactList
                  items={outputArtifacts}
                  canShowItemInFolder={canShowItemInFolder}
                  currentWorkingDir={currentWorkingDir}
                  onRevealFailed={() => {
                    setGlobalNotice({
                      id: `artifact-reveal-failed-${Date.now()}`,
                      type: 'warning',
                      message: t('context.revealFailed'),
                    });
                  }}
                />
              ) : (
                <p className="text-xs text-text-muted py-1">{t('context.noOutputArtifactsYet')}</p>
              )}
            </ContextSubsection>

            <ContextAccordion
              label={t('context.utilArtifacts')}
              count={utilArtifacts.length}
              expanded={utilArtifactsOpen}
              onToggle={() => setUtilArtifactsOpen((open) => !open)}
            >
              {utilArtifacts.length > 0 ? (
                <ArtifactList
                  items={utilArtifacts}
                  canShowItemInFolder={canShowItemInFolder}
                  currentWorkingDir={currentWorkingDir}
                  onRevealFailed={() => {
                    setGlobalNotice({
                      id: `artifact-reveal-failed-${Date.now()}`,
                      type: 'warning',
                      message: t('context.revealFailed'),
                    });
                  }}
                />
              ) : (
                <p className="text-xs text-text-muted py-1">{t('context.noUtilArtifactsYet')}</p>
              )}
            </ContextAccordion>
          </div>
        </ContextCard>

        <ContextCard
          title={t('context.context')}
          trailing={contextUsage ? <ContextUsageRing usage={contextUsage} /> : undefined}
          expanded={contextOpen}
          onToggle={() => setContextOpen((open) => !open)}
        >
          <div className="space-y-3 pt-0.5">
            {calledConnectors.length > 0 && (
              <ContextSubsection label={t('context.connectors')}>
                <div className="flex flex-wrap gap-1.5">
                  {calledConnectors.map((connector) => (
                    <span
                      key={connector.key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface px-2.5 py-1 text-xs text-text-primary"
                    >
                      <Plug className="w-3 h-3 text-text-muted shrink-0" />
                      {connector.name}
                    </span>
                  ))}
                </div>
              </ContextSubsection>
            )}

            {readSkills.length > 0 && (
              <ContextAccordion
                label={t('context.skills')}
                count={readSkills.length}
                expanded={skillsOpen}
                onToggle={() => setSkillsOpen((open) => !open)}
              >
                <div className="space-y-1">
                  {readSkills.map((skill) => (
                    <div key={skill.key} className="flex items-center gap-2 py-0.5">
                      <div className="w-7 h-7 rounded-md bg-surface-muted flex items-center justify-center shrink-0">
                        <BookOpen className="w-3.5 h-3.5 text-text-muted" />
                      </div>
                      <span className="text-xs text-text-primary truncate">{skill.name}</span>
                    </div>
                  ))}
                </div>
              </ContextAccordion>
            )}

            {calledConnectors.length === 0 && readSkills.length === 0 && (
              <p className="text-xs text-text-muted py-1">{t('context.emptyContext')}</p>
            )}
          </div>
        </ContextCard>
      </div>
    </div>
  );
}

function ContextUsageRing({
  usage,
}: {
  usage: { used: number; total: number; percentage: number };
}) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<{ top: number; left: number } | null>(null);
  const size = 18;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (usage.percentage / 100) * circumference;
  const toneClass =
    usage.percentage > 95 ? 'text-error' :
    usage.percentage > 80 ? 'text-warning' :
    'text-accent';

  const updateTooltipPosition = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const tooltipWidth = 208;
    setTooltipStyle({
      top: rect.top - 8,
      left: Math.max(8, rect.right - tooltipWidth),
    });
  };

  const showTooltip = () => {
    updateTooltipPosition();
    setTooltipOpen(true);
  };

  const hideTooltip = () => {
    setTooltipOpen(false);
  };

  useEffect(() => {
    if (!tooltipOpen) {
      return;
    }

    const handleReposition = () => updateTooltipPosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [tooltipOpen]);

  return (
    <>
      <div
        ref={anchorRef}
        className="relative shrink-0"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className={`stroke-current ${toneClass}`}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className="stroke-current text-text-muted/70 transition-all duration-500 ease-out"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
      </div>

      {tooltipOpen && tooltipStyle && createPortal(
        <div
          className="pointer-events-none fixed z-[100] w-52 -translate-y-full rounded-xl border border-border-muted bg-surface px-3 py-2.5 shadow-lg"
          style={{ top: tooltipStyle.top, left: tooltipStyle.left }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">
              {t('context.contextUsage')}
            </span>
            <span className={`text-xs font-medium tabular-nums ${toneClass}`}>
              {Math.round(usage.percentage)}%
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-background overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                usage.percentage > 95 ? 'bg-error' :
                usage.percentage > 80 ? 'bg-warning' :
                'bg-accent'
              }`}
              style={{ width: `${usage.percentage}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-text-muted tabular-nums">
            {t('context.contextUsageLabel', {
              used: formatTokenCount(usage.used),
              total: formatTokenCount(usage.total),
            })}
          </p>
        </div>,
        document.body
      )}
    </>
  );
}

function ArtifactList({
  items,
  canShowItemInFolder,
  currentWorkingDir,
  onRevealFailed,
}: {
  items: ArtifactCatalogItem[];
  canShowItemInFolder: boolean;
  currentWorkingDir?: string | null;
  onRevealFailed: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-0.5">
      {items.map((artifact, index) => {
        const label = artifact.label || t('context.fileCreated');
        const artifactPath = artifact.path;
        const canClick = Boolean(artifactPath && canShowItemInFolder);
        const iconComponent = getArtifactIconComponent(label);
        const IconComponent =
          iconComponent === 'presentation' ? FilePieChart
          : iconComponent === 'table' ? FileSpreadsheet
          : iconComponent === 'document' ? FileText
          : iconComponent === 'code' ? FileCode2
          : iconComponent === 'image' ? ImageIcon
          : iconComponent === 'audio' ? FileAudio2
          : iconComponent === 'video' ? FileVideo
          : iconComponent === 'archive' ? FileArchive
          : iconComponent === 'text' ? File
          : File;

        return (
          <button
            key={artifact.path || artifact.label || `artifact-${index}`}
            type="button"
            disabled={!canClick}
            className={`w-full flex items-center gap-2 py-1.5 rounded-md text-left transition-colors ${
              canClick ? 'hover:bg-surface-hover cursor-pointer' : 'cursor-default'
            }`}
            onClick={async () => {
              if (!canClick) return;
              const revealed = await window.electronAPI.showItemInFolder(
                artifactPath,
                currentWorkingDir ?? undefined
              );
              if (!revealed) {
                onRevealFailed();
              }
            }}
            title={artifactPath || undefined}
          >
            <IconComponent className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <span className="text-xs text-text-primary truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ContextCard({
  title,
  trailing,
  expanded = false,
  onToggle,
  onTitleClick,
  titleTooltip,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  onTitleClick?: () => void;
  titleTooltip?: string;
  children?: ReactNode;
}) {
  const isCollapsible = Boolean(onToggle);
  const hasBody = Boolean(children);

  return (
    <div className="rounded-xl border border-border-muted bg-surface/60">
      <div className="relative z-10 flex items-center gap-2 px-3 py-2.5 min-h-[42px]">
        {isCollapsible ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex-1 min-w-0 flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
          >
            <span className="text-[13px] font-medium text-text-primary truncate">{title}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onTitleClick}
            disabled={!onTitleClick}
            title={titleTooltip}
            className={`flex-1 min-w-0 text-left ${onTitleClick ? 'hover:opacity-80 transition-opacity' : ''}`}
          >
            <span className="text-[13px] font-medium text-text-primary truncate">{title}</span>
          </button>
        )}
        {trailing}
        {isCollapsible && (
          <button
            type="button"
            onClick={onToggle}
            className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        {!isCollapsible && !trailing && onTitleClick && (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}
      </div>
      {hasBody && expanded && (
        <div className="px-3 pb-3 border-t border-border-muted/60">
          {children}
        </div>
      )}
    </div>
  );
}

function ContextSubsection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-text-muted mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function ContextAccordion({
  label,
  count,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 py-1 rounded-md hover:bg-surface-hover/60 transition-colors"
      >
        <span className="text-[11px] text-text-muted flex-1 text-left">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="text-[11px] text-text-muted/70 tabular-nums">{count}</span>
        )}
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
        )}
      </button>
      {expanded && <div className="pt-0.5">{children}</div>}
    </div>
  );
}

function formatPath(path: string): string {
  if (!path) return '';

  const winHome = /^[A-Z]:\\Users\\[^\\]+/i;
  const winMatch = path.match(winHome);
  if (winMatch) {
    return '~' + path.slice(winMatch[0].length).replace(/\\/g, '/');
  }

  const unixHome = /^\/(?:Users|home)\/[^/]+/;
  const unixMatch = path.match(unixHome);
  if (unixMatch) {
    return '~' + path.slice(unixMatch[0].length);
  }

  return path;
}
