import { describe, expect, it } from 'vitest';
import {
  formatMcpServerDisplayName,
  isGuiOperateServerName,
} from '../src/shared/mcp-display-names';

describe('mcp display names', () => {
  it('recognizes legacy and current GUI operate server names', () => {
    expect(isGuiOperateServerName('GUI_Operate')).toBe(true);
    expect(isGuiOperateServerName('GUI Operate')).toBe(true);
    expect(isGuiOperateServerName('Computer Use')).toBe(true);
    expect(isGuiOperateServerName('Computer_Use')).toBe(true);
    expect(isGuiOperateServerName('Chrome')).toBe(false);
  });

  it('formats GUI operate names for display', () => {
    expect(formatMcpServerDisplayName('GUI_Operate')).toBe('Computer Use');
    expect(formatMcpServerDisplayName('GUI Operate')).toBe('Computer Use');
    expect(formatMcpServerDisplayName('Computer_Use')).toBe('Computer Use');
    expect(formatMcpServerDisplayName('Chrome')).toBe('Chrome');
  });
});
