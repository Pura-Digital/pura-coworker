---
name: web-search-bff
description: Web search skill for research tasks. Use native tools WebSearch/WebFetch for quick checks, then BffWebSearch/BffWebCrawl (when BFF_BASE_URL and WEB_SERVICES_KEY are configured) for SERP and markdown crawl. Read this skill for query-improvement workflow; prefer native BffWeb* tools over raw curl/bash.
---

# Web search (BFF) — normalized search & markdown crawl

## Overview

This skill covers **web search** and **page-to-markdown** workflows through **your BFF** (`api/v1` layout), using **only** the **external** integration routes (service key). The BFF orchestrates **SearXNG** (search) and **Crawl4AI** `/md` (crawl). **Do not** call SearXNG or Crawl4AI directly, and **do not** use legacy logged-in frontend routes:

| Do not use (legacy / JWT FE)      | Use instead (external web tools)         |
| --------------------------------- | ---------------------------------------- |
| `POST /api/v1/web/search`         | `POST /api/v1/external/web-tools/search` |
| `POST /api/v1/web/crawl/markdown` | `POST /api/v1/external/web-tools/crawl`  |

Global API prefix on the BFF: `api/v1`. Full URLs:

- `{BFF_BASE_URL}/api/v1/external/web-tools/search`
- `{BFF_BASE_URL}/api/v1/external/web-tools/crawl`

`BFF_BASE_URL` must have **no trailing slash** (e.g. `https://bff.example.com`).

## Authentication (required)

Every request:

- `Content-Type: application/json`
- `Authorization: Bearer <WEB_SERVICES_KEY>`

`WEB_SERVICES_KEY` is the value configured on the BFF for external web services. **Never** hardcode it in the repository; read from the environment in scripts or export it in the shell before `curl`.

### Environment variables (client / agent host)

| Variable           | Required | Purpose                                  |
| ------------------ | -------- | ---------------------------------------- |
| `BFF_BASE_URL`     | Yes      | BFF origin, no trailing slash            |
| `WEB_SERVICES_KEY` | Yes      | Bearer token for `/external/web-tools/*` |

When the Aiden app loads `.env` from the project root (or you export these in the shell that starts Electron), **`BFF_BASE_URL` and `WEB_SERVICES_KEY` are forwarded into agent `bash` / `executeCommand` subprocesses** if set (`tool-executor` whitelist). You can still prefix a one-off command with `VAR=value` if needed.

## Native web tools (Aiden agent)

Aiden registers these **native agent tools** (no bash/curl required):

| Native tool     | Role                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **WebSearch**   | DuckDuckGo Instant Answer — fast orientation, definitions, related topics (not a full SERP).      |
| **WebFetch**    | Fetch a single `http`/`https` URL and return truncated body text.                                 |
| **BffWebSearch**| Full SERP via BFF `/external/web-tools/search` (SearXNG). **Only when BFF is configured.**      |
| **BffWebCrawl** | Markdown crawl for up to 5 HTTPS URLs via BFF `/external/web-tools/crawl`. **When configured.**   |

**Recommended flow**

1. Use **WebSearch** (and **WebFetch** on specific URLs) for disambiguation or when the BFF is not configured.
2. When BFF is configured, use **BffWebSearch** for normalized SERP results, then **BffWebCrawl** on chosen URLs.
3. Use the bash CLIs in `scripts/` only when debugging or scripting outside the agent — **prefer BffWebSearch/BffWebCrawl in chat**.

Legacy note: `ToolExecutor` bash also forwards `BFF_BASE_URL` / `WEB_SERVICES_KEY` for skill scripts when run via bash.

## Named procedures (“tools”)

These names describe **workflows**, not built-in MCP/agent tool IDs. Implement them with **`curl`** or the Node CLIs in `scripts/`:

1. **`bff_external_web_search`** — normalized web search.
2. **`bff_external_web_crawl`** — synchronous multi-URL markdown extraction.

### When to use search vs crawl (checklist)

| Step                                                                | Use                                                |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| You need titles, URLs, snippets, or to discover sources             | **search**                                         |
| You already have specific HTTPS URLs and need page text as markdown | **crawl**                                          |
| User asks for “what’s current on the web”                           | **search** first, then **crawl** a few chosen URLs |
| You only need the SERP, not full page content                       | **search** only                                    |

### Query improvement (LLM-centric, before search)

Do **not** rely on hidden string mangling. The agent **authors** a structured **`QueryImprovementPlan`** (see [REFERENCE.md](REFERENCE.md) → _Query improvement plan_): intent summary, strategy, `primarySearchQuery`, optional `fallbackSearchQueries`, and optional **`scopedSuggestions`** where **you** decide full query strings—including `site:`, `filetype:`, quotes, bilingual variants, etc.

1. **Think in objects**, not ad-hoc trimming: write the plan as JSON (fields the model controls end-to-end).
2. If ambiguity is high, set `clarification.needed: true` and use the product’s normal **user clarification / ask** tool when `preferUserRoundBeforeSearch` is appropriate—then fill the plan with grounded `workingAssumptions` if you proceed.
3. Map **`primarySearchQuery`** (and optional `bffLanguageHint` / `bffTimeRangeHint`) into **`bff_external_web_search`** / `bff-web-search.mjs`. Use **`scopedSuggestions[].query`** when you deliberately want a constrained SERP (still a single `query` string to the BFF).
4. Optionally validate structure: **`node scripts/query-refine.mjs --validate < my-plan.json`** (structural checks only; no query rewriting). Example skeleton: **`node scripts/query-refine.mjs --template`**.
5. If results are weak, try **at most one** `fallbackSearchQueries[]` entry (avoid many near-duplicate searches).
6. Prefer official docs, encyclopedias, and primary sources when choosing URLs to crawl.

