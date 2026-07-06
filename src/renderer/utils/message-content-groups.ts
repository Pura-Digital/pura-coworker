import type { ContentBlock, ThinkingContent, ToolResultContent, ToolUseContent } from '../types';

const STANDALONE_TOOL_NAMES = new Set(['AskUserQuestion', 'TodoWrite']);

export type ThinkingGroupItem = {
  thinking: ThinkingContent;
  tools: ToolUseContent[];
  key: string;
};

export type MessageRenderItem =
  | {
      kind: 'thinking_group';
      thinking: ThinkingContent;
      tools: ToolUseContent[];
      key: string;
    }
  | {
      kind: 'thinking_stack';
      groups: ThinkingGroupItem[];
      key: string;
    }
  | {
      kind: 'tool_group';
      tools: ToolUseContent[];
      key: string;
    }
  | {
      kind: 'tool_stack';
      tools: ToolUseContent[];
      key: string;
    }
  | {
      kind: 'block';
      block: ContentBlock;
      index: number;
    };

function isMergedToolResult(block: ContentBlock, mergedResultIds: Set<string>): boolean {
  return (
    block.type === 'tool_result' &&
    mergedResultIds.has((block as ToolResultContent).toolUseId)
  );
}

function isStandaloneTool(block: ContentBlock): block is ToolUseContent {
  return block.type === 'tool_use' && STANDALONE_TOOL_NAMES.has((block as ToolUseContent).name);
}

function collectConsecutiveToolUses(
  blocks: ContentBlock[],
  startIndex: number,
  mergedResultIds: Set<string>
): { tools: ToolUseContent[]; nextIndex: number } {
  const tools: ToolUseContent[] = [];
  let index = startIndex;

  while (index < blocks.length) {
    const next = blocks[index];
    if (isMergedToolResult(next, mergedResultIds)) {
      index += 1;
      continue;
    }
    if (next.type === 'tool_use' && !isStandaloneTool(next)) {
      tools.push(next as ToolUseContent);
      index += 1;
      continue;
    }
    break;
  }

  return { tools, nextIndex: index };
}

function pushToolGroup(items: MessageRenderItem[], tools: ToolUseContent[]): void {
  if (tools.length === 0) return;
  items.push({
    kind: 'tool_group',
    tools,
    key: `tool-group-${items.length}-${tools.map((tool) => tool.id).join('-')}`,
  });
}

export function groupAssistantContentBlocks(
  blocks: ContentBlock[],
  mergedResultIds: Set<string>
): MessageRenderItem[] {
  const items: MessageRenderItem[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];

    if (isMergedToolResult(block, mergedResultIds)) {
      index += 1;
      continue;
    }

    if (block.type === 'thinking') {
      const thinking = block as ThinkingContent;
      index += 1;
      const { tools, nextIndex } = collectConsecutiveToolUses(blocks, index, mergedResultIds);
      index = nextIndex;

      const thinkingText = thinking.thinking?.trim() ?? '';
      if (!thinkingText) {
        pushToolGroup(items, tools);
        continue;
      }

      items.push({
        kind: 'thinking_group',
        thinking,
        tools,
        key: `thinking-group-${items.length}-${thinking.thinking.slice(0, 24)}`,
      });
      continue;
    }

    if (block.type === 'tool_use' && !isStandaloneTool(block)) {
      const { tools, nextIndex } = collectConsecutiveToolUses(blocks, index, mergedResultIds);
      index = nextIndex;
      pushToolGroup(items, tools);
      continue;
    }

    items.push({ kind: 'block', block, index });
    index += 1;
  }

  return items;
}

export function accumulateAssistantRenderItems(items: MessageRenderItem[]): MessageRenderItem[] {
  const result: MessageRenderItem[] = [];
  let index = 0;

  while (index < items.length) {
    const item = items[index];

    if (item.kind === 'thinking_group') {
      const groups: ThinkingGroupItem[] = [];
      while (index < items.length && items[index].kind === 'thinking_group') {
        const group = items[index] as Extract<MessageRenderItem, { kind: 'thinking_group' }>;
        groups.push({
          thinking: group.thinking,
          tools: group.tools,
          key: group.key,
        });
        index += 1;
      }

      if (groups.length === 1) {
        result.push({ kind: 'thinking_group', ...groups[0] });
      } else {
        result.push({
          kind: 'thinking_stack',
          groups,
          key: `thinking-stack-${groups.map((group) => group.key).join('|')}`,
        });
      }
      continue;
    }

    if (item.kind === 'tool_group') {
      const tools: ToolUseContent[] = [];
      while (index < items.length && items[index].kind === 'tool_group') {
        const group = items[index] as Extract<MessageRenderItem, { kind: 'tool_group' }>;
        tools.push(...group.tools);
        index += 1;
      }

      if (tools.length === 1) {
        result.push({
          kind: 'tool_group',
          tools,
          key: `tool-${tools[0].id}`,
        });
      } else {
        result.push({
          kind: 'tool_stack',
          tools,
          key: `tool-stack-${tools.map((tool) => tool.id).join('|')}`,
        });
      }
      continue;
    }

    result.push(item);
    index += 1;
  }

  return result;
}

/** @deprecated Use accumulateAssistantRenderItems */
export const accumulateConsecutiveThinkingGroups = accumulateAssistantRenderItems;
