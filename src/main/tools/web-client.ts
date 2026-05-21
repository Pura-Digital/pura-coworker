/**
 * Shared HTTP clients for native agent web tools (DuckDuckGo + BFF external web-tools).
 */

import { resolveBffWebEnv, type ResolvedBffWebEnv } from './bff-web-env';

const OUTPUT_CHAR_LIMIT = 20_000;

function truncateOutput(text: string): string {
  if (text.length <= OUTPUT_CHAR_LIMIT) {
    return text;
  }
  return `${text.slice(0, OUTPUT_CHAR_LIMIT)}\n\n[Truncated ${text.length - OUTPUT_CHAR_LIMIT} chars]`;
}

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const message = parsed.message ?? parsed.error ?? parsed.statusMessage;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    return text.slice(0, 500);
  } catch {
    return text.slice(0, 500) || res.statusText;
  }
}

function joinBffPath(base: string, relativePath: string): string {
  const normalized = base.replace(/\/+$/, '');
  const rel = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${normalized}/${rel}`;
}

export async function fetchWebPage(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'aiden' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw new Error('Request timed out. Check your network connection and try again.');
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'unknown';
  const body = await response.text();
  const truncated =
    body.length > OUTPUT_CHAR_LIMIT
      ? `${body.slice(0, OUTPUT_CHAR_LIMIT)}\n\n[Truncated ${body.length - OUTPUT_CHAR_LIMIT} chars]`
      : body;

  return `URL: ${parsed.toString()}\nStatus: ${response.status}\nContent-Type: ${contentType}\n\n${truncated}`;
}

export async function searchWebInstantAnswer(query: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Query is required');
  }

  const searchUrl = new URL('https://api.duckduckgo.com/');
  searchUrl.searchParams.set('q', trimmed);
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('no_redirect', '1');
  searchUrl.searchParams.set('no_html', '1');
  searchUrl.searchParams.set('skip_disambig', '1');

  let response: Response;
  try {
    response = await fetch(searchUrl.toString(), {
      headers: { 'User-Agent': 'aiden' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw new Error('Request timed out. Check your network connection and try again.');
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const heading = typeof data.Heading === 'string' ? data.Heading : '';
  const abstractText = typeof data.AbstractText === 'string' ? data.AbstractText : '';
  const relatedTopics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];

  type TopicItem = { text: string; url?: string };
  const results: TopicItem[] = [];

  const collectTopics = (topic: unknown): void => {
    if (!topic || typeof topic !== 'object') return;
    const record = topic as Record<string, unknown>;
    const text = typeof record.Text === 'string' ? record.Text : '';
    const firstUrl = typeof record.FirstURL === 'string' ? record.FirstURL : '';
    if (text) {
      results.push({ text, url: firstUrl || undefined });
    }
    const nested = Array.isArray(record.Topics) ? record.Topics : [];
    for (const nestedItem of nested) {
      collectTopics(nestedItem);
    }
  };

  for (const topic of relatedTopics) {
    collectTopics(topic);
  }

  const lines: string[] = [];
  lines.push(`Query: ${trimmed}`);
  lines.push('Source: DuckDuckGo Instant Answer');
  if (heading) lines.push(`Heading: ${heading}`);
  if (abstractText) lines.push(`Abstract: ${abstractText}`);

  const topResults = results.slice(0, 5);
  if (topResults.length > 0) {
    lines.push('Results:');
    for (const item of topResults) {
      lines.push(`- ${item.text}${item.url ? ` (${item.url})` : ''}`);
    }
  } else if (!abstractText) {
    lines.push('Results: No related topics found.');
  }

  return truncateOutput(lines.join('\n'));
}

export interface BffWebSearchParams {
  query: string;
  categories?: string;
  engines?: string;
  language?: string;
  pageno?: number;
  time_range?: 'day' | 'month' | 'year';
  safesearch?: 0 | 1 | 2;
}

export interface BffWebSearchResultItem {
  title: string;
  url: string;
  content?: string;
  engine?: string;
  publishedDate?: string;
}

export interface BffWebSearchResponse {
  query: string;
  number_of_results?: number;
  results: BffWebSearchResultItem[];
}

export interface BffWebCrawlPage {
  url: string;
  ok: boolean;
  markdown: string;
  error?: string;
}

export interface BffWebCrawlResponse {
  pages: BffWebCrawlPage[];
}

function requireBffEnv(resolved?: ResolvedBffWebEnv): ResolvedBffWebEnv {
  const env = resolved ?? resolveBffWebEnv();
  if (!env.configured || !env.bffBaseUrl || !env.webServicesKey) {
    throw new Error(
      'BFF web-tools are not configured. Set BFF_BASE_URL and WEB_SERVICES_KEY in .env or Aiden config.'
    );
  }
  return env;
}

export async function bffWebSearch(
  params: BffWebSearchParams,
  resolved?: ResolvedBffWebEnv
): Promise<string> {
  const env = requireBffEnv(resolved);
  const query = params.query.trim();
  if (!query) {
    throw new Error('Query is required');
  }

  const url = joinBffPath(env.bffBaseUrl!, 'api/v1/external/web-tools/search');
  const body: Record<string, unknown> = { query };
  if (params.categories) body.categories = params.categories;
  if (params.engines) body.engines = params.engines;
  if (params.language) body.language = params.language;
  if (params.pageno != null && params.pageno >= 1) body.pageno = params.pageno;
  if (params.time_range) body.time_range = params.time_range;
  if (params.safesearch === 0 || params.safesearch === 1 || params.safesearch === 2) {
    body.safesearch = params.safesearch;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.webServicesKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(70_000),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw new Error('BFF search timed out after 70s.');
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    if (response.status === 401) {
      throw new Error(`BFF search unauthorized: invalid WEB_SERVICES_KEY. ${detail}`);
    }
    if (response.status === 503) {
      throw new Error(`BFF search unavailable (SearXNG upstream): ${detail}`);
    }
    throw new Error(`BFF search failed with HTTP ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as BffWebSearchResponse;
  const lines: string[] = [];
  lines.push(`Query: ${data.query || query}`);
  lines.push(`Source: BFF external web-tools (SearXNG)`);
  if (typeof data.number_of_results === 'number') {
    lines.push(`Estimated results: ${data.number_of_results}`);
  }
  lines.push('Results:');
  for (const item of (data.results ?? []).slice(0, 15)) {
    const snippet = item.content ? ` — ${item.content}` : '';
    lines.push(`- [${item.title}](${item.url})${snippet}`);
  }
  if (!data.results?.length) {
    lines.push('(no results)');
  }
  return truncateOutput(lines.join('\n'));
}

