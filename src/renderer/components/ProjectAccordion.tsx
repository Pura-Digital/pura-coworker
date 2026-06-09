import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Plus,
  Trash2,
  Settings2,
  MoreHorizontal,
} from 'lucide-react';
import { useAppStore } from '../store';
import type { Project, Session } from '../types';

interface ProjectAccordionProps {
  onSessionClick: (sessionId: string) => void;
  onDeleteSession: (e: React.MouseEvent, sessionId: string) => void;
  onMoveSession: (sessionId: string) => void;
  onConfigureProject: (project: Project) => void;
  onStartSessionInProject: (project: Project) => void;
  onOpenProject: (project: Project) => void;
  activeSessionId: string | null;
  activeProjectId: string | null;
  hoveredSession: string | null;
  onSessionHover: (sessionId: string | null) => void;
}

interface ProjectMenuState {
  projectId: string;
  x: number;
  y: number;
}

export function ProjectAccordion({
  onSessionClick,
  onDeleteSession,
  onMoveSession,
  onConfigureProject,
  onStartSessionInProject,
  onOpenProject,
  activeSessionId,
  activeProjectId,
  hoveredSession,
  onSessionHover,
}: ProjectAccordionProps) {
  const { t } = useTranslation();
  const projects = useAppStore((s) => s.projects);
  const sessions = useAppStore((s) => s.sessions);
  const removeProject = useAppStore((s) => s.removeProject);
  const updateSession = useAppStore((s) => s.updateSession);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectSessions, setProjectSessions] = useState<Record<string, Session[]>>({});
  const [projectMenu, setProjectMenu] = useState<ProjectMenuState | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);

  // Keep project sessions in sync with the global sessions list
  useEffect(() => {
    const byProject: Record<string, Session[]> = {};
    for (const session of sessions) {
      if (session.projectId) {
        if (!byProject[session.projectId]) byProject[session.projectId] = [];
        byProject[session.projectId].push(session);
      }
    }
    setProjectSessions(byProject);
  }, [sessions]);

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      try {
        const result = await window.electronAPI?.project?.delete(projectId);
        if (result?.success) {
          removeProject(projectId);
          // Detach sessions that were in this project
          for (const session of sessions) {
            if (session.projectId === projectId) {
              updateSession(session.id, { projectId: undefined });
            }
          }
        }
      } catch {
        /* handled silently */
      } finally {
        setPendingDeleteProjectId(null);
        setProjectMenu(null);
      }
    },
    [removeProject, sessions, updateSession]
  );

  const openProjectMenu = useCallback((e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setProjectMenu({ projectId, x: rect.left, y: rect.bottom + 4 });
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!projectMenu) return;
    const close = () => setProjectMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [projectMenu]);

  if (projects.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="px-3 pb-2 text-[11px] font-medium tracking-[0.04em] text-text-muted uppercase">
        {t('project.sectionLabel')}
      </div>

      <div className="space-y-0.5">
        {projects.map((project) => {
          const isExpanded = expandedProjects.has(project.id);
          const isProjectActive = activeProjectId === project.id && !activeSessionId;
          const projectSess = projectSessions[project.id] ?? [];

          return (
            <div key={project.id}>
              {/* Project header row */}
              <div
                className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                  isProjectActive
                    ? 'bg-surface-hover/80'
                    : 'hover:bg-surface-hover/60'
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleProject(project.id);
                  }}
                  className="text-text-muted flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-surface-active"
                  aria-label={isExpanded ? t('project.collapse') : t('project.expand')}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenProject(project)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                  <span className="text-[13px] font-medium text-text-primary truncate">
                    {project.name}
                  </span>
                </button>
                <button
                  onClick={(e) => openProjectMenu(e, project.id)}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-active transition-colors flex-shrink-0"
                  title={t('project.projectMenu')}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sessions within project */}
              {isExpanded && (
                <div className="ml-4 space-y-0.5 mt-0.5">
                  {projectSess.length === 0 ? (
                    <div className="px-3 py-1.5 text-[12px] text-text-muted italic">
                      {t('project.noChats')}
                    </div>
                  ) : (
                    projectSess.map((session) => {
                      const isActive = activeSessionId === session.id;
                      return (
                        <div
                          key={session.id}
                          onClick={() => onSessionClick(session.id)}
                          onMouseEnter={() => onSessionHover(session.id)}
                          onMouseLeave={() => onSessionHover(null)}
                          className={`group relative cursor-pointer rounded-lg px-2.5 py-1.5 transition-colors ${
                            isActive
                              ? 'bg-surface-hover/80'
                              : 'hover:bg-surface-hover/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 pr-12">
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-medium leading-5 text-text-primary truncate">
                                {session.title}
                              </div>
                            </div>
                          </div>

                          {hoveredSession === session.id && (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveSession(session.id);
                                }}
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-surface-active transition-colors"
                                title={t('project.moveChat')}
                              >
                                <FolderOpen className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => onDeleteSession(e, session.id)}
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-text-muted hover:text-error hover:bg-surface-active transition-colors"
                                title={t('common.delete')}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* New chat in project */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartSessionInProject(project);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1 rounded-lg text-[12px] text-text-muted hover:text-text-secondary hover:bg-surface-hover/40 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {t('project.newChat')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Project context menu */}
      {projectMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-xl border border-border-subtle bg-surface shadow-lg py-1"
          style={{ left: projectMenu.x, top: projectMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {pendingDeleteProjectId === projectMenu.projectId ? (
            <div className="px-3 py-2">
              <p className="text-[12px] text-text-secondary mb-2">{t('project.deleteConfirm')}</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPendingDeleteProjectId(null)}
                  className="flex-1 px-2 py-1 rounded-lg text-[12px] text-text-secondary hover:bg-surface-hover transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleDeleteProject(projectMenu.projectId)}
                  className="flex-1 px-2 py-1 rounded-lg text-[12px] bg-error text-white hover:bg-error/90 transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  const project = projects.find((p) => p.id === projectMenu.projectId);
                  if (project) onStartSessionInProject(project);
                  setProjectMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text-primary hover:bg-surface-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('project.newChat')}
              </button>
              <button
                onClick={() => {
                  const project = projects.find((p) => p.id === projectMenu.projectId);
                  if (project) onConfigureProject(project);
                  setProjectMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text-primary hover:bg-surface-hover transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {t('project.configure')}
              </button>
              <div className="border-t border-border-muted my-1" />
              <button
                onClick={() => setPendingDeleteProjectId(projectMenu.projectId)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-error hover:bg-error/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('project.delete')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
