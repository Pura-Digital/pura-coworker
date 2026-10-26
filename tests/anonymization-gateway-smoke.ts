/** Real SDK + native worker + encrypted matching; the provider is local and never uses the network. */
import { app, powerSaveBlocker } from 'electron';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Type } from 'typebox';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from '@mariozechner/pi-coding-agent';
import {
  createAssistantMessageEventStream,
  getModel,
  type AssistantMessage,
} from '@mariozechner/pi-ai';
import type { StreamFn } from '@mariozechner/pi-agent-core';
import { AnonymizationGateway, withAnonymization } from '../src/main/anonymization/gateway';
import { resolveMessageEndPayload } from '../src/main/claude/agent-runner-message-end';
import manifest from '../src/main/anonymization/model-manifest.json';

let gateway: AnonymizationGateway | undefined;
let session: AgentSession | undefined;
let temporary: string | undefined;
let blocker: number | undefined;
const fetchOriginal = globalThis.fetch;

async function run() {
  await app.whenReady();
  blocker = powerSaveBlocker.start('prevent-app-suspension');
  app.dock?.hide();
  globalThis.fetch = async () => {
    throw new Error('Network forbidden in local gateway smoke');
  };
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'aiden-gateway-native-'));
  app.setPath('userData', temporary);
  gateway = new AnonymizationGateway();
  await fs.mkdir(gateway.service.modelDirectory, { recursive: true });
  const cache = path.resolve(
    process.env.AIDEN_PII_SMOKE_MODEL_PATH || '.cache/anonymization-model'
  );
  for (const file of manifest.files) {
    await fs.link(
      path.join(cache, file.name),
      path.join(gateway.service.modelDirectory, file.name)
    );
  }
  await fs.writeFile(
    path.join(gateway.service.modelDirectory, 'verified.json'),
    JSON.stringify({ revision: manifest.revision })
  );
  let cancellationExpected = false;
  let unexpectedDecisions = 0;
  gateway.on('event', (event) => {
    if (event.type === 'decision') {
      // Standard SDK prompts include machine/date metadata that can be ambiguous.
      // In this synthetic fixture, simulate the human choosing Exclude. Never
      // authorize a clear-text bypass, and fail any service-failure decision.
      if (!cancellationExpected && event.decision.kind === 'service') {
        unexpectedDecisions++;
        console.log('Unexpected service decision:', event.decision.reason);
      }
      void gateway!.decide(
        event.decision.id,
        !cancellationExpected && event.decision.kind === 'complex' ? 'exclude' : 'cancel'
      );
    }
  });
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey('openai', 'local-test-no-network');
  const loader = new DefaultResourceLoader({
    cwd: temporary,
    agentDir: temporary,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noContextFiles: true,
    noPromptTemplates: true,
    systemPrompt: 'You are a helpful assistant.',
  });
  await loader.reload();
  const executions: string[] = [];
  ({ session } = await createAgentSession({
    cwd: temporary,
    model: getModel('openai', 'gpt-4o-mini'),
    authStorage,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({
      retry: { enabled: false },
      compaction: { enabled: false },
    }),
    resourceLoader: loader,
    tools: ['Lookup'],
    customTools: [
      {
        name: 'Lookup',
        label: 'Local lookup',
        description: 'Look up a contact.',
        parameters: Type.Object({ name: Type.String() }),
        async execute(_id, args) {
          executions.push(args.name);
          return {
            content: [{ type: 'text' as const, text: `Confirmed: ${args.name}` }],
            details: { localTrace: 'local-only-metadata' },
          };
        },
      },
    ],
  }));
  assert.equal(session.agent.state.tools.length, 1);
  assert.equal(typeof session.agent.state.tools[0].execute, 'function');
  let calls = 0;
  let token = '';
  const provider: StreamFn = (model, context) => {
    calls++;
    const wire = JSON.stringify(context);
    assert(!wire.includes('local-only-metadata'));
    assert(!wire.includes('Mario Rossi') && !wire.includes('mario.rossi@example.com'));
    assert(context.tools?.every((tool) => !('execute' in tool)));
    const found = wire.match(/\[AIDEN_[a-f0-9]+_FULLNAME_\d+\]/)?.[0];
    token = found || token;
    const message: AssistantMessage = {
      role: 'assistant',
      api: model.api,
      provider: model.provider,
      model: model.id,
      timestamp: Date.now(),
      stopReason: calls === 2 ? 'toolUse' : 'stop',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      content:
        calls === 2
          ? [{ type: 'toolCall', id: 'lookup-1', name: 'Lookup', arguments: { name: token } }]
          : [{ type: 'text', text: calls === 1 ? 'Ciao!' : `Contatto ${token} confermato.` }],
    };
    if (calls === 2) assert(token);
    const stream = createAssistantMessageEventStream();
    stream.push({ type: 'start', partial: message });
    stream.push({ type: 'done', reason: message.stopReason as 'stop' | 'toolUse', message });
    return stream;
  };
  const messages: AssistantMessage[] = [];
  session.subscribe((event) => {
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      assert(!JSON.stringify(event.message).includes('[AIDEN_'));
      messages.push(event.message);
    }
  });
  const prompt = async (text: string) =>
    withAnonymization('smoke-chat', true, async () => {
      session!.agent.streamFn = gateway!.stream('smoke-chat', provider);
      await session!.prompt(text);
    });
  await prompt('Ciao');
  assert.equal(calls, 1);
  assert.equal(messages.at(-1)?.content[0]?.type, 'text');
  await prompt('Mi chiamo Mario Rossi e la mia email è mario.rossi@example.com.');
  assert.equal(calls, 3);
  assert.deepEqual(executions, ['Mario Rossi']);
  assert(JSON.stringify(messages.at(-1)).includes('Mario Rossi'));
  assert.equal(unexpectedDecisions, 0);
  await gateway.service.restart();
  await prompt('Ciao');
  assert.equal(calls, 4);
  assert.equal(unexpectedDecisions, 0);
  console.log(
    'PASS: SDK greetings, native masking, local tool execution, response restoration, zero network'
  );
  cancellationExpected = true;
  const beforeCancel = calls;
  const cancelledStream = await withAnonymization('smoke-chat', true, () =>
    gateway!.stream('smoke-chat', provider)(getModel('openai', 'gpt-4o-mini'), {
      messages: [
        {
          role: 'user',
          timestamp: 1,
          content: [{ type: 'image', data: 'AA==', mimeType: 'image/png' }],
        },
      ],
    })
  );
  const cancelled = await cancelledStream.result();
  assert.equal(cancelled.stopReason, 'aborted');
  assert.equal(calls, beforeCancel);
  assert.equal(
    resolveMessageEndPayload({ message: cancelled, streamedText: '' }).errorText,
    undefined
  );
  console.log(
    'PASS: human cancellation sends nothing and does not become an empty provider success'
  );
}

run()
  .then(() => finish(0))
  .catch((error) => {
    console.error(
      'Native gateway smoke failed:',
      error instanceof Error ? error.message : 'unknown failure'
    );
    return finish(1);
  });
async function finish(code: number) {
  session?.dispose();
  gateway?.dispose();
  globalThis.fetch = fetchOriginal;
  if (blocker !== undefined) powerSaveBlocker.stop(blocker);
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  app.exit(code);
}