export async function bffWebCrawl(
  urls: string[],
  resolved?: ResolvedBffWebEnv
): Promise<string> {
  const env = requireBffEnv(resolved);
  const normalized = urls.map((u) => u.trim()).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error('At least one HTTPS URL is required');
  }
  if (normalized.length > 5) {
    throw new Error('Maximum 5 URLs per crawl request');
  }
  for (const u of normalized) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      throw new Error(`Invalid URL: ${u}`);
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(`Only HTTPS URLs are supported for crawl: ${u}`);
    }
  }

  const endpoint = joinBffPath(env.bffBaseUrl!, 'api/v1/external/web-tools/crawl');
  const body = normalized.length === 1 ? { url: normalized[0] } : { urls: normalized };
  const timeoutMs = Math.min(120_000 * normalized.length + 15_000, 600_000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.webServicesKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw new Error(`BFF crawl timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    if (response.status === 401) {
      throw new Error(`BFF crawl unauthorized: invalid WEB_SERVICES_KEY. ${detail}`);
    }
    if (response.status === 503) {
      throw new Error(`BFF crawl unavailable (Crawl4AI upstream): ${detail}`);
    }
    throw new Error(`BFF crawl failed with HTTP ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as BffWebCrawlResponse;
  const lines: string[] = ['Source: BFF external web-tools (Crawl4AI markdown)', ''];
  for (const page of data.pages ?? []) {
    lines.push(`## ${page.url}`);
    if (!page.ok) {
      lines.push(`Error: ${page.error || 'crawl failed'}`);
      lines.push('');
      continue;
    }
    const md =
      page.markdown.length > 8_000
        ? `${page.markdown.slice(0, 8_000)}\n\n[Truncated page markdown]`
        : page.markdown;
    lines.push(md);
    lines.push('');
  }
  return truncateOutput(lines.join('\n'));
}

export function formatBffConfiguredHint(configured: boolean): string {
  if (configured) {
    return 'BFF web-tools: configured (use BffWebSearch / BffWebCrawl for SERP and markdown crawl).';
  }
  return 'BFF web-tools: not configured — use WebSearch/WebFetch only, or set BFF_BASE_URL and WEB_SERVICES_KEY.';
}
