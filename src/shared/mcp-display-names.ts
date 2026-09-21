const GUI_OPERATE_ALIASES = new Set(['gui_operate', 'computer_use']);

function normalizeMcpServerKey(name: string): string {
  return name.trim().replace(/\s+/g, '_').toLowerCase();
}

/** Whether an MCP server config name refers to the built-in GUI automation server. */
export function isGuiOperateServerName(name: string): boolean {
  return GUI_OPERATE_ALIASES.has(normalizeMcpServerKey(name));
}

/** User-facing label for MCP server names (handles legacy GUI_Operate installs). */
export function formatMcpServerDisplayName(name: string): string {
  if (isGuiOperateServerName(name)) {
    return 'Computer Use';
  }
  return name;
}
