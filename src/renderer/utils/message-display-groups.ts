import type { ContentBlock, Message } from '../types';

export type ChatDisplayUnit = {
  message: Message;
  isStreaming: boolean;
  coalescedCount: number;
};

export function normalizeMessageContent(content: unknown): ContentBlock[] {
  if (Array.isArray(content)) {
    return content as ContentBlock[];
  }
  return [{ type: 'text', text: String(content ?? '') }];
}

export function isPartialStreamingMessage(message: Message): boolean {
  return typeof message.id === 'string' && message.id.startsWith('partial-');
}

export function isThinkingRunContent(blocks: ContentBlock[]): boolean {
  if (blocks.length === 0) return false;

  return blocks.every((block) => {
    if (block.type === 'thinking' || block.type === 'tool_use' || block.type === 'tool_result') {
      return true;
    }
    if (block.type === 'text') {
      return !String(block.text).trim();
    }
    return false;
  });
}

function mergeAssistantMessages(messages: Message[]): Message {
  const content = messages.flatMap((message) => normalizeMessageContent(message.content));
  const last = messages[messages.length - 1];

  return {
    ...last,
    id: messages.map((message) => message.id).join('::'),
    content,
  };
}

export function coalesceAssistantMessagesForDisplay(messages: Message[]): ChatDisplayUnit[] {
  const units: ChatDisplayUnit[] = [];
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];
    const isStreaming = isPartialStreamingMessage(message);
    const blocks = normalizeMessageContent(message.content);

    if (message.role !== 'assistant' || !isThinkingRunContent(blocks)) {
      units.push({ message, isStreaming, coalescedCount: 1 });
      index += 1;
      continue;
    }

    const runMessages: Message[] = [message];
    index += 1;

    while (index < messages.length) {
      const next = messages[index];
      if (next.role !== 'assistant') break;

      const nextBlocks = normalizeMessageContent(next.content);
      if (!isThinkingRunContent(nextBlocks)) break;

      runMessages.push(next);
      index += 1;

      if (isPartialStreamingMessage(next)) break;
    }

    if (runMessages.length === 1) {
      units.push({ message: runMessages[0], isStreaming, coalescedCount: 1 });
      continue;
    }

    units.push({
      message: mergeAssistantMessages(runMessages),
      isStreaming: runMessages.some(isPartialStreamingMessage),
      coalescedCount: runMessages.length,
    });
  }

  return units;
}
