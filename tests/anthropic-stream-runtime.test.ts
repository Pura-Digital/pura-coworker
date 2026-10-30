import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { expect, it } from 'vitest';

it('reads Anthropic streaming responses with the SDK resolved by the Electron bundle', async () => {
  const directory = mkdtempSync(path.join(process.cwd(), '.anthropic-stream-test-'));
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const events = [
      [
        'message_start',
        {
          message: {
            id: 'test',
            type: 'message',
            role: 'assistant',
            model: 'claude-sonnet-5-5',
            content: [],
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
      ],
      ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'OK' } }],
      ['content_block_stop', { index: 0 }],
      ['message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }],
      ['message_stop', {}],
    ];
    response.end(
      events
        .map(
          ([type, data]) =>
            `event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`
        )
        .join('')
    );
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const entry = path.join(directory, 'provider.mjs');
    // Vite bundles pi-ai but externalizes Anthropic, resolving the root SDK at runtime.
    await build({
      stdin: {
        contents:
          "export { streamSimpleAnthropic } from './node_modules/@mariozechner/pi-ai/dist/providers/anthropic.js'",
        resolveDir: process.cwd(),
      },
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'esm',
      outfile: entry,
    });
    const { streamSimpleAnthropic } = await import(pathToFileURL(entry).href);
    const result = await streamSimpleAnthropic(
      {
        id: 'claude-sonnet-5-5',
        name: 'test',
        provider: 'anthropic',
        api: 'anthropic-messages',
        baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        reasoning: false,
        input: ['text'],
        contextWindow: 128000,
        maxTokens: 1024,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      { messages: [{ role: 'user', content: 'OK', timestamp: 1 }] },
      {
        apiKey: 'test-unused',
        signal: AbortSignal.timeout(5000),
        maxRetries: 0,
      }
    ).result();
    expect(result.stopReason, result.errorMessage).toBe('stop');
    expect(result.content).toEqual([expect.objectContaining({ type: 'text', text: 'OK' })]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
