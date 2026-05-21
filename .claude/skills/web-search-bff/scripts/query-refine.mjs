#!/usr/bin/env node
/**
 * LLM-centric query planning for BFF external search (no heuristics, no network).
 *
 * --template   Print a canonical example QueryImprovementPlan (JSON) for the model to imitate.
 * --validate   Read one JSON object from stdin (or --file path); validate shape; echo pretty JSON or exit 1.
 *
 * The agent fills QueryImprovementPlan (see REFERENCE.md); this script does not rewrite user strings.
 */

import * as fs from 'node:fs';

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function templatePlan() {
  return {
    version: 1,
    userIntentSummary: '<one sentence: what the user is trying to learn or decide>',
    searchStrategy:
      '<how you will use search + crawl: e.g. official docs first, then broader SERP>',
    primarySearchQuery: '<first string passed to BFF search body.query>',
    fallbackSearchQueries: [
      '<optional alternate query 1>',
      '<optional alternate query 2>',
    ],
    scopedSuggestions: [
      {
        label: 'Official docs (example)',
        query: 'zod discriminated union site:zod.dev',
        rationale: 'Narrow to vendor docs when the topic is library-specific.',
      },
      {
        label: 'Neutral overview (example)',
        query: 'graphql federation site:wikipedia.org',
        rationale: 'Use site: when you explicitly want an encyclopedia-style summary.',
      },
    ],
    clarification: {
      needed: false,
      preferUserRoundBeforeSearch: false,
      questionsForUser: [],
      workingAssumptions: ['<only if needed=false or you accept proceeding silently>'],
    },
    bffLanguageHint: 'en',
    bffTimeRangeHint: 'month',
  };
}

function isNonEmptyString(x) {
  return typeof x === 'string' && x.trim().length > 0;
}

