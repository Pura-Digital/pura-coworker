import type { Api, Model } from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';

function needsGoogleThinkingCompatibility(model: Model<Api>): boolean {
  return model.api === 'google-generative-ai' && /^gemini-3\.(?:7|8)-flash(?:-|$)/i.test(model.id);
}

/** Gemini 3.7/3.8 Flash reject MINIMAL; LOW is their lowest supported level. */
export function normalizePiProviderPayload(payload: unknown, model: Model<Api>): unknown {
  if (!needsGoogleThinkingCompatibility(model) || !payload || typeof payload !== 'object')
    return payload;
  const params = payload as { config?: { thinkingConfig?: { thinkingLevel?: string } } };
  if (params.config?.thinkingConfig?.thinkingLevel !== 'MINIMAL') return payload;
  return {
    ...params,
    config: {
      ...params.config,
      thinkingConfig: { ...params.config.thinkingConfig, thinkingLevel: 'LOW' },
    },
  };
}

export function withPiStreamCompatibility(original: StreamFn): StreamFn {
  return (model, context, options) => {
    if (!needsGoogleThinkingCompatibility(model)) return original(model, context, options);
    return original(model, context, {
      ...options,
      onPayload: async (payload, modelArg) => {
        const next = (await options?.onPayload?.(payload, modelArg)) ?? payload;
        return normalizePiProviderPayload(next, modelArg);
      },
    });
  };
}
