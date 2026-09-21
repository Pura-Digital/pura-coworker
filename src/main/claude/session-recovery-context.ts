import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Message } from '../../renderer/types';
import { compactTranscript, messagesToTranscript } from '../memory/memory-utils';

export const SESSION_RECOVERY_DIR = '.aiden/session-recovery';
export const DEFAULT_RECOVERY_SNAPSHOT_CHAR_BUDGET = 12000;

export interface SessionRecoveryWriteInput {
  error: string;
  reason?: string;
  compactionSummary?: string;
  messages?: Message[];
  snapshotCharBudget?: number;
}

export function getRecoveryContextPath(cwd: string, sessionId: string): string {
  return path.join(cwd, SESSION_RECOVERY_DIR, `${sessionId}.md`);
}

export function buildRecoverySnapshotFromMessages(
  messages: Message[],
  charBudget: number = DEFAULT_RECOVERY_SNAPSHOT_CHAR_BUDGET
): string {
  const turns = messagesToTranscript(messages);
  if (turns.length === 0) {
    return '(no recent transcript available)';
  }

  const historyItems: string[] = [];
  let charCount = 0;

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    const entry = `<turn role="${turn.role}">${turn.content}</turn>`;
    if (charCount + entry.length > charBudget) {
      break;
    }
    charCount += entry.length;
    historyItems.unshift(entry);
  }

  const trimmedCount = turns.length - historyItems.length;
  const historyNote = trimmedCount > 0 ? `[${trimmedCount} older turns omitted]\n` : '';
  return `${historyNote}${historyItems.join('\n')}`.trim() || '(no recent transcript available)';
}

function formatRecoveryMarkdown(input: SessionRecoveryWriteInput, snapshot: string): string {
  const updatedAt = new Date().toISOString();
  const reason = input.reason?.trim() || 'sdk_session_reset_after_error';
  const error = input.error.trim();
  const compactionSummary = input.compactionSummary?.trim();

  const sections = [
    '# Aiden Session Recovery',
    '',
    `updated_at: ${updatedAt}`,
    `reason: ${reason}`,
    `error: ${error}`,
    '',
    '## Compaction Summary',
    '',
    compactionSummary || '(none captured)',
    '',
    '## Recent Progress',
    '',
    snapshot,
    '',
  ];

  return sections.join('\n');
}

export function writeRecoveryContext(
  cwd: string,
  sessionId: string,
  input: SessionRecoveryWriteInput
): string | null {
  const trimmedCwd = cwd?.trim();
  const trimmedSessionId = sessionId?.trim();
  if (!trimmedCwd || !trimmedSessionId) {
    return null;
  }

  const snapshot = buildRecoverySnapshotFromMessages(
    input.messages ?? [],
    input.snapshotCharBudget ?? DEFAULT_RECOVERY_SNAPSHOT_CHAR_BUDGET
  );
  const filePath = getRecoveryContextPath(trimmedCwd, trimmedSessionId);
  const dirPath = path.dirname(filePath);

  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(filePath, formatRecoveryMarkdown(input, snapshot), 'utf-8');
  return filePath;
}

export function readRecoveryContext(cwd: string, sessionId: string): string | null {
  const trimmedCwd = cwd?.trim();
  const trimmedSessionId = sessionId?.trim();
  if (!trimmedCwd || !trimmedSessionId) {
    return null;
  }

  const filePath = getRecoveryContextPath(trimmedCwd, trimmedSessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  return content || null;
}

export function clearRecoveryContext(cwd: string, sessionId: string): void {
  const trimmedCwd = cwd?.trim();
  const trimmedSessionId = sessionId?.trim();
  if (!trimmedCwd || !trimmedSessionId) {
    return;
  }

  const filePath = getRecoveryContextPath(trimmedCwd, trimmedSessionId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/** Compact transcript helper exposed for tests and diagnostics. */
export function formatRecoveryTranscript(messages: Message[]): string {
  return compactTranscript(messagesToTranscript(messages));
}