function validatePlan(raw) {
  const errors = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Root must be a JSON object'] };
  }

  if (raw.version !== 1) {
    errors.push('version must be the number 1');
  }
  if (!isNonEmptyString(raw.userIntentSummary)) {
    errors.push('userIntentSummary must be a non-empty string');
  }
  if (!isNonEmptyString(raw.searchStrategy)) {
    errors.push('searchStrategy must be a non-empty string');
  }
  if (!isNonEmptyString(raw.primarySearchQuery)) {
    errors.push('primarySearchQuery must be a non-empty string (this becomes BFF search body.query)');
  }

  const maxQ = 600;
  if (String(raw.primarySearchQuery).length > maxQ) {
    errors.push(`primarySearchQuery exceeds ${maxQ} characters`);
  }

  if (raw.fallbackSearchQueries !== undefined) {
    if (!Array.isArray(raw.fallbackSearchQueries)) {
      errors.push('fallbackSearchQueries must be an array of strings when present');
    } else if (raw.fallbackSearchQueries.length > 3) {
      errors.push('fallbackSearchQueries must have at most 3 entries');
    } else {
      raw.fallbackSearchQueries.forEach((q, i) => {
        if (!isNonEmptyString(q)) errors.push(`fallbackSearchQueries[${i}] must be a non-empty string`);
        else if (String(q).length > maxQ) {
          errors.push(`fallbackSearchQueries[${i}] exceeds ${maxQ} characters`);
        }
      });
    }
  }

  if (raw.scopedSuggestions !== undefined) {
    if (!Array.isArray(raw.scopedSuggestions)) {
      errors.push('scopedSuggestions must be an array when present');
    } else if (raw.scopedSuggestions.length > 8) {
      errors.push('scopedSuggestions must have at most 8 entries');
    } else {
      raw.scopedSuggestions.forEach((s, i) => {
        if (!s || typeof s !== 'object' || Array.isArray(s)) {
          errors.push(`scopedSuggestions[${i}] must be an object`);
          return;
        }
        if (!isNonEmptyString(s.label)) errors.push(`scopedSuggestions[${i}].label required`);
        if (!isNonEmptyString(s.query)) errors.push(`scopedSuggestions[${i}].query required`);
        if (!isNonEmptyString(s.rationale)) errors.push(`scopedSuggestions[${i}].rationale required`);
        if (String(s.query).length > maxQ) {
          errors.push(`scopedSuggestions[${i}].query exceeds ${maxQ} characters`);
        }
      });
    }
  }

  if (raw.clarification !== undefined) {
    const c = raw.clarification;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      errors.push('clarification must be an object when present');
    } else {
      if (typeof c.needed !== 'boolean') {
        errors.push('clarification.needed must be a boolean');
      }
      if (c.preferUserRoundBeforeSearch !== undefined && typeof c.preferUserRoundBeforeSearch !== 'boolean') {
        errors.push('clarification.preferUserRoundBeforeSearch must be boolean when set');
      }
      if (c.questionsForUser !== undefined) {
        if (!Array.isArray(c.questionsForUser)) {
          errors.push('clarification.questionsForUser must be an array of strings');
        } else if (c.questionsForUser.length > 5) {
          errors.push('clarification.questionsForUser must have at most 5 items');
        } else {
          c.questionsForUser.forEach((q, i) => {
            if (!isNonEmptyString(q)) errors.push(`clarification.questionsForUser[${i}] must be a non-empty string`);
          });
        }
      }
      if (c.workingAssumptions !== undefined) {
        if (!Array.isArray(c.workingAssumptions)) {
          errors.push('clarification.workingAssumptions must be an array of strings');
        } else {
          c.workingAssumptions.forEach((a, i) => {
            if (typeof a !== 'string') errors.push(`clarification.workingAssumptions[${i}] must be a string`);
          });
        }
      }
    }
  }

  if (raw.bffLanguageHint !== undefined && typeof raw.bffLanguageHint !== 'string') {
    errors.push('bffLanguageHint must be a string when set');
  }
  if (raw.bffTimeRangeHint !== undefined) {
    const tr = raw.bffTimeRangeHint;
    if (tr !== 'day' && tr !== 'month' && tr !== 'year') {
      errors.push('bffTimeRangeHint must be "day", "month", or "year" when set');
    }
  }

  return { ok: errors.length === 0, errors };
}

function parseArgs(argv) {
  const flags = { template: false, validate: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--template') flags.template = true;
    else if (a === '--validate') flags.validate = true;
    else if (a === '--file' && argv[i + 1]) {
      flags.file = argv[i + 1];
      i++;
    } else if (a.startsWith('--file=')) flags.file = a.slice('--file='.length);
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.template && flags.validate) {
    process.stderr.write('Use only one of --template or --validate\n');
    process.exit(2);
  }

  if (flags.template) {
    console.log(JSON.stringify(templatePlan(), null, 2));
    return;
  }

  if (flags.validate) {
    let text;
    if (flags.file) {
      text = fs.readFileSync(flags.file, 'utf8');
    } else {
      text = await readStdin();
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      process.stderr.write(`Invalid JSON: ${e.message}\n`);
      process.exit(1);
    }
    const { ok, errors } = validatePlan(data);
    if (!ok) {
      console.log(JSON.stringify({ ok: false, errors }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, plan: data }, null, 2));
    return;
  }

  process.stderr.write(
    'LLM-centric query plan helper (no string rewriting).\n\n' +
      '  node scripts/query-refine.mjs --template\n' +
      '      Print an example QueryImprovementPlan JSON for the model to follow.\n\n' +
      '  node scripts/query-refine.mjs --validate < plan.json\n' +
      '      cat plan.json | node scripts/query-refine.mjs --validate\n' +
      '      Validate a JSON plan produced by the agent; stdout { ok, plan } or { ok, errors }.\n\n' +
      'Schema: see REFERENCE.md → "Query improvement plan (LLM-produced)".\n'
  );
  process.exit(2);
}

main().catch((err) => {
  process.stderr.write(String(err?.message || err) + '\n');
  process.exit(1);
});
