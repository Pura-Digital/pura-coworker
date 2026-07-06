import { describe, expect, it } from 'vitest';
import {
  accumulateAssistantRenderItems,
  groupAssistantContentBlocks,
} from '../src/renderer/utils/message-content-groups';
import type { ContentBlock } from '../src/renderer/types';

describe('groupAssistantContentBlocks', () => {
  const merged = new Set<string>();

  it('groups tool_use blocks after a thinking block into one thinking group', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', thinking: 'Checking the collection.' },
      { type: 'tool_use', id: 'tu-1', name: 'mcp__ArchiveyeExcel__get_collection_info', input: {} },
      { type: 'tool_result', toolUseId: 'tu-1', content: 'ok' },
      { type: 'tool_use', id: 'tu-2', name: 'mcp__ArchiveyeExcel__list_documents', input: {} },
      { type: 'tool_result', toolUseId: 'tu-2', content: 'ok' },
      { type: 'text', text: 'Done.' },
    ];
    merged.add('tu-1');
    merged.add('tu-2');

    const items = groupAssistantContentBlocks(blocks, merged);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: 'thinking_group',
      thinking: { type: 'thinking', thinking: 'Checking the collection.' },
    });
    expect(items[0].kind === 'thinking_group' && items[0].tools.map((tool) => tool.id)).toEqual([
      'tu-1',
      'tu-2',
    ]);
    expect(items[1]).toMatchObject({ kind: 'block', block: { type: 'text', text: 'Done.' } });
  });

  it('starts a new thinking group for each thinking block', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', thinking: 'First pass.' },
      { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
      { type: 'thinking', thinking: 'Second pass.' },
      { type: 'tool_use', id: 'tu-2', name: 'Write', input: {} },
    ];

    const items = groupAssistantContentBlocks(blocks, merged);

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.kind === 'thinking_group')).toBe(true);
    expect(items[0].kind === 'thinking_group' && items[0].tools).toHaveLength(1);
    expect(items[1].kind === 'thinking_group' && items[1].tools).toHaveLength(1);
  });

  it('keeps AskUserQuestion and TodoWrite outside thinking groups', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', thinking: 'Need input.' },
      { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
      { type: 'tool_use', id: 'tu-2', name: 'AskUserQuestion', input: {} },
    ];

    const items = groupAssistantContentBlocks(blocks, merged);

    expect(items).toHaveLength(2);
    expect(items[0].kind === 'thinking_group' && items[0].tools).toHaveLength(1);
    expect(items[1].kind === 'block' && items[1].block.type).toBe('tool_use');
  });

  it('groups orphan tool_use blocks into a tool group', () => {
    const blocks: ContentBlock[] = [
      { type: 'tool_use', id: 'tu-1', name: 'Bash', input: {} },
      { type: 'text', text: 'Result' },
    ];

    const items = groupAssistantContentBlocks(blocks, merged);

    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('tool_group');
    expect(items[0].kind === 'tool_group' && items[0].tools).toHaveLength(1);
    expect(items[1].kind).toBe('block');
  });

  it('groups consecutive orphan tool_use blocks together', () => {
    const blocks: ContentBlock[] = [
      { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
      { type: 'tool_use', id: 'tu-2', name: 'Write', input: {} },
      { type: 'text', text: 'Done.' },
    ];

    const items = groupAssistantContentBlocks(blocks, merged);

    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('tool_group');
    expect(items[0].kind === 'tool_group' && items[0].tools.map((tool) => tool.id)).toEqual([
      'tu-1',
      'tu-2',
    ]);
  });

  it('treats empty thinking blocks with tools as tool groups', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', thinking: '   ' },
      { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
      { type: 'text', text: 'Done.' },
    ];

    const items = groupAssistantContentBlocks(blocks, merged);

    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('tool_group');
  });
});

describe('accumulateAssistantRenderItems', () => {
  const merged = new Set<string>();

  it('merges consecutive thinking groups into a stack', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', thinking: 'Step 1.' },
      { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
      { type: 'thinking', thinking: 'Step 2.' },
      { type: 'tool_use', id: 'tu-2', name: 'Write', input: {} },
      { type: 'thinking', thinking: 'Step 3.' },
      { type: 'text', text: 'Done.' },
    ];

    const items = accumulateAssistantRenderItems(groupAssistantContentBlocks(blocks, merged));

    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('thinking_stack');
    expect(items[0].kind === 'thinking_stack' && items[0].groups).toHaveLength(3);
    expect(items[1].kind).toBe('block');
  });

  it('merges consecutive tool groups into a tool stack', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', thinking: '   ' },
      { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
      { type: 'thinking', thinking: '' },
      { type: 'tool_use', id: 'tu-2', name: 'Write', input: {} },
      { type: 'text', text: 'Done.' },
    ];

    const items = accumulateAssistantRenderItems(groupAssistantContentBlocks(blocks, merged));

    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('tool_stack');
    expect(items[0].kind === 'tool_stack' && items[0].tools.map((tool) => tool.id)).toEqual([
      'tu-1',
      'tu-2',
    ]);
  });

  it('keeps a single thinking group unstacked', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', thinking: 'Only one.' },
      { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} },
      { type: 'text', text: 'Done.' },
    ];

    const items = accumulateAssistantRenderItems(groupAssistantContentBlocks(blocks, merged));

    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('thinking_group');
  });

  it('does not merge thinking groups separated by other blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', thinking: 'Before text.' },
      { type: 'text', text: 'Middle answer.' },
      { type: 'thinking', thinking: 'After text.' },
    ];

    const items = accumulateAssistantRenderItems(groupAssistantContentBlocks(blocks, merged));

    expect(items.map((item) => item.kind)).toEqual(['thinking_group', 'block', 'thinking_group']);
  });
});
