import {
  convertToLlm,
  serializeConversation,
  type ExtensionFactory,
} from '@mariozechner/pi-coding-agent';
import { anonymizationContext, getAnonymizationGateway } from './gateway';

/** SDK compaction calls completeSimple directly, bypassing agent.streamFn. */
export const anonymizationCompactionExtension: ExtensionFactory = (pi) => {
  pi.on('session_before_compact', async (event, context) => {
    const run = anonymizationContext.getStore();
    if (!run?.enabled) return;
    if (!context.model) return { cancel: true };
    const preparation = event.preparation;
    const messages = convertToLlm([
      ...preparation.messagesToSummarize,
      ...preparation.turnPrefixMessages,
    ]);
    const content = [
      preparation.previousSummary || '',
      serializeConversation(messages),
      event.customInstructions || '',
    ].join('\n\n');
    const stream = getAnonymizationGateway().stream(run.chatId);
    const auth = await context.modelRegistry.getApiKeyAndHeaders(context.model);
    if (!auth.ok) throw new Error(auth.error);
    const { apiKey, headers } = auth;
    const result = await (
      await stream(
        context.model,
        {
          systemPrompt:
            'Summarize this conversation for continued work. Preserve decisions, tasks, constraints, tool results, file paths, and unresolved questions. Return only the summary.',
          messages: [{ role: 'user', content, timestamp: Date.now() }],
        },
        {
          apiKey,
          headers,
          signal: event.signal,
          maxTokens: Math.min(preparation.settings.reserveTokens, context.model.maxTokens),
        }
      )
    ).result();
    if (result.stopReason === 'error' || result.stopReason === 'aborted')
      throw new Error(result.errorMessage || 'Protected compaction failed');
    const summary = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    if (!summary.trim()) throw new Error('Protected compaction returned an empty summary');
    return {
      compaction: {
        summary,
        firstKeptEntryId: preparation.firstKeptEntryId,
        tokensBefore: preparation.tokensBefore,
        details: {
          readFiles: [...preparation.fileOps.read],
          modifiedFiles: [...preparation.fileOps.edited, ...preparation.fileOps.written],
        },
      },
    };
  });
  // Aiden does not expose SDK tree navigation. Prevent its default cloud summary if an extension invokes it.
  pi.on('session_before_tree', () =>
    anonymizationContext.getStore()?.enabled ? { cancel: true } : undefined
  );
};
