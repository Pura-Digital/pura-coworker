/**
 * Native web tools for pi-coding-agent (DuckDuckGo + BFF external web-tools).
 */

import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { TSchema } from '@sinclair/typebox';
import { resolveBffWebEnv, type ResolvedBffWebEnv } from './bff-web-env';
import { bffWebCrawl, bffWebSearch, fetchWebPage, searchWebInstantAnswer } from './web-client';

function toolTextResult(text: string): {
  content: Array<{ type: 'text'; text: string }>;
  details: unknown;
} {
  return { content: [{ type: 'text' as const, text }], details: undefined as unknown };
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
          const { query } = params as { query?: string };
          const text = await searchWebInstantAnswer(String(query ?? ''));
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
          const { url } = params as { url?: string };
          const text = await fetchWebPage(String(url ?? ''));
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
            const p = params as {
              query?: string;
              language?: string;
              time_range?: 'day' | 'month' | 'year';
              safesearch?: 0 | 1 | 2;
            };
            const text = await bffWebSearch(
              {
                query: String(p.query ?? ''),
                language: typeof p.language === 'string' ? p.language : undefined,
                time_range:
                  p.time_range === 'day' ||
                  p.time_range === 'month' ||
                  p.time_range === 'year'
                    ? p.time_range
                    : undefined,
                safesearch:
                  p.safesearch === 0 || p.safesearch === 1 || p.safesearch === 2
                    ? p.safesearch
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
            const { urls: rawUrls } = params as { urls?: unknown };
            const urls = Array.isArray(rawUrls) ? rawUrls.map((u: unknown) => String(u)) : [];
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
