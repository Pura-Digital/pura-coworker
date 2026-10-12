import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { safeStorage } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
} from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';
import type { AnonymizationEvent } from '../src/shared/anonymization-types';

const root = vi.hoisted(() => `/tmp/aiden-gateway-tests-${process.pid}`);
vi.mock('electron', () => ({
  app: { getPath: () => root, isPackaged: false },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (text: string) => Buffer.from(text),
    decryptString: (value: Buffer) => value.toString(),
  },
}));
vi.mock('../src/main/anonymization/system-storage', () => ({
  requestSystemStorageAccess: vi.fn(),
  restartAppForSystemStorage: vi.fn(),
}));
import {
  requestSystemStorageAccess,
  restartAppForSystemStorage,
} from '../src/main/anonymization/system-storage';
beforeEach(() => {
  vi.mocked(requestSystemStorageAccess).mockReset().mockResolvedValue();
  vi.mocked(restartAppForSystemStorage).mockReset();
});

import { AnonymizationGateway, withAnonymization } from '../src/main/anonymization/gateway';
import {
  normalizeMcpToolResultForModel,
  normalizeToolExecutionResultForUi,
} from '../src/main/claude/tool-result-utils';
const gateways: AnonymizationGateway[] = [];
afterEach(() => {
  gateways.splice(0).forEach((g) => g.dispose());
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const model = {
  id: 'test',
  api: 'openai-completions',
  provider: 'openai',
} as Model<'openai-completions'>;
function makeGateway() {
  const gateway = new AnonymizationGateway();
  gateways.push(gateway);
  vi.spyOn(gateway.service, 'start').mockResolvedValue();
  vi.spyOn(gateway.service, 'analyze').mockImplementation(async (text) => {
    const chars = Array.from(text);
    const start = chars.join('').indexOf('Mario Rossi');
    const offset = start < 0 ? -1 : Array.from(text.slice(0, start)).length;
    return {
      complex: false,
      entities:
        offset < 0 ? [] : [{ label: 'FULLNAME', start: offset, end: offset + 11, score: 1 }],
    };
  });
  return gateway;
}
function message(text: string): AssistantMessage {
  return {
    role: 'assistant',
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [{ type: 'text', text }],
    timestamp: 1,
    stopReason: 'stop',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

describe('anonymization provider boundary', () => {
  it.each(['native', 'legacy'] as const)(
    'explains secure-storage %s failures without starting inference or exposing sensitive errors',
    async (failure) => {
      const gateway = makeGateway();
      if (failure === 'legacy') {
        mkdirSync(`${root}/anonymization`, { recursive: true });
        writeFileSync(`${root}/anonymization/mapping-key.enc`, 'existing encrypted key');
        vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
      } else {
        // Native access is relevant on macOS; force the legacy safeStorage
        // failure on the other platforms so this regression remains portable.
        vi.mocked(requestSystemStorageAccess).mockRejectedValue(
          new Error('private key material must not reach the UI')
        );
        vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
      }
      const restart = vi.spyOn(gateway.service, 'restart').mockResolvedValue();
      const provider = vi.fn();
      const decision = new Promise<AnonymizationEvent>((resolve) => {
        gateway.on('event', (event) => {
          if (event.type === 'decision') resolve(event);
        });
      });
      const stream = await gateway.stream('chat', provider)(model, {
        messages: [{ role: 'user', content: 'Ciao', timestamp: 1 }],
      });
      const event = await decision;
      expect(event.type).toBe('decision');
      if (event.type !== 'decision') throw new Error('Missing decision');
      expect(event.decision.reason).toContain('chiave del matching');
      expect(event.decision.recovery).toBe('system-storage');
      expect(event.decision.reason).not.toContain('private key material');
      expect(gateway.service.start).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
      expect(restart).not.toHaveBeenCalled();
      expect(existsSync(`${root}/anonymization/mapping-key.enc`)).toBe(failure === 'legacy');
      expect(existsSync(`${root}/anonymization/matching.sqlite`)).toBe(false);
      await gateway.decide(event.decision.id, 'cancel');
      expect((await stream.result()).stopReason).toBe('aborted');
      expect(provider).not.toHaveBeenCalled();
    }
  );

  it('requests system storage before inference', async () => {
    const gateway = makeGateway();
    await gateway.prepare('chat', {
      messages: [{ role: 'user', content: 'Mario Rossi', timestamp: 1 }],
    });
    expect(requestSystemStorageAccess).toHaveBeenCalled();
    expect(existsSync(`${root}/anonymization/matching.sqlite`)).toBe(true);
    expect(vi.mocked(requestSystemStorageAccess).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(gateway.service.start).mock.invocationCallOrder[0]
    );
  });

  it('relaunches the app only after explicit storage-recovery authorization', async () => {
    const gateway = makeGateway();
    mkdirSync(`${root}/anonymization`, { recursive: true });
    writeFileSync(`${root}/anonymization/mapping-key.enc`, 'existing encrypted key');
    vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
    const event = new Promise<AnonymizationEvent>((resolve) =>
      gateway.on('event', (value) => {
        if (value.type === 'decision') resolve(value);
      })
    );
    const prepared = gateway
      .prepare('chat', { messages: [{ role: 'user', content: 'Ciao', timestamp: 1 }] })
      .catch(() => undefined);
    const decision = await event;
    if (decision.type !== 'decision') throw new Error('Missing decision');
    expect(decision.decision.restartApp).toBe(true);
    expect(restartAppForSystemStorage).not.toHaveBeenCalled();
    await gateway.decide(decision.decision.id, 'restart');
    expect(requestSystemStorageAccess).toHaveBeenCalledTimes(2);
    expect(restartAppForSystemStorage).toHaveBeenCalledTimes(1);
    expect(await prepared).toBeUndefined();
  });

  it('does not relaunch after cancellation while waiting for native authorization', async () => {
    const gateway = makeGateway();
    vi.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
    let finish!: () => void;
    vi.mocked(requestSystemStorageAccess)
      .mockResolvedValueOnce()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
    const event = new Promise<AnonymizationEvent>((resolve) =>
      gateway.on('event', (value) => {
        if (value.type === 'decision') resolve(value);
      })
    );
    const controller = new AbortController();
    const prepared = gateway
      .prepare('chat', { messages: [] }, controller.signal)
      .catch(() => undefined);
    const decision = await event;
    if (decision.type !== 'decision') throw new Error('Missing decision');
    const recovery = gateway.decide(decision.decision.id, 'restart');
    expect(gateway.decisions()[0].state).toBe('restarting');
    controller.abort();
    expect(vi.mocked(requestSystemStorageAccess).mock.calls[1][0]?.aborted).toBe(true);
    finish();
    await recovery;
    expect(restartAppForSystemStorage).not.toHaveBeenCalled();
    expect(await prepared).toBeUndefined();
  });

  it.each(['text', 'resource', 'json'] as const)(
    'protects Archiveye top-k %s results while preserving readable documents and citations locally',
    async (format) => {
      const gateway = makeGateway();
      vi.mocked(gateway.service.analyze).mockImplementation(async (text) => ({
        complex: false,
        entities: [...text.matchAll(/Mario Rossi|mario@example\.com/g)].map((match) => ({
          label: match[0].includes('@') ? 'EMAIL' : 'FULLNAME',
          start: match.index!,
          end: match.index! + match[0].length,
          score: 1,
        })),
      }));
      const documents = [
        { id: 'doc-1', title: 'Contratto Mario Rossi', text: 'Mario Rossi: mario@example.com' },
        { id: 'doc-2', title: 'Rinnovo', text: 'Rinnovo del contratto di Mario Rossi' },
      ];
      const topK = {
        results: documents.map((document, index) => ({
          documentId: document.id,
          title: document.title,
          chunk: document.text,
          rank: index + 1,
          page: 1,
        })),
      };
      const text = JSON.stringify(topK);
      const result =
        format === 'text'
          ? { content: [{ type: 'text', text }] }
          : format === 'resource'
            ? {
                content: [
                  {
                    type: 'resource',
                    resource: {
                      uri: 'archiveye://documents/top-k',
                      mimeType: 'application/json',
                      text,
                    },
                  },
                ],
              }
            : topK;
      const snapshot = structuredClone({ documents, result });
      const normalized = normalizeMcpToolResultForModel(result);
      const context: Context = {
        messages: [
          { role: 'user', content: 'Cerca il contratto di Mario Rossi', timestamp: 1 },
          {
            ...message(''),
            content: [
              {
                type: 'toolCall',
                id: 'search-1',
                name: 'mcp__archiveye__search',
                arguments: { query: 'Mario Rossi' },
              },
            ],
          },
          {
            role: 'toolResult',
            toolCallId: 'search-1',
            toolName: 'mcp__archiveye__search',
            content: [{ type: 'text', text: normalized.text }],
            isError: false,
            timestamp: 2,
          },
        ],
      };
      const transcript = structuredClone(context);
      const original: StreamFn = (_model, outgoing) => {
        const serialized = JSON.stringify(outgoing);
        expect(serialized).not.toContain('Mario Rossi');
        expect(serialized).not.toContain('mario@example.com');
        const retrieval = outgoing.messages.find((item) => item.role === 'toolResult')!;
        const chunks = JSON.stringify(retrieval.content);
        expect(chunks).toContain('doc-1');
        expect(chunks).toContain('doc-2');
        const nameToken = chunks.match(/\[AIDEN_[a-f0-9]+_FULLNAME_\d+\]/)![0];
        expect(serialized.split(nameToken).length).toBeGreaterThan(3);
        const upstream = createAssistantMessageEventStream();
        upstream.push({
          type: 'done',
          reason: 'stop',
          message: message(`Contratto di ${nameToken} [doc-1, pagina 1]`),
        });
        return upstream;
      };
      const response = await (
        await gateway.stream('archiveye-chat', original)(model, context)
      ).result();
      expect(response.content).toEqual([
        { type: 'text', text: 'Contratto di Mario Rossi [doc-1, pagina 1]' },
      ]);
      expect(context).toEqual(transcript);
      expect({ documents, result }).toEqual(snapshot);
      expect(normalizeToolExecutionResultForUi(result).content).toContain('Mario Rossi');
      expect(normalizeToolExecutionResultForUi(result).content).toContain('mario@example.com');
    }
  );

  it('protects data inserted by final payload hooks and restores the new references', async () => {
    const gateway = makeGateway();
    let sent: Record<string, unknown> = {};
    const original: StreamFn = async (_model, context, options) => {
      const payload = {
        model: 'test',
        messages: context.messages,
        metadata: { owner: 'empty' },
        function: { name: 'lookup', arguments: '{}' },
      };
      sent = (await options!.onPayload!(payload, model)) as Record<string, unknown>;
      const owner = (sent.metadata as { owner: string }).owner;
      const argumentsJson = (sent.function as { arguments: string }).arguments;
      expect(owner).not.toBe('Mario Rossi');
      expect(JSON.parse(argumentsJson).name).toBe(owner);
      const upstream = createAssistantMessageEventStream();
      upstream.push({ type: 'done', reason: 'stop', message: message(owner) });
      return upstream;
    };
    const stream = await gateway.stream('chat', original)(
      model,
      { messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] },
      {
        onPayload: (payload) => ({
          ...(payload as object),
          metadata: { owner: 'Mario Rossi' },
          function: { name: 'lookup', arguments: JSON.stringify({ name: 'Mario Rossi' }) },
        }),
      }
    );
    expect((await stream.result()).content).toEqual([{ type: 'text', text: 'Mario Rossi' }]);
    expect(JSON.stringify(sent)).not.toContain('Mario Rossi');
  });

  it('preserves safe signed reasoning internally without exposing masked text to the UI', async () => {
    const gateway = makeGateway();
    const prepared = await gateway.prepare('chat', {
      messages: [{ role: 'user', content: 'Mario Rossi', timestamp: 1 }],
    });
    const token = prepared.context.messages[0].content as string;
    const raw = message('ok');
    raw.content = [
      { type: 'thinking', thinking: `Considering ${token}`, thinkingSignature: 'signature' },
    ];
    const restored = gateway.restoreMessage(raw, prepared.mapping, true, 'chat');
    expect(restored.content).toEqual([{ type: 'thinking', thinking: 'Considering Mario Rossi' }]);
    const next = await gateway.prepare('chat', { messages: [restored] });
    expect(next.context.messages[0].content).toEqual(raw.content);
  });
  it('protects context and tool values without mutating the local transcript', async () => {
    const gateway = makeGateway();
    const context = {
      systemPrompt: 'Assist Mario Rossi',
      messages: [{ role: 'user' as const, content: '😀 Mario Rossi', timestamp: 1 }],
      tools: [
        {
          name: 'lookup',
          description: 'Lookup Mario Rossi',
          parameters: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Mario Rossi' } },
          },
        },
      ],
    };
    const first = await gateway.prepare('chat-one', context);
    expect(JSON.stringify(first.context)).not.toContain('Mario Rossi');
    expect(first.context.tools?.[0].name).toBe('lookup');
    expect(context.messages[0].content).toBe('😀 Mario Rossi');
    const second = await gateway.prepare('chat-one', context);
    expect(second.context).toEqual(first.context);
    const other = await gateway.prepare('chat-two', context);
    expect(other.context).not.toEqual(first.context);
  });
  it('restores split streaming tokens and tool arguments before consumption', async () => {
    const gateway = makeGateway();
    const original: StreamFn = (_model, context) => {
      const token = context.messages[0].content as string;
      expect(token).not.toBe('Mario Rossi');
      const upstream = createAssistantMessageEventStream();
      for (let i = 1; i <= token.length; i++)
        upstream.push({
          type: 'text_delta',
          contentIndex: 0,
          delta: token[i - 1],
          partial: message(token.slice(0, i)),
        });
      const complete = message(token);
      complete.content.push({
        type: 'toolCall',
        id: 'call-1',
        name: 'lookup',
        arguments: { name: token },
      });
      upstream.push({ type: 'done', reason: 'stop', message: complete });
      return upstream;
    };
    const stream = await gateway.stream('chat', original)(model, {
      messages: [{ role: 'user', content: 'Mario Rossi', timestamp: 1 }],
    });
    const events = [];
    for await (const event of stream) events.push(event);
    expect(
      events
        .filter((e) => e.type === 'text_delta')
        .map((e) => e.delta)
        .join('')
    ).toBe('Mario Rossi');
    expect((await stream.result()).content).toEqual([
      { type: 'text', text: 'Mario Rossi' },
      { type: 'toolCall', id: 'call-1', name: 'lookup', arguments: { name: 'Mario Rossi' } },
    ]);
    expect(JSON.stringify(events)).not.toContain('[AIDEN_');
  });
  it('requires a decision for personal data used as JSON keys and restores response keys', async () => {
    const gateway = makeGateway();
    const decisions: AnonymizationEvent[] = [];
    gateway.on('event', (event) => {
      if (event.type === 'decision') {
        decisions.push(event);
        void gateway.decide(event.decision.id, 'proceed');
      }
    });
    const original = message('ok');
    original.content = [
      { type: 'toolCall', id: 'call', name: 'lookup', arguments: { 'Mario Rossi': 'customer' } },
    ];
    const prepared = await gateway.prepare('chat', { messages: [original] });
    expect(decisions).toHaveLength(1);
    expect(prepared.context.messages[0].content).toEqual(original.content);
    const value = await gateway.prepare('chat', {
      messages: [{ role: 'user', content: 'Mario Rossi', timestamp: 1 }],
    });
    const token = value.context.messages[0].content as string;
    const response = message('ok');
    response.content = [
      { type: 'toolCall', id: 'call', name: 'lookup', arguments: { [token]: 'customer' } },
    ];
    const restored = gateway.restoreMessage(response, value.mapping);
    expect(restored.content).toEqual(original.content);
  });

  it('does not call the provider until a service-failure decision arrives', async () => {
    const gateway = makeGateway();
    vi.spyOn(gateway.service, 'start').mockRejectedValue(new Error('offline'));
    const provider = vi.fn(() => {
      const stream = createAssistantMessageEventStream();
      stream.push({ type: 'done', reason: 'stop', message: message('ok') });
      return stream;
    });
    let notify!: (event: AnonymizationEvent) => void;
    const decision = new Promise<AnonymizationEvent>((resolve) => {
      notify = resolve;
    });
    gateway.on('event', (event) => {
      if (event.type === 'decision') notify(event);
    });
    const stream = await gateway.stream('chat', provider)(model, {
      messages: [{ role: 'user', content: 'Mario Rossi', timestamp: 1 }],
    });
    const event = await decision;
    expect(provider).not.toHaveBeenCalled();
    if (event.type !== 'decision') throw new Error('Expected decision');
    expect(event.decision.actions).toEqual(['proceed', 'cancel', 'restart']);
    await gateway.decide(event.decision.id, 'cancel');
    expect((await stream.result()).stopReason).toBe('aborted');
    expect(provider).not.toHaveBeenCalled();
  });
  it('scopes a complex-case approval to unchanged content in the same run', async () => {
    const gateway = makeGateway();
    const events: AnonymizationEvent[] = [];
    gateway.on('event', (event) => {
      events.push(event);
      if (event.type === 'decision') void gateway.decide(event.decision.id, 'exclude');
    });
    await withAnonymization('chat', true, async () => {
      expect(await gateway.complex('chat', 'image', undefined, 'same-image')).toBe('exclude');
      expect(await gateway.complex('chat', 'image', undefined, 'same-image')).toBe('exclude');
      expect(await gateway.complex('chat', 'image', undefined, 'different-image')).toBe('exclude');
    });
    await withAnonymization('chat', true, () =>
      gateway.complex('chat', 'image', undefined, 'same-image')
    );
    expect(events.filter((event) => event.type === 'decision')).toHaveLength(3);
  });
  it('keeps restart loading until ready and ignores late completion after cancellation', async () => {
    const gateway = makeGateway();
    vi.spyOn(gateway.service, 'start').mockRejectedValue(new Error('offline'));
    let ready!: () => void;
    vi.spyOn(gateway.service, 'restart').mockImplementation(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        })
    );
    const events: AnonymizationEvent[] = [];
    const pending = new Promise<AnonymizationEvent>((resolve) =>
      gateway.on('event', (event) => {
        events.push(event);
        if (event.type === 'decision' && event.decision.state === 'waiting') resolve(event);
      })
    );
    const controller = new AbortController();
    const result = gateway
      .prepare('chat', { messages: [] }, controller.signal)
      .catch((error) => error);
    const event = await pending;
    if (event.type !== 'decision') throw new Error('Expected decision');
    const restarting = gateway.decide(event.decision.id, 'restart');
    expect(gateway.decisions()[0].state).toBe('restarting');
    await vi.waitFor(() => expect(ready).toBeTypeOf('function'));
    controller.abort();
    ready();
    await restarting;
    expect(gateway.decisions()).toHaveLength(0);
    expect(await result).toBeInstanceOf(Error);
    expect(events.filter((e) => e.type === 'resolved')).toHaveLength(1);
  });
});
