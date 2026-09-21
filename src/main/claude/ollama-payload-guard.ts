const DEFAULT_FALLBACK_USER_TEXT = 'Continue.';

type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

function hasNonEmptyContent(content: unknown): boolean {
  if (typeof content === 'string') {
    return content.trim().length > 0;
  }
  if (Array.isArray(content)) {
    return content.some((part) => {
      if (typeof part === 'string') {
        return part.trim().length > 0;
      }
      if (part && typeof part === 'object') {
        const typed = part as { type?: unknown; text?: unknown; thinking?: unknown };
        if (typed.type === 'text' && typeof typed.text === 'string') {
          return typed.text.trim().length > 0;
        }
        if (typed.type === 'thinking' && typeof typed.thinking === 'string') {
          return typed.thinking.trim().length > 0;
        }
      }
      return false;
    });
  }
  return false;
}

function hasUserMessage(messages: ChatMessage[]): boolean {
  return messages.some(
    (message) => message.role === 'user' && hasNonEmptyContent(message.content)
  );
}

/**
 * Ollama rejects chat completion payloads without a non-empty user message.
 * Ensures one exists before the request is sent.
 */
export function ensureUserMessageInChatPayload(
  payload: Record<string, unknown>,
  fallbackText: string = DEFAULT_FALLBACK_USER_TEXT
): Record<string, unknown> {
  const rawMessages = payload.messages;
  const messages = Array.isArray(rawMessages) ? [...(rawMessages as ChatMessage[])] : [];

  if (hasUserMessage(messages)) {
    return payload;
  }

  const trimmedFallback = fallbackText.trim() || DEFAULT_FALLBACK_USER_TEXT;
  return {
    ...payload,
    messages: [...messages, { role: 'user', content: trimmedFallback }],
  };
}
