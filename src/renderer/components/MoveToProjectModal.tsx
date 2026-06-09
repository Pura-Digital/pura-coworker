import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FolderOpen, Loader2, FolderX } from 'lucide-react';
import { useAppStore } from '../store';

interface MoveToProjectModalProps {
  sessionId: string;
  onClose: () => void;
}

export function MoveToProjectModal({ sessionId, onClose }: MoveToProjectModalProps) {
  const { t } = useTranslation();
  const projects = useAppStore((s) => s.projects);
  const sessions = useAppStore((s) => s.sessions);
  const updateSession = useAppStore((s) => s.updateSession);

  const session = sessions.find((s) => s.id === sessionId);
  const currentProjectId = session?.projectId ?? null;

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(currentProjectId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    if (selectedProjectId === currentProjectId) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await window.electronAPI?.project?.moveSession(sessionId, selectedProjectId);
      if (!result?.success) {
        setError(result?.error ?? t('project.moveError'));
        return;
      }
      updateSession(sessionId, { projectId: selectedProjectId ?? undefined });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('project.moveError'));
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionId, selectedProjectId, currentProjectId, updateSession, onClose, t]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-border-subtle bg-surface shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-muted">
          <h2 className="text-[14px] font-semibold text-text-primary">
            {t('project.moveChatTitle')}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-hover transition-colors text-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2">
          <p className="text-[12px] text-text-muted mb-3">
            {t('project.moveChatDescription', { title: session?.title ?? sessionId })}
          </p>

          {/* No project option */}
          <label
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
              selectedProjectId === null
                ? 'bg-accent/10 border border-accent/30'
                : 'border border-transparent hover:bg-surface-hover'
            }`}
          >
            <input
              type="radio"
              name="project"
              checked={selectedProjectId === null}
              onChange={() => setSelectedProjectId(null)}
              className="sr-only"
            />
            <FolderX className="w-4 h-4 text-text-muted flex-shrink-0" />
            <span className="text-[13px] text-text-secondary">{t('project.noProject')}</span>
            {selectedProjectId === null && (
              <span className="ml-auto text-[11px] text-accent font-medium">
                {t('project.selected')}
              </span>
            )}
          </label>

          {/* Project list */}
          {projects.length === 0 ? (
            <div className="rounded-xl border border-border-muted px-3 py-3">
              <p className="text-[12px] text-text-muted text-center">{t('project.noProjectsYet')}</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {projects.map((project) => (
                <label
                  key={project.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                    selectedProjectId === project.id
                      ? 'bg-accent/10 border border-accent/30'
                      : 'border border-transparent hover:bg-surface-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="project"
                    checked={selectedProjectId === project.id}
                    onChange={() => setSelectedProjectId(project.id)}
                    className="sr-only"
                  />
                  <FolderOpen className="w-4 h-4 text-accent flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-text-primary truncate">
                      {project.name}
                    </div>
                    {project.description && (
                      <div className="text-[11px] text-text-muted truncate">{project.description}</div>
                    )}
                  </div>
                  {selectedProjectId === project.id && (
                    <span className="ml-auto text-[11px] text-accent font-medium flex-shrink-0">
                      {t('project.selected')}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-error/10 border border-error/20 px-3 py-2">
              <p className="text-[12px] text-error">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl text-[13px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || selectedProjectId === currentProjectId}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('project.moving')}
              </>
            ) : (
              t('project.move')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
