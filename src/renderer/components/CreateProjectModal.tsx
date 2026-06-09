import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FolderOpen, Loader2 } from 'lucide-react';
import { useAppStore } from '../store';
import type { Project } from '../types';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated?: (project: Project) => void;
}

export function CreateProjectModal({ onClose, onCreated }: CreateProjectModalProps) {
  const { t } = useTranslation();
  const addProject = useAppStore((s) => s.addProject);

  const [name, setName] = useState('');
  const [workDir, setWorkDir] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectDir = useCallback(async () => {
    try {
      const result = await window.electronAPI?.project?.selectWorkDir();
      if (result?.success && result.path) {
        setWorkDir(result.path);
        setError(null);
      }
    } catch {
      setError(t('project.errorSelectingDir'));
    }
  }, [t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError(t('project.nameRequired'));
        return;
      }
      if (!workDir.trim()) {
        setError(t('project.workDirRequired'));
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const result = await window.electronAPI?.project?.create({
          name: name.trim(),
          workDir,
          description: description.trim() || undefined,
        });

        if (!result?.success) {
          setError(result?.error ?? t('project.createError'));
          return;
        }

        if (result.project) {
          const project: Project = {
            ...result.project,
            mcpServers: result.project.mcpServers as Project['mcpServers'],
          };
          addProject(project);
          onCreated?.(project);
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('project.createError'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, workDir, description, addProject, onCreated, onClose, t]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border-subtle bg-surface shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border-muted">
          <h2 className="text-[15px] font-semibold text-text-primary">
            {t('project.createTitle')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-surface-hover transition-colors text-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              {t('project.nameLabel')} <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('project.namePlaceholder')}
              autoFocus
              className="w-full rounded-xl border border-border-subtle bg-background px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Working directory */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              {t('project.workDirLabel')} <span className="text-error">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workDir}
                onChange={(e) => setWorkDir(e.target.value)}
                placeholder={t('project.workDirPlaceholder')}
                readOnly
                className="flex-1 min-w-0 rounded-xl border border-border-subtle bg-background px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors cursor-default"
              />
              <button
                type="button"
                onClick={handleSelectDir}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle bg-background hover:bg-surface-hover transition-colors text-[13px] text-text-secondary"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {t('project.browse')}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-text-muted">{t('project.workDirHint')}</p>
          </div>

          {/* Description (optional) */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              {t('project.descriptionLabel')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('project.descriptionPlaceholder')}
              rows={2}
              className="w-full rounded-xl border border-border-subtle bg-background px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-error/10 border border-error/20 px-3 py-2">
              <p className="text-[12px] text-error">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl text-[13px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !workDir.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('project.creating')}
                </>
              ) : (
                t('project.create')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
