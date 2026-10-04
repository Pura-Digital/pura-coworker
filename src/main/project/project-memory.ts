import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Message } from '../../renderer/types';

export function hasProjectMemory(content: string): boolean {
  return content.split('\n').some((line) => line.trim() && !/^\s*#/.test(line));
}

// Budget actual conversation text, rather than letting tool events crowd out decisions.
export function buildProjectTranscript(messages: Message[], maxChars = 60000): string {
  const entries = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => {
      const text = message.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { text: string }).text)
        .join('\n')
        .trim();
      return text
        ? `**${message.role === 'user' ? 'User' : 'Assistant'}:** ${text.slice(0, 12000)}`
        : '';
    })
    .filter(Boolean);
  const selected: string[] = [];
  let remaining = maxChars;
  for (const entry of entries.reverse()) {
    if (remaining <= 0) break;
    const bounded = entry.slice(0, remaining);
    selected.unshift(bounded);
    remaining -= bounded.length + 2;
  }
  return selected.join('\n\n');
}

/** Serialize by file, and refuse to overwrite edits made while the model is running. */
export class ProjectMemoryUpdater {
  private pending = new Map<string, Promise<void>>();

  update(
    memoryPath: string,
    generate: (existing: string) => Promise<string | null>
  ): Promise<void> {
    const key = path.resolve(memoryPath);
    const previous = this.pending.get(key) ?? Promise.resolve();
    const job = previous
      .catch(() => {})
      .then(async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const existing = this.read(key);
          const raw = await generate(existing);
          const updated = raw
            ?.trim()
            .replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1')
            .trim();
          if (!updated || !hasProjectMemory(updated)) {
            if (attempt < 2) continue;
            throw new Error('Project memory generation returned no durable content');
          }
          if (this.read(key) !== existing) continue;
          if (updated === existing.trim()) return;
          const temporary = `${key}.${randomUUID()}.tmp`;
          try {
            fs.writeFileSync(temporary, `${updated}\n`, 'utf-8');
            if (fs.existsSync(key)) fs.copyFileSync(key, `${key}.bak`);
            fs.renameSync(temporary, key);
          } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
          }
          return;
        }
        throw new Error('Project memory changed during generation; existing edits were preserved');
      });
    this.pending.set(key, job);
    void job
      .finally(() => {
        if (this.pending.get(key) === job) this.pending.delete(key);
      })
      .catch(() => {});
    return job;
  }

  private read(memoryPath: string): string {
    return fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, 'utf-8') : '';
  }
}
