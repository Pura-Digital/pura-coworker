import type { AssistantMessage, TextContent, ThinkingContent, ToolCall } from '@mariozechner/pi-ai';
import { splitThinkTagBlocks } from './think-tag-parser';

type MessageEndContentBlock = TextContent | ThinkingContent | ToolCall;

type MessageEndMessage = Pick<AssistantMessage, 'role' | 'content' | 'stopReason' | 'errorMessage'>;

interface ResolveMessageEndPayloadOptions {
  message?: MessageEndMessage;
  streamedText: string;
  provider?: string;
  receivedFirstStreamEvent?: boolean;
}

interface ResolvedMessageEndPayload {
  effectiveContent: MessageEndContentBlock[];
  errorText?: string;
  nextStreamedText: string;
  shouldEmitMessage: boolean;
}

export const RECOVERABLE_TERMINAL_ERROR_FOOTER =
  'Session context was preserved. Send your next message to continue.';

export function isRecoverableTerminalError(errorText: string): boolean {
  const lower = errorText.toLowerCase();
  if (lower.includes('first_response_timeout')) {
    return true;
  }
  if (lower.includes('request timed out') || lower.includes('timed out')) {
    return true;
  }
  if (lower.includes('no user query found in messages')) {
    return true;
  }
  if (lower.includes('ollama_empty_during_load')) {
    return true;
  }
  if (lower.includes('empty_success_result')) {
    return true;
  }
  if (/\b(5\d{2})\b/.test(errorText)) {
    return true;
  }
  if (
    lower.includes('server error') ||
    lower.includes('internal error') ||
    lower.includes('service unavailable') ||
    lower.includes('overloaded')
  ) {
    return true;
  }
  return false;
}

export function getTerminalErrorFooter(errorText: string): string {
  if (/\b4\d{2}\b/.test(errorText)) {
    return 'Please check your configuration and retry.';
  }
  if (isRecoverableTerminalError(errorText)) {
    return RECOVERABLE_TERMINAL_ERROR_FOOTER;
  }
  return 'Please retry or check your model configuration.';
}

export function toUserFacingErrorText(errorText: string): string {
  const lower = errorText.toLowerCase();
  if (lower.includes('first_response_timeout')) {
    return 'Model response timed out: no upstream response received for a long time. Retry later or check model/gateway load.';
  }
  if (lower.includes('no user query found in messages')) {
    return 'The model request was rejected because the conversation payload did not include a user message. This can happen during long tool-heavy sessions. The agent session was reset automatically and your recent context was preserved.';
  }
  if (lower.includes('ollama_empty_during_load')) {
    return 'The Ollama model returned an empty response, often during cold start while the model is loading into memory. Wait a moment and try again, or preload the model with `ollama run <model>`.';
  }
  if (lower.includes('empty_success_result')) {
    return 'The model returned an empty success result. The current model or gateway may be incompatible. Retry or switch protocol.';
  }
  if (
    /\b400\b/.test(errorText) ||
    lower.includes('bad request') ||
    lower.includes('invalid request')
  ) {
    return `Request rejected by upstream (400). The model or protocol configuration may be incompatible. Check the model name, protocol settings, and API endpoint.\nOriginal error: ${errorText}`;
  }
  if (
    /\b(401|403)\b/.test(errorText) ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  ) {
    return `Authentication failed. Check whether the API key is correct, expired, or lacks access to the current model.\nOriginal error: ${errorText}`;
  }
  if (
    /\b429\b/.test(errorText) ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return `Request rate-limited (429). The current model or API endpoint has reached its call limit. Retry later.\nOriginal error: ${errorText}`;
  }
  if (
    /\b(5\d{2})\b/.test(errorText) ||
    lower.includes('server error') ||
    lower.includes('internal error') ||
    lower.includes('service unavailable') ||
    lower.includes('overloaded')
  ) {
    return `The model request failed upstream. The agent session was reset automatically and your recent context was preserved.\nOriginal error: ${errorText}`;
  }
  if (
    lower.includes('terminated') ||
    lower.includes('connection reset') ||
    lower.includes('connection closed') ||
    lower.includes('connection refused') ||
    lower.includes('connection error') ||
    lower.includes('fetch failed') ||
    lower.includes('other side closed') ||
    lower.includes('reset before headers') ||
    lower.includes('upstream connect') ||
    lower.includes('retry delay')
  ) {
    return `Network connection interrupted (${errorText}). The proxy or gateway may be unstable. The SDK will retry automatically.`;
  }
  return errorText;
}

export function resolveMessageEndPayload(
  options: ResolveMessageEndPayloadOptions
): ResolvedMessageEndPayload {
  const { message, streamedText, provider, receivedFirstStreamEvent } = options;
  const nextStreamedText = '';

  if (message?.stopReason === 'error' && message.errorMessage) {
    return {
      effectiveContent: [],
      errorText: toUserFacingErrorText(message.errorMessage),
      nextStreamedText,
      shouldEmitMessage: false,
    };
  }

  const rawContent =
    Array.isArray(message?.content) && message.content.length > 0
      ? message.content
      : streamedText
        ? [{ type: 'text' as const, text: streamedText }]
        : [];

  if (rawContent.length === 0) {
    const emptyErrorCode =
      provider === 'ollama' && receivedFirstStreamEvent === false
        ? 'ollama_empty_during_load'
        : 'empty_success_result';
    return {
      effectiveContent: [],
      errorText: toUserFacingErrorText(emptyErrorCode),
      nextStreamedText,
      shouldEmitMessage: false,
    };
  }

  // Post-process: split any <think>...</think> tags in text blocks into
  // separate thinking + text content blocks for proper UI rendering.
  const effectiveContent: MessageEndContentBlock[] = [];
  for (const block of rawContent) {
    if (block.type === 'text') {
      const splitBlocks = splitThinkTagBlocks(block.text);
      for (const splitBlock of splitBlocks) {
        if (splitBlock.type === 'thinking') {
          effectiveContent.push({
            type: 'thinking',
            thinking: splitBlock.thinking,
          } as ThinkingContent);
        } else {
          effectiveContent.push({ type: 'text', text: splitBlock.text } as TextContent);
        }
      }
    } else {
      effectiveContent.push(block);
    }
  }

  return {
    effectiveContent,
    nextStreamedText,
    shouldEmitMessage: effectiveContent.length > 0 && (message?.role === 'assistant' || !message),
  };
}
