import { describe, expect, it } from 'vitest';
import {
  coalesceAssistantMessagesForDisplay,
  isThinkingRunContent,
} from '../src/renderer/utils/message-display-groups';
import {
  accumulateAssistantRenderItems,
  groupAssistantContentBlocks,
} from '../src/renderer/utils/message-content-groups';
import type { ContentBlock, Message } from '../src/renderer/types';

function assistantMessage(id: string, content: ContentBlock[]): Message {
  return {
    id,
    sessionId: 'session-1',
    role: 'assistant',
    content,
    timestamp: Date.now(),
  };
}

describe('isThinkingRunContent', () => {
  it('accepts thinking, tool_use, and tool_result blocks', () => {
    expect(
      isThinkingRunContent([
        { type: 'thinking', thinking: 'Step 1' },
        { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
        { type: 'tool_result', toolUseId: 'tu-1', content: 'ok' },
      ])
    ).toBe(true);
  });

  it('rejects assistant text answers', () => {
    expect(isThinkingRunContent([{ type: 'text', text: 'Final answer' }])).toBe(false);
  });
});

describe('coalesceAssistantMessagesForDisplay', () => {
  it('merges consecutive assistant thinking-run messages into one display unit', () => {
    const messages: Message[] = [
      assistantMessage('a-1', [
        { type: 'thinking', thinking: 'Checking collection.' },
        { type: 'tool_use', id: 'tu-1', name: 'mcp__ArchiveyeExcel__get_collection_info', input: {} },
      ]),
      assistantMessage('a-2', [{ type: 'tool_result', toolUseId: 'tu-1', content: 'ok' }]),
      assistantMessage('a-3', [
        { type: 'thinking', thinking: 'Listing documents.' },
        { type: 'tool_use', id: 'tu-2', name: 'mcp__ArchiveyeExcel__list_documents', input: {} },
      ]),
      assistantMessage('a-4', [{ type: 'text', text: 'Ecco i dati.' }]),
    ];

    const units = coalesceAssistantMessagesForDisplay(messages);

    expect(units).toHaveLength(2);
    expect(units[0].coalescedCount).toBe(3);
    expect(units[0].message.content).toHaveLength(5);
    expect(units[1].message.content).toEqual([{ type: 'text', text: 'Ecco i dati.' }]);
  });

  it('keeps a single thinking-run message untouched', () => {
    const messages = [
      assistantMessage('a-1', [
        { type: 'thinking', thinking: 'Only one.' },
        { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
      ]),
    ];

    const units = coalesceAssistantMessagesForDisplay(messages);

    expect(units).toHaveLength(1);
    expect(units[0].coalescedCount).toBe(1);
    expect(units[0].message.id).toBe('a-1');
  });

  it('does not merge across user messages', () => {
    const messages: Message[] = [
      assistantMessage('a-1', [{ type: 'thinking', thinking: 'Before user.' }]),
      {
        id: 'u-1',
        sessionId: 'session-1',
        role: 'user',
        content: [{ type: 'text', text: 'Next question' }],
        timestamp: Date.now(),
      },
      assistantMessage('a-2', [{ type: 'thinking', thinking: 'After user.' }]),
    ];

    const units = coalesceAssistantMessagesForDisplay(messages);

    expect(units).toHaveLength(3);
    expect(units.every((unit) => unit.coalescedCount === 1)).toBe(true);
  });
});

describe('coalesce + thinking stack integration', () => {
  it('produces a thinking stack after merging split assistant messages', () => {
    const messages = [
      assistantMessage('a-1', [
        { type: 'thinking', thinking: 'Step 1.' },
        { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
      ]),
      assistantMessage('a-2', [{ type: 'tool_result', toolUseId: 'tu-1', content: 'ok' }]),
      assistantMessage('a-3', [
        { type: 'thinking', thinking: 'Step 2.' },
        { type: 'tool_use', id: 'tu-2', name: 'Write', input: {} },
      ]),
    ];

    const [unit] = coalesceAssistantMessagesForDisplay(messages);
    const blocks = unit.message.content as ContentBlock[];
    const mergedResultIds = new Set(['tu-1']);

    const items = accumulateAssistantRenderItems(
      groupAssistantContentBlocks(blocks, mergedResultIds)
    );

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('thinking_stack');
    expect(items[0].kind === 'thinking_stack' && items[0].groups).toHaveLength(2);
  });
});
