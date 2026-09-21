import { describe, expect, it } from 'vitest';

import { ensureUserMessageInChatPayload } from '../src/main/claude/ollama-payload-guard';

describe('ensureUserMessageInChatPayload', () => {
  it('appends a user message when messages is missing', () => {
    const result = ensureUserMessageInChatPayload({ model: 'qwen3:8b' });
    expect(result.messages).toEqual([{ role: 'user', content: 'Continue.' }]);
  });

  it('appends a user message when no user role exists', () => {
    const result = ensureUserMessageInChatPayload({
      messages: [{ role: 'assistant', content: 'tool call pending' }],
    });
    expect(result.messages).toEqual([
      { role: 'assistant', content: 'tool call pending' },
      { role: 'user', content: 'Continue.' },
    ]);
  });

  it('does not duplicate when a non-empty user message exists', () => {
    const payload = {
      messages: [{ role: 'user', content: 'hello' }],
    };
    const result = ensureUserMessageInChatPayload(payload);
    expect(result).toBe(payload);
    expect(result.messages).toHaveLength(1);
  });

  it('injects when user content is empty or whitespace', () => {
    const result = ensureUserMessageInChatPayload({
      messages: [{ role: 'user', content: '   ' }],
    });
    expect(result.messages).toEqual([
      { role: 'user', content: '   ' },
      { role: 'user', content: 'Continue.' },
    ]);
  });

  it('supports custom fallback text', () => {
    const result = ensureUserMessageInChatPayload({ messages: [] }, 'Resume task.');
    expect(result.messages).toEqual([{ role: 'user', content: 'Resume task.' }]);
  });

  it('treats structured text content blocks as valid user content', () => {
    const payload = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    };
    const result = ensureUserMessageInChatPayload(payload);
    expect(result).toBe(payload);
  });
});
