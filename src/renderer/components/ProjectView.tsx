import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderOpen,
  Settings2,
  ArrowRight,
  Paperclip,
  X,
  Plug,
  BookOpen,
  Brain,
  MessageSquare,
  Library,
} from 'lucide-react';
import { useAppStore } from '../store';
import { useActiveProject } from '../store/selectors';
import { useIPC } from '../hooks/useIPC';
import type { ContentBlock, Session, TextContent } from '../types';
import { getInitialSessionTitle } from '../../shared/session-title';
import { hydrateSessionMessages } from '../utils/session-hydration';
import { SettingsProject } from './settings/SettingsProject';

type ProjectTab = 'chats' | 'sources';

type AttachedFile = {
  name: string;
  path: string;
  size: number;
  type: string;
  inlineDataBase64?: string;
};

function formatSessionDate(timestamp: number, locale: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  if (timestamp >= startOfToday) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  if (timestamp >= startOfYesterday) {
    return date.toLocaleDateString(locale, { weekday: 'short' });
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function ProjectView() {
  const { t, i18n } = useTranslation();
  const project = useActiveProject();
  const sessions = useAppStore((s) => s.sessions);
  const sessionStates = useAppStore((s) => s.sessionStates);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const isConfigured = useAppStore((s) => s.isConfigured);

  const { startSession, isElectron } = useIPC();

  const [activeTab, setActiveTab] = useState<ProjectTab>('chats');
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showConfigure, setShowConfigure] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  const projectSessions = useMemo(() => {
    if (!project) return [];
    return sessions
      .filter((s) => s.projectId === project.id)
      .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  }, [project, sessions]);

  const getPreviewForSession = useCallback(
    (session: Session): string => {
      const messages = sessionStates[session.id]?.messages ?? [];
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (!lastUser) return t('project.noPreview');
      const textBlock = lastUser.content.find((b) => b.type === 'text') as TextContent | undefined;
      return textBlock?.text?.trim() || t('project.noPreview');
    },
    [sessionStates, t]
  );

  // Preload messages for visible project sessions (for preview snippets)
  useEffect(() => {
    if (!isElectron || !project) return;
    for (const session of projectSessions.slice(0, 20)) {
      void hydrateSessionMessages(session.id);
    }
  }, [project, projectSessions, isElectron]);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 160;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [prompt]);

  const handleFileSelect = async () => {
    if (!isElectron || !window.electronAPI) return;
    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths.length === 0) return;
      const newFiles = filePaths.map((filePath) => ({
        name: filePath.split(/[/\\]/).pop() || 'unknown',
        path: filePath,
        size: 0,
        type: 'application/octet-stream',
      }));
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    } catch {
      /* non-critical */
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!project) return;

    const currentPrompt = textareaRef.current?.value || prompt;
    if ((!currentPrompt.trim() && attachedFiles.length === 0) || isSubmitting) return;

    const contentBlocks: ContentBlock[] = [];
    attachedFiles.forEach((file) => {
      contentBlocks.push({
        type: 'file_attachment',
        filename: file.name,
        relativePath: file.path,
        size: file.size,
        mimeType: file.type,
        inlineDataBase64: file.inlineDataBase64,
      });
    });
    if (currentPrompt.trim()) {
      contentBlocks.push({ type: 'text', text: currentPrompt.trim() });
    }

    setIsSubmitting(true);
    try {
      const sessionTitle = getInitialSessionTitle(currentPrompt, attachedFiles[0]?.name);
      await startSession(sessionTitle, contentBlocks, project.workDir, { projectId: project.id });
      setPrompt('');
      if (textareaRef.current) textareaRef.current.value = '';
      setAttachedFiles([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenSession = (sessionId: string) => {
    setShowSettings(false);
    setActiveSession(sessionId);
    if (isElectron) {
      void hydrateSessionMessages(sessionId);
    }
  };

  if (!project) return null;

  const workDirName = project.workDir.split(/[/\\]/).pop() || project.workDir;
  const canSubmit = prompt.trim().length > 0 || attachedFiles.length > 0;

  const mcpLabel = project.mcpMode
    ? project.mcpMode === 'merge'
      ? t('project.modeMergeActive')
      : t('project.modeReplaceActive')
    : t('project.inheritingConnectors');

  const skillsLabel = project.skillsMode
    ? project.skillsMode === 'merge'
      ? t('project.skillsModeMergeActive')
      : t('project.skillsModeReplaceActive')
    : t('project.inheritingSkills');

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[760px] mx-auto px-5 py-8 md:px-8 md:py-12 animate-fade-in">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-8">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="w-5 h-5 text-accent" />
                </div>
                <h1 className="text-[2rem] md:text-[2.35rem] leading-tight font-semibold tracking-[-0.04em] text-text-primary truncate">
                  {project.name}
                </h1>
              </div>
              {project.description && (
                <p className="text-[14px] text-text-secondary ml-[3.25rem]">{project.description}</p>
              )}
              <p className="text-[12px] text-text-muted ml-[3.25rem] mt-1 truncate" title={project.workDir}>
                {workDirName}
              </p>
            </div>
            <button
              onClick={() => setShowConfigure(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle bg-background/60 text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('project.configure')}</span>
            </button>
          </div>

          {/* Compose */}
          <form
            onSubmit={handleSubmit}
            className="rounded-[1.75rem] border border-border-muted bg-background/85 shadow-soft px-5 py-4 mb-6"
          >
            {attachedFiles.length > 0 && (
              <div className="space-y-2 mb-3">
                {attachedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-muted border border-border group"
                  >
                    <p className="flex-1 min-w-0 text-sm text-text-primary truncate">{file.name}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="w-6 h-6 rounded-full bg-error/10 hover:bg-error/20 text-error flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              placeholder={t('project.newChatPlaceholder', { name: project.name })}
              rows={1}
              style={{ minHeight: '56px', maxHeight: '160px' }}
              className="w-full resize-none bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted text-base leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) return;
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />

            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border-muted">
              <div className="flex items-center gap-3">
                {isElectron && (
                  <button
                    type="button"
                    onClick={handleFileSelect}
                    className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('welcome.attachFiles')}</span>
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!canSubmit || isSubmitting || !isConfigured}
                className="btn btn-primary px-5 py-2.5 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isSubmitting ? t('welcome.starting') : t('welcome.letsGo')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {!isConfigured && (
            <p className="text-sm text-text-muted text-center mb-6">
              {t('welcome.apiNotConfigured')}{' '}
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="text-accent hover:text-accent-hover transition-colors"
              >
                {t('welcome.goToSettings')}
              </button>
            </p>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4 p-1 rounded-2xl bg-surface-hover/50 w-fit">
            <button
              onClick={() => setActiveTab('chats')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                activeTab === 'chats'
                  ? 'bg-background text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {t('project.chatsTab')}
            </button>
            <button
              onClick={() => setActiveTab('sources')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                activeTab === 'sources'
                  ? 'bg-background text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Library className="w-3.5 h-3.5" />
              {t('project.sourcesTab')}
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'chats' ? (
            <div className="rounded-2xl border border-border-subtle bg-background/50 overflow-hidden">
              {projectSessions.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-[14px] text-text-secondary">{t('project.noChatsYet')}</p>
                  <p className="mt-1 text-[12px] text-text-muted">{t('project.noChatsYetHint')}</p>
                </div>
              ) : (
                <ul>
                  {projectSessions.map((session, index) => (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => handleOpenSession(session.id)}
                        className="w-full text-left px-5 py-4 hover:bg-surface-hover/60 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-medium text-text-primary truncate">
                              {session.title}
                            </div>
                            <div className="mt-1 text-[13px] text-text-muted truncate">
                              {getPreviewForSession(session)}
                            </div>
                          </div>
                          <span className="text-[12px] text-text-muted flex-shrink-0 pt-0.5">
                            {formatSessionDate(
                              session.updatedAt || session.createdAt,
                              i18n.language
                            )}
                          </span>
                        </div>
                      </button>
                      {index < projectSessions.length - 1 && (
                        <div className="mx-5 border-b border-border-muted" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border-subtle bg-background/50 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-medium text-text-primary">
                    {t('project.workDirLabel')}
                  </span>
                </div>
                <p className="text-[12px] text-text-muted break-all font-mono">{project.workDir}</p>
              </div>

              <div className="rounded-2xl border border-border-subtle bg-background/50 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-medium text-text-primary">
                    {t('project.memorySource')}
                  </span>
                </div>
                <p className="text-[12px] text-text-muted">{t('project.memorySourceHint')}</p>
              </div>

              <div className="rounded-2xl border border-border-subtle bg-background/50 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <Plug className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-medium text-text-primary">
                    {t('project.connectorsTab')}
                  </span>
                </div>
                <p className="text-[12px] text-text-muted">{mcpLabel}</p>
                {project.mcpServers.length > 0 && (
                  <p className="mt-1 text-[12px] text-text-secondary">
                    {t('project.projectConnectorsCount', { count: project.mcpServers.length })}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border-subtle bg-background/50 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-medium text-text-primary">
                    {t('project.skillsTab')}
                  </span>
                </div>
                <p className="text-[12px] text-text-muted">{skillsLabel}</p>
                {project.skillIds.length > 0 && (
                  <p className="mt-1 text-[12px] text-text-secondary">
                    {t('project.projectSkillsCount', { count: project.skillIds.length })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showConfigure && (
        <SettingsProject project={project} onClose={() => setShowConfigure(false)} />
      )}
    </>
  );
}
