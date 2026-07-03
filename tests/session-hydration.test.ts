import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../src/renderer/store';
import {
  hydrateSessionMessages,
  isSessionMessagesHydrated,
} from '../src/renderer/utils/session-hydration';
import type { Message } from '../src/renderer/types';

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
});

describe('session-hydration', () => {
  it('marks session hydrated immediately after messages load', async () => {
    const messages: Message[] = [
      {
        id: 'm1',
        sessionId: 's1',
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
        timestamp: 1,
      },
    ];

    let traceResolved = false;
    const getSessionTraceSteps = vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          setTimeout(() => {
            traceResolved = true;
            resolve([]);
          }, 100)
        })
    );

    await hydrateSessionMessages('s1', {
      getSessionMessages: vi.fn().mockResolvedValue(messages),
      getSessionTraceSteps,
    });

    expect(useAppStore.getState().sessionStates.s1?.messages).toEqual(messages);
    expect(isSessionMessagesHydrated('s1')).toBe(true);
    expect(traceResolved).toBe(false);
  });

  it('marks session hydrated even when messages are empty', async () => {
    await hydrateSessionMessages('s1', {
      getSessionMessages: vi.fn().mockResolvedValue([]),
      getSessionTraceSteps: vi.fn().mockResolvedValue([]),
    });

    expect(useAppStore.getState().sessionStates.s1?.messages).toEqual([]);
    expect(isSessionMessagesHydrated('s1')).toBe(true);
  });

  it('dedupes concurrent hydration for the same session', async () => {
    const getSessionMessages = vi.fn().mockImplementation(
      () => new Promise<Message[]>((resolve) => setTimeout(() => resolve([]), 20))
    );

    const deps = {
      getSessionMessages,
      getSessionTraceSteps: vi.fn().mockResolvedValue([]),
    };

    await Promise.all([
      hydrateSessionMessages('s1', deps),
      hydrateSessionMessages('s1', deps),
    ]);

    expect(getSessionMessages).toHaveBeenCalledTimes(1);
  });
});
