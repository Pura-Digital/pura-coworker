import { useAppStore } from '../store';
import type { Message, TraceStep } from '../types';

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

const inflightHydration = new Map<string, Promise<void>>();

type HydrationDeps = {
  getSessionMessages?: (sessionId: string) => Promise<Message[]>;
  getSessionTraceSteps?: (sessionId: string) => Promise<TraceStep[]>;
};

async function fetchSessionMessages(sessionId: string): Promise<Message[]> {
  if (!isElectron) return [];
  const messages = await window.electronAPI.invoke<Message[]>({
    type: 'session.getMessages',
    payload: { sessionId },
  });
  return messages || [];
}

async function fetchSessionTraceSteps(sessionId: string): Promise<TraceStep[]> {
  if (!isElectron) return [];
  const steps = await window.electronAPI.invoke<TraceStep[]>({
    type: 'session.getTraceSteps',
    payload: { sessionId },
  });
  return steps || [];
}

export function isSessionMessagesHydrated(sessionId: string | null): boolean {
  if (!sessionId) return true;
  const state = useAppStore.getState();
  if (state.sessionMessagesHydrated[sessionId]) return true;
  return (state.sessionStates[sessionId]?.messages?.length ?? 0) > 0;
}

export function hydrateSessionMessages(
  sessionId: string,
  overrides: HydrationDeps = {}
): Promise<void> {
  if (isSessionMessagesHydrated(sessionId)) {
    return Promise.resolve();
  }

  const existing = inflightHydration.get(sessionId);
  if (existing) {
    return existing;
  }

  const getSessionMessages = overrides.getSessionMessages ?? fetchSessionMessages;
  const getSessionTraceSteps = overrides.getSessionTraceSteps ?? fetchSessionTraceSteps;

  const promise = (async () => {
    try {
      const loadedMessages = await getSessionMessages(sessionId);
      const store = useAppStore.getState();
      store.setMessages(sessionId, loadedMessages);
      store.markSessionMessagesHydrated(sessionId);

      void getSessionTraceSteps(sessionId)
        .then((traceSteps) => {
          useAppStore.getState().setTraceSteps(sessionId, traceSteps || []);
        })
        .catch((error) => {
          console.error('[session-hydration] Failed to load trace steps:', error);
        });
    } catch (error) {
      console.error('[session-hydration] Failed to load messages:', error);
      useAppStore.getState().markSessionMessagesHydrated(sessionId);
    } finally {
      inflightHydration.delete(sessionId);
    }
  })();

  inflightHydration.set(sessionId, promise);
  return promise;
}
