import { useEffect, type ReactNode } from 'react';
import { useAppStore } from '../store';
import { hydrateSessionMessages } from '../utils/session-hydration';
import { ChatLoadingView } from './ChatLoadingView';

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

type ChatSessionGateProps = {
  sessionId: string;
  children: ReactNode;
};

/**
 * Keeps chat loading/hydration in a always-mounted parent so the UI can leave
 * the loader as soon as persisted messages are ready — even before ChatView paints.
 */
export function ChatSessionGate({ sessionId, children }: ChatSessionGateProps) {
  const session = useAppStore((s) => s.sessions.find((item) => item.id === sessionId) ?? null);
  const isHydrated = useAppStore((s) => {
    if (!isElectron) return true;
    if (s.sessionMessagesHydrated[sessionId]) return true;
    return (s.sessionStates[sessionId]?.messages?.length ?? 0) > 0;
  });

  useEffect(() => {
    if (!isElectron) return;
    void hydrateSessionMessages(sessionId);
  }, [sessionId]);

  if (!session || (isElectron && !isHydrated)) {
    return <ChatLoadingView />;
  }

  return children;
}
