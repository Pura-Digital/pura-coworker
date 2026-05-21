#!/usr/bin/env node
/**
 * CLI: POST /api/v1/external/web-tools/search
 * Env: BFF_BASE_URL, WEB_SERVICES_KEY (no secrets in this file)
 */

function normalizeBase(url) {
  return String(url ?? '')
    .trim()
    .replace(/\/+$/, '');
}

function joinBffPath(base, relativePath) {
  const b = normalizeBase(base);
  const rel = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${b}/${rel}`;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    process.stderr.write(`${name} is not set\n`);
    process.exit(2);
  }
  return String(v).trim();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        const key = a.slice(2, eq);
        out[key] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          out[key] = next;
          i++;
        } else {
          out[key] = true;
        }
      }
    }
  }
  return out;
}

async function readErrorMessage(res) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j.message || j.error || j.statusMessage || text.slice(0, 500);
  } catch {
    return text.slice(0, 500) || res.statusText;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = (args.query || '').trim();
  if (!query) {
    process.stderr.write(
      'Usage: node bff-web-search.mjs --query "<text>" [--categories S] [--engines S] [--language it] [--pageno 1] [--time-range day|month|year] [--safesearch 0|1|2]\n'
    );
    process.exit(2);
  }

  const base = requireEnv('BFF_BASE_URL');
  const token = requireEnv('WEB_SERVICES_KEY');
  const url = joinBffPath(base, 'api/v1/external/web-tools/search');

  const body = { query };
  if (args.categories) body.categories = String(args.categories);
  if (args.engines) body.engines = String(args.engines);
  if (args.language) body.language = String(args.language);
  if (args.pageno != null && args.pageno !== true) {
    const n = parseInt(String(args.pageno), 10);
    if (Number.isFinite(n) && n >= 1) body.pageno = n;
  }
  if (args['time-range']) body.time_range = String(args['time-range']);
  if (args.safesearch != null && args.safesearch !== true) {
    const s = parseInt(String(args.safesearch), 10);
    if (s === 0 || s === 1 || s === 2) body.safesearch = s;
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 70_000);

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      clearTimeout(t);
      if (res.status === 401) {
        const msg = await readErrorMessage(res);
        console.log(
          JSON.stringify(
            {
              ok: false,
              status: 401,
              message: 'Unauthorized: invalid or missing WEB_SERVICES_KEY (Bearer).',
              detail: msg,
            },
            null,
            2
          )
        );
        process.exit(1);
      }
      if (res.status === 503) {
        const msg = await readErrorMessage(res);
        console.log(
          JSON.stringify(
            {
              ok: false,
              status: 503,
              message: 'Service unavailable: SearXNG upstream or BFF proxy error.',
              detail: msg,
            },
            null,
            2
          )
        );
        process.exit(1);
      }
      if (res.status === 400) {
        const msg = await readErrorMessage(res);
        console.log(
          JSON.stringify(
            { ok: false, status: 400, message: 'Bad request: invalid search body.', detail: msg },
            null,
            2
          )
        );
        process.exit(1);
      }
      if (!res.ok) {
        const msg = await readErrorMessage(res);
        console.log(
          JSON.stringify(
            {
              ok: false,
              status: res.status,
              message: `Unexpected HTTP ${res.status}.`,
              detail: msg,
            },
            null,
            2
          )
        );
        process.exit(1);
      }
      const data = await res.json();
      console.log(JSON.stringify({ ok: true, data }, null, 2));
    })
    .catch((err) => {
      clearTimeout(t);
      const aborted = err?.name === 'AbortError';
      console.log(
        JSON.stringify(
          {
            ok: false,
            status: 0,
            message: aborted
              ? 'Request aborted after 70s timeout.'
              : `Request failed: ${err?.message || String(err)}`,
          },
          null,
          2
        )
      );
      process.exit(1);
    });
}

main();
