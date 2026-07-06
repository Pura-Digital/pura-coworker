import { describe, it, expect } from 'vitest';
import type { Message, TraceStep } from '../src/renderer/types';
import {
  getCalledMcpConnectors,
  getReadSkills,
  formatTokenCount,
} from '../src/renderer/utils/context-session-items';

describe('getCalledMcpConnectors', () => {
  it('returns only MCP servers that were actually called', () => {
    const steps: TraceStep[] = [
      {
        id: '1',
        type: 'tool_call',
        status: 'completed',
        title: 'mcp tool',
        toolName: 'mcp__Archiveye_Col__list_documents',
        timestamp: Date.now(),
      },
      {
        id: '2',
        type: 'tool_call',
        status: 'completed',
        title: 'mcp tool',
        toolName: 'mcp__Archiveye_Col__get_document',
        timestamp: Date.now(),
      },
    ];

    const connectors = getCalledMcpConnectors(steps, [], [
      { id: 'a', name: 'Archiveye Col', connected: true, toolCount: 6 },
      { id: 'b', name: 'ArchiveyeExcel', connected: true, toolCount: 8 },
    ]);

    expect(connectors).toHaveLength(1);
    expect(connectors[0]).toMatchObject({ name: 'Archiveye Col', callCount: 2 });
  });
});

describe('getReadSkills', () => {
  it('collects skills from Skill tool calls', () => {
    const steps: TraceStep[] = [
      {
        id: '1',
        type: 'tool_call',
        status: 'completed',
        title: 'Skill',
        toolName: 'Skill',
        toolInput: { skill: 'docx' },
        timestamp: Date.now(),
      },
    ];

    expect(getReadSkills(steps, [])).toEqual([{ key: 'docx', name: 'docx' }]);
  });

  it('collects skills from Read calls on SKILL.md paths', () => {
    const messages: Message[] = [
      {
        id: 'm1',
        sessionId: 's1',
        role: 'assistant',
        timestamp: Date.now(),
        content: [
          {
            type: 'tool_use',
            id: 'tu1',
            name: 'Read',
            input: { file_path: '/Users/me/.claude/skills/pdf/SKILL.md' },
          },
        ],
      },
    ];

    expect(getReadSkills([], messages)).toEqual([{ key: 'pdf', name: 'pdf' }]);
  });
});

describe('formatTokenCount', () => {
  it('formats token counts for tooltip labels', () => {
    expect(formatTokenCount(17500)).toBe('17.5k');
    expect(formatTokenCount(128000)).toBe('128.0k');
  });
});
