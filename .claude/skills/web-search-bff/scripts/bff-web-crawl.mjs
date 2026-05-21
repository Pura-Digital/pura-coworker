#!/usr/bin/env node
/**
 * CLI: POST /api/v1/external/web-tools/crawl
 * Env: BFF_BASE_URL, WEB_SERVICES_KEY
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

function isHttpsUrl(s) {
  try {
    const u = new URL(String(s).trim());
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromUrlsArg = args.urls
    ? String(args.urls)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  const fromUrlArg = args.url && String(args.url).trim() ? [String(args.url).trim()] : [];
  /** BFF prefers `urls` when non-empty; mirror that in the CLI */
  let urls = fromUrlsArg.length > 0 ? fromUrlsArg : fromUrlArg;
  urls = [...new Set(urls)].slice(0, 5);

  if (urls.length === 0) {
    process.stderr.write(
      'Usage: node bff-web-crawl.mjs --url "https://..." | --urls "https://a,https://b" (max 5 HTTPS URLs)\n'
    );
    process.exit(2);
  }

  for (const u of urls) {
    if (!isHttpsUrl(u)) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            status: 0,
            message: `Invalid URL (HTTPS only): ${u}`,
          },
          null,
          2
        )
      );
      process.exit(2);
    }
  }

  const base = requireEnv('BFF_BASE_URL');
  const token = requireEnv('WEB_SERVICES_KEY');
  const endpoint = joinBffPath(base, 'api/v1/external/web-tools/crawl');

  const body =
    urls.length === 1 ? { url: urls[0] } : { urls: urls.slice(0, 5) };

  const perUrlMs = 120_000;
  const timeoutMs = Math.min(perUrlMs * urls.length + 15_000, 600_000);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  fetch(endpoint, {
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
              message: 'Service unavailable: Crawl4AI upstream or BFF proxy error.',
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
            {
              ok: false,
              status: 400,
              message:
                'Bad request: provide either url or a non-empty urls array (HTTPS, max 5).',
              detail: msg,
            },
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
              ? `Request aborted after ${timeoutMs}ms timeout (${urls.length} URL(s)).`
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
