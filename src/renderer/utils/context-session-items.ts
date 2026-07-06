import type { ContentBlock, MCPServerInfo, Message, TraceStep } from '../types';

export type CalledMcpConnector = {
  key: string;
  name: string;
  callCount: number;
};

export type ReadSkill = {
  key: string;
  name: string;
};

function normalizeMcpServerKey(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

function humanizeMcpServerKey(key: string): string {
  return key.replace(/_/g, ' ').trim();
}

function extractMcpServerKey(toolName: string | undefined): string | null {
  if (!toolName?.startsWith('mcp__')) {
    return null;
  }
  const match = toolName.match(/^mcp__(.+?)__.+$/);
  return match?.[1] ?? null;
}

function extractSkillNameFromPath(pathValue: unknown): string | null {
  if (typeof pathValue !== 'string' || !pathValue.trim()) {
    return null;
  }

  const normalized = pathValue.replace(/\\/g, '/');
  const skillMdMatch = normalized.match(/\/skills\/([^/]+)\/SKILL\.md$/i);
  if (skillMdMatch?.[1]) {
    return skillMdMatch[1];
  }

  const folderMatch = normalized.match(/\/skills\/([^/]+)\/?$/i);
  return folderMatch?.[1] ?? null;
}

function extractSkillNameFromInput(input: Record<string, unknown> | undefined): string | null {
  if (!input) {
    return null;
  }

  for (const key of ['skill', 'skill_name', 'skillName', 'name'] as const) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  for (const pathKey of ['path', 'file_path', 'filePath'] as const) {
    const fromPath = extractSkillNameFromPath(input[pathKey]);
    if (fromPath) {
      return fromPath;
    }
  }

  return null;
}

function isSkillReadTool(toolName: string | undefined): boolean {
  if (!toolName) {
    return false;
  }
  const normalized = toolName.trim().toLowerCase();
  return normalized === 'skill' || normalized === 'read_skill';
}

function isSkillPathReadTool(toolName: string | undefined, input: Record<string, unknown> | undefined): boolean {
  if (!toolName || !input) {
    return false;
  }
  const normalized = toolName.trim().toLowerCase();
  if (normalized !== 'read' && normalized !== 'read_file') {
    return false;
  }

  for (const pathKey of ['path', 'file_path', 'filePath'] as const) {
    const pathValue = input[pathKey];
    if (typeof pathValue === 'string' && /\/skills\/[^/]+\/SKILL\.md$/i.test(pathValue.replace(/\\/g, '/'))) {
      return true;
    }
  }

  return false;
}

function collectToolUses(messages: Message[]): Array<{ name: string; input?: Record<string, unknown> }> {
  const items: Array<{ name: string; input?: Record<string, unknown> }> = [];

  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      continue;
    }

    for (const block of message.content as ContentBlock[]) {
      if (block.type !== 'tool_use') {
        continue;
      }
      items.push({ name: block.name, input: block.input });
    }
  }

  return items;
}

export function getCalledMcpConnectors(
  steps: TraceStep[],
  messages: Message[],
  servers: MCPServerInfo[] = []
): CalledMcpConnector[] {
  const counts = new Map<string, number>();

  const register = (toolName: string | undefined) => {
    const key = extractMcpServerKey(toolName);
    if (!key) {
      return;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  for (const step of steps) {
    register(step.toolName);
  }

  for (const toolUse of collectToolUses(messages)) {
    register(toolUse.name);
  }

  const serverByKey = new Map(
    servers.map((server) => [normalizeMcpServerKey(server.name), server.name])
  );

  return Array.from(counts.entries())
    .map(([key, callCount]) => ({
      key,
      name: serverByKey.get(key) ?? humanizeMcpServerKey(key),
      callCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getReadSkills(steps: TraceStep[], messages: Message[]): ReadSkill[] {
  const seen = new Set<string>();
  const items: ReadSkill[] = [];

  const register = (rawName: string | null | undefined) => {
    const name = rawName?.trim();
    if (!name) {
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push({ key, name });
  };

  const inspect = (toolName: string | undefined, input?: Record<string, unknown>) => {
    if (isSkillReadTool(toolName)) {
      register(extractSkillNameFromInput(input));
      return;
    }
    if (isSkillPathReadTool(toolName, input)) {
      for (const pathKey of ['path', 'file_path', 'filePath'] as const) {
        register(extractSkillNameFromPath(input?.[pathKey]));
      }
    }
  };

  for (const step of steps) {
    inspect(step.toolName, step.toolInput);
  }

  for (const toolUse of collectToolUses(messages)) {
    inspect(toolUse.name, toolUse.input);
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(value);
}
