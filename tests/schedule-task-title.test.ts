import { describe, expect, it } from 'vitest';
import {
  buildScheduledTaskFallbackTitle,
  buildScheduledTaskTitle,
  summarizeSchedulePrompt,
} from '../src/shared/schedule/task-title';

describe('scheduled task title', () => {
  it('always prefixes with [Scheduled Task]', () => {
    expect(buildScheduledTaskTitle('Organize my todos for today')).toBe(
      '[Scheduled Task] Organize my todos for today',
    );
  });

  it('normalizes whitespace and line breaks', () => {
    expect(buildScheduledTaskTitle('  line one\n\nline two   line three  ')).toBe(
      '[Scheduled Task] line one line two line three',
    );
  });

  it('strips duplicated schedule prefix (legacy Chinese)', () => {
    expect(buildScheduledTaskTitle('[定时任务] Daily summary')).toBe('[Scheduled Task] Daily summary');
  });

  it('strips duplicated schedule prefix (English)', () => {
    expect(buildScheduledTaskTitle('[Scheduled Task] Daily summary')).toBe(
      '[Scheduled Task] Daily summary',
    );
  });

  it('truncates very long prompt summary', () => {
    const longPrompt = 'a'.repeat(70);
    expect(summarizeSchedulePrompt(longPrompt)).toBe(`${'a'.repeat(45)}...`);
  });

  it('falls back for empty prompt', () => {
    expect(buildScheduledTaskTitle('   ')).toBe('[Scheduled Task] Untitled task');
  });

  it('builds fallback title from prompt summary', () => {
    expect(buildScheduledTaskFallbackTitle('Find recent Agent papers from the past week')).toBe(
      '[Scheduled Task] Find recent Agent papers from the past week',
    );
  });
});
