# Web search BFF — external web-tools reference

Types below mirror the BFF contract for integration clients. They are documentation only (copy into your app if needed).

When the Aiden host has `BFF_BASE_URL` and `WEB_SERVICES_KEY` set (e.g. via root `.env`, `userData/.env`, or Aiden config), the agent exposes native tools **BffWebSearch** / **BffWebCrawl** and forwards credentials into bash for `scripts/bff-web-*.mjs`.

## Shared

```typescript
/** BFF TimeRange enum as sent in JSON body */
export type ExternalWebTimeRange = 'day' | 'month' | 'year';

export type ExternalWebSafesearch = 0 | 1 | 2;
```

## POST `/api/v1/external/web-tools/search`

### Request

```typescript
export interface ExternalWebSearchRequest {
  query: string;
  categories?: string;
  engines?: string;
  language?: string;
  pageno?: number;
  time_range?: ExternalWebTimeRange;
  safesearch?: ExternalWebSafesearch;
}
```

### Response

```typescript
export interface ExternalWebSearchResultItem {
  title: string;
  url: string;
  content?: string;
  engine?: string;
  publishedDate?: string;
}

export interface ExternalWebSearchResponse {
  query: string;
  number_of_results: number;
  results: ExternalWebSearchResultItem[];
}
```

### Notes

- `query` must be non-empty.
- If `safesearch` is omitted, the BFF uses default **1** for this external path.
- Prefer client HTTP timeout **60–70 seconds**.

## POST `/api/v1/external/web-tools/crawl`

### Request

Exactly one of the following must be satisfied after normalization:

- non-empty `url` (HTTPS), or
- `urls` array with at least one HTTPS URL (max **5**).

If both `url` and `urls` are set: BFF prefers **`urls`** when `urls.length > 0`, else **`url`**.

```typescript
export interface ExternalWebCrawlRequestByUrl {
  url: string;
  urls?: string[];
}

export interface ExternalWebCrawlRequestByUrls {
  urls: string[];
  url?: string;
}

export type ExternalWebCrawlRequest = ExternalWebCrawlRequestByUrl | ExternalWebCrawlRequestByUrls;
```

### Response

```typescript
export interface ExternalWebCrawlPageOk {
  url: string;
  ok: true;
  markdown: string;
}

export interface ExternalWebCrawlPageErr {
  url: string;
  ok: false;
  markdown: '';
  error: string;
}

export type ExternalWebCrawlPage = ExternalWebCrawlPageOk | ExternalWebCrawlPageErr;

export interface ExternalWebCrawlResponse {
  pages: ExternalWebCrawlPage[];
}
```

- Pages are produced **in order**; total duration grows roughly with URL count (~**120 s per URL** upper bound per HTTP hop to Crawl4AI, deploy-dependent).
- Client timeout suggestion: `120 * urls.length` seconds with a practical cap (e.g. 600s) unless you know your runtime limits.

## Query improvement plan (LLM-produced)

**Design:** query refinement is **model-centric**, not a pipeline of string hacks. The agent first emits a structured **`QueryImprovementPlan`** (JSON). Optional operators such as `site:`, `filetype:`, or quoted phrases live in fields the **LLM fills intentionally**—especially `scopedSuggestions[].query`—not in hidden normalisation code.

Use the host’s normal **user clarification** / **ask** tool when `clarification.needed` and `preferUserRoundBeforeSearch` call for it; this skill does not define a proprietary clarification MCP.

### TypeScript (contract)

```typescript
export interface ScopedSearchSuggestion {
  /** Short name for this variant (shown in traces) */
  label: string;
  /** Full query string for BFF `body.query` — may include site:, filetype:, quotes, etc., authored by the agent */
  query: string;
  /** Why this variant is appropriate */
  rationale: string;
}

export interface QueryClarification {
  needed: boolean;
  /** If true, run a user clarification round before the first BFF search */
  preferUserRoundBeforeSearch?: boolean;
  /** Concrete questions for the user */
  questionsForUser?: string[];
  /** If you proceed without answers, state what you assume */
  workingAssumptions?: string[];
}

/** Document version for forward-compatible validators */
export interface QueryImprovementPlan {
  version: 1;
  userIntentSummary: string;
  searchStrategy: string;
  /** First query sent to POST …/external/web-tools/search */
  primarySearchQuery: string;
  /** Ordered fallbacks (max 3); use only after weak SERP, not as spam */
  fallbackSearchQueries?: string[];
  /** Optional constrained queries (e.g. site:docs.vendor.com) — LLM-authored */
  scopedSuggestions?: ScopedSearchSuggestion[];
  clarification?: QueryClarification;
  /** Maps to BFF search `language` when set */
  bffLanguageHint?: string;
  /** Maps to BFF search `time_range` when set */
  bffTimeRangeHint?: ExternalWebTimeRange;
}
```

### Optional Zod (shape reference only)

Zod is **not** required by this repo or the CLI. If your integration already uses Zod, the same contract can be expressed as:

```typescript
// import { z } from 'zod';

const queryImprovementPlanSchema = z.object({
  version: z.literal(1),
  userIntentSummary: z.string().min(1),
  searchStrategy: z.string().min(1),
  primarySearchQuery: z.string().min(1).max(600),
  fallbackSearchQueries: z.array(z.string().min(1).max(600)).max(3).optional(),
  scopedSuggestions: z
    .array(
      z.object({
        label: z.string().min(1),
        query: z.string().min(1).max(600),
        rationale: z.string().min(1),
      })
    )
    .max(8)
    .optional(),
  clarification: z
    .object({
      needed: z.boolean(),
      preferUserRoundBeforeSearch: z.boolean().optional(),
      questionsForUser: z.array(z.string().min(1)).max(5).optional(),
      workingAssumptions: z.array(z.string()).optional(),
    })
    .optional(),
  bffLanguageHint: z.string().optional(),
  bffTimeRangeHint: z.enum(['day', 'month', 'year']).optional(),
});
```

### CLI helper

- `node scripts/query-refine.mjs --template` — prints an example plan (placeholders).
- `node scripts/query-refine.mjs --validate` — reads JSON from stdin; or `--file plan.json`. Performs **structural** checks only (no semantic rewriting).

## curl snippets

**Search**

```bash
curl -sS --max-time 70 -X POST "${BFF_BASE_URL}/api/v1/external/web-tools/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WEB_SERVICES_KEY}" \
  -d '{"query":"example","language":"it","time_range":"month","safesearch":1}'
```

**Crawl (multi-URL)**

```bash
curl -sS --max-time 400 -X POST "${BFF_BASE_URL}/api/v1/external/web-tools/crawl" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WEB_SERVICES_KEY}" \
  -d '{"urls":["https://example.com/a","https://example.com/b"]}'
```

**Crawl (single `url`)**

```bash
curl -sS --max-time 130 -X POST "${BFF_BASE_URL}/api/v1/external/web-tools/crawl" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WEB_SERVICES_KEY}" \
  -d '{"url":"https://example.com/page"}'
```
