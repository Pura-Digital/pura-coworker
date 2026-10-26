import type { AgentSession as PiAgentSession } from '@mariozechner/pi-coding-agent';
import { log, logWarn } from '../utils/logger';

/** Strip server-managed model field for Pura subscription OpenAI-compatible calls. */
export function installPuraSubscriptionPayloadPatch(piSession: PiAgentSession): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = piSession.agent as any;
  if (!('_onPayload' in agent)) {
    logWarn('[PuraSubscription] SDK agent does not expose _onPayload — model may be rejected');
    return;
  }
  const originalOnPayload = agent._onPayload as
    | ((payload: Record<string, unknown>, modelArg: unknown) => Promise<Record<string, unknown>>)
    | undefined;
  agent._onPayload = async (payload: Record<string, unknown>, modelArg: unknown) => {
    let result = originalOnPayload
      ? await originalOnPayload.call(agent, payload, modelArg)
      : payload;
    if (result === undefined) {
      result = payload;
    }
    const next = { ...result };
    delete next.model;
    log('[PuraSubscription] Stripped model from upstream payload');
    return next;
  };
}