### Agent behaviour (quality)

- For time-sensitive or verifiable web information: **search** with a focused query first.
- From results, pick **n** plausible HTTPS URLs (official sites, docs, Wikipedia). Avoid PDF/ZIP unless necessary.
- Call **crawl** with `{ "urls": [ ... ] }` when you have multiple sources (preferred over a single `url`). **Max 5 URLs** per request.
- Do **not** fire many nearly identical searches; do **not** crawl dozens of URLs in one turn.
- In the final answer: **cite URLs actually crawled**; do not invent figures or tables not present in returned markdown.
- If a crawl page has `"ok": false`, surface the `error`, pick another URL from the SERP, and avoid infinite retry loops.

### Layered use with native WebSearch

- **Default / no BFF**: rely on **WebSearch** + **WebFetch** from the tool executor.
- **BFF configured**: use **WebSearch** for cheap clarification, then **BFF search** for SERP-shaped data and **BFF crawl** for full-page markdown. Do not duplicate the same query across WebSearch and BFF without reason.

### Global / short agent timeouts

- **Search**: allow **60–70 s** (BFF ↔ SearXNG can be slow).
- **Crawl**: allow **≥ 120 s per URL** in sequence; total wait scales with count. If the agent runtime has a **low global timeout**, crawl **≤ 3 URLs** per turn or skip crawl and rely on search snippets only.

---

## Endpoint 1 — `bff_external_web_search`

**`POST {BFF_BASE_URL}/api/v1/external/web-tools/search`**

### Request JSON

| Field        | Required | Notes                                                              |
| ------------ | -------- | ------------------------------------------------------------------ |
| `query`      | Yes      | Non-empty string                                                   |
| `categories` | No       | Comma-separated (SearXNG)                                          |
| `engines`    | No       | Comma-separated                                                    |
| `language`   | No       | e.g. `it`, `en`                                                    |
| `pageno`     | No       | Integer ≥ 1                                                        |
| `time_range` | No       | `day` \| `month` \| `year`                                         |
| `safesearch` | No       | `0` \| `1` \| `2` — if omitted, BFF default is **1** for this path |

Server applies `language` from the body when present.

### Response `200` (stable shape)

```json
{
  "query": "<string>",
  "number_of_results": 123,
  "results": [
    {
      "title": "…",
      "url": "https://…",
      "content": "optional snippet",
      "engine": "optional",
      "publishedDate": "optional"
    }
  ]
}
```

Each item always has `title` and `url`. Entries without `url` are excluded upstream.

### Typical errors

| Status | Meaning                                               |
| ------ | ----------------------------------------------------- |
| `401`  | Invalid Bearer / wrong key / expired JWT if misrouted |
| `503`  | SearXNG unreachable or upstream error                 |

### CLI

```bash
export BFF_BASE_URL="https://bff.example.com"
export WEB_SERVICES_KEY="your-key"
node scripts/bff-web-search.mjs --query "NestJS validation pipe"
```

Optional flags: `--categories`, `--engines`, `--language`, `--pageno`, `--time-range day|month|year`, `--safesearch 0|1|2`

---

## Endpoint 2 — `bff_external_web_crawl`

**`POST {BFF_BASE_URL}/api/v1/external/web-tools/crawl`**

### Request JSON

Provide **at least one** of:

| Field  | Required              | Notes                          |
| ------ | --------------------- | ------------------------------ |
| `url`  | One of `url` / `urls` | Single valid HTTPS URL         |
| `urls` | One of `url` / `urls` | Array of HTTPS URLs, **max 5** |

If both are present: BFF prefers **`urls`** when the array is non-empty; otherwise **`url`**.

If both missing or empty → **`400`** with a message like: provide either `url` or a non-empty `urls` array.

### Response `200`

```json
{
  "pages": [
    { "url": "https://…", "ok": true, "markdown": "…" },
    { "url": "https://…", "ok": false, "markdown": "", "error": "message" }
  ]
}
```

URLs are processed **sequentially**. Plan for long wall-clock time (up to ~**120 s per URL** depending on deploy).

### Typical errors

| Status | Meaning              |
| ------ | -------------------- |
| `400`  | Invalid body         |
| `401`  | Auth failure         |
| `503`  | Crawl4AI unreachable |

### CLI

Single URL:

```bash
node scripts/bff-web-crawl.mjs --url "https://example.com/docs"
```

Multiple (comma-separated, max 5):

```bash
node scripts/bff-web-crawl.mjs --urls "https://a.com,https://b.com"
```

---

## Minimal `curl` examples

**Search**

```bash
curl -sS --max-time 70 -X POST "${BFF_BASE_URL}/api/v1/external/web-tools/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WEB_SERVICES_KEY}" \
  -d '{"query":"open telemetry golang","language":"en"}'
```

**Crawl**

```bash
curl -sS --max-time 400 -X POST "${BFF_BASE_URL}/api/v1/external/web-tools/crawl" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${WEB_SERVICES_KEY}" \
  -d '{"urls":["https://example.com/page"]}'
```

---

## Further reference

See [REFERENCE.md](REFERENCE.md) for TypeScript-shaped request/response types and field notes.
