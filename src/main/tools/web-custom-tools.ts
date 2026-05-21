/**
 * Native web tools for pi-coding-agent (DuckDuckGo + BFF external web-tools).
 */

import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { TSchema } from '@sinclair/typebox';
import { resolveBffWebEnv, type ResolvedBffWebEnv } from './bff-web-env';
import { bffWebCrawl, bffWebSearch, fetchWebPage, searchWebInstantAnswer } from './web-client';

function toolTextResult(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

function toolErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function buildWebCustomTools(resolved?: ResolvedBffWebEnv): ToolDefinition<TSchema, unknown>[] {
  const bffEnv = resolved ?? resolveBffWebEnv();
  const tools: ToolDefinition<TSchema, unknown>[] = [
    {
      name: 'WebSearch',
      label: 'Web search (quick)',
      description:
        'Fast web orientation via DuckDuckGo Instant Answer (definitions, related topics). For full SERP with titles/URLs/snippets, use BffWebSearch when BFF is configured.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search query' }),
      }),
      async execute(_toolCallId, params) {
        try {
          const text = await searchWebInstantAnswer(String(params.query ?? ''));
          return toolTextResult(text);
        } catch (error) {
          return toolTextResult(`WebSearch failed: ${toolErrorText(error)}`);
        }
      },
    },
    {
      name: 'WebFetch',
      label: 'Web fetch',
      description:
        'Fetch a single http/https URL and return truncated body text. For multi-page markdown extraction behind the BFF, use BffWebCrawl when configured.',
      parameters: Type.Object({
        url: Type.String({ description: 'http or https URL' }),
      }),
      async execute(_toolCallId, params) {
        try {
          const text = await fetchWebPage(String(params.url ?? ''));
          return toolTextResult(text);
        } catch (error) {
          return toolTextResult(`WebFetch failed: ${toolErrorText(error)}`);
        }
      },
    },
  ];

  if (bffEnv.configured) {
    tools.push(
      {
        name: 'BffWebSearch',
        label: 'BFF web search (SERP)',
        description:
          'Normalized web search via the configured BFF external web-tools API (SearXNG). Returns title, URL, and snippet for each result. Prefer this over raw curl/bash for research tasks.',
        parameters: Type.Object({
          query: Type.String({ description: 'Search query' }),
          language: Type.Optional(Type.String({ description: 'Language hint, e.g. it or en' })),
          time_range: Type.Optional(
            Type.Union([Type.Literal('day'), Type.Literal('month'), Type.Literal('year')])
          ),
          safesearch: Type.Optional(
            Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)])
          ),
        }),
        async execute(_toolCallId, params) {
          try {
            const text = await bffWebSearch(
              {
                query: String(params.query ?? ''),
                language: typeof params.language === 'string' ? params.language : undefined,
                time_range:
                  params.time_range === 'day' ||
                  params.time_range === 'month' ||
                  params.time_range === 'year'
                    ? params.time_range
                    : undefined,
                safesearch:
                  params.safesearch === 0 ||
                  params.safesearch === 1 ||
                  params.safesearch === 2
                    ? params.safesearch
                    : undefined,
              },
              bffEnv
            );
            return toolTextResult(text);
          } catch (error) {
            return toolTextResult(`BffWebSearch failed: ${toolErrorText(error)}`);
          }
        },
      },
      {
        name: 'BffWebCrawl',
        label: 'BFF web crawl (markdown)',
        description:
          'Fetch full-page markdown for up to 5 HTTPS URLs via the configured BFF external web-tools API (Crawl4AI). Use after BffWebSearch to read chosen sources.',
        parameters: Type.Object({
          urls: Type.Array(Type.String(), {
            description: 'HTTPS URLs to crawl (max 5)',
            maxItems: 5,
            minItems: 1,
          }),
        }),
        async execute(_toolCallId, params) {
          try {
            const urls = Array.isArray(params.urls) ? params.urls.map((u) => String(u)) : [];
            const text = await bffWebCrawl(urls, bffEnv);
            return toolTextResult(text);
          } catch (error) {
            return toolTextResult(`BffWebCrawl failed: ${toolErrorText(error)}`);
          }
        },
      }
    );
  }

  return tools;
}
