export { DEFAULT_SESSION_TITLE, getDefaultTitleFromPrompt } from '../../shared/session-title';
import { DEFAULT_SESSION_TITLE, getDefaultTitleFromPrompt } from '../../shared/session-title';

export type TitleDecisionInput = {
  userMessageCount: number;
  currentTitle: string;
  prompt: string;
  hasAttempted: boolean;
};

const MIN_TITLE_PROMPT_CHARS = 4;

export function isPromptAmbiguousForTitleGeneration(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < MIN_TITLE_PROMPT_CHARS) {
    return true;
  }
  // Very short ASCII-only prompts are too ambiguous for reliable language detection.
  if (trimmed.length <= 2 && /^[\x00-\x7F]+$/.test(trimmed)) {
    return true;
  }
  return false;
}

function countScriptLetters(text: string): { latin: number; cjk: number; total: number } {
  const letters = text.match(/\p{L}/gu) ?? [];
  let latin = 0;
  let cjk = 0;
  for (const letter of letters) {
    if (/[\u0041-\u024F\u1E00-\u1EFF]/.test(letter)) {
      latin++;
    } else if (/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(letter)) {
      cjk++;
    }
  }
  return { latin, cjk, total: letters.length };
}

export function isGeneratedTitleCompatibleWithPrompt(
  prompt: string,
  generatedTitle: string
): boolean {
  const promptStats = countScriptLetters(prompt);
  const titleStats = countScriptLetters(generatedTitle);
  if (promptStats.total === 0 || titleStats.total === 0) {
    return true;
  }
  const promptMostlyLatin = promptStats.latin / promptStats.total >= 0.8;
  const titleMostlyCjk = titleStats.cjk / titleStats.total >= 0.5;
  if (promptMostlyLatin && titleMostlyCjk && prompt.trim().length < 20) {
    return false;
  }
  return true;
}

export function shouldGenerateTitle(input: TitleDecisionInput): boolean {
  if (input.hasAttempted) return false;
  if (input.userMessageCount !== 1) return false;
  if (isPromptAmbiguousForTitleGeneration(input.prompt)) return false;
  const defaultTitle = getDefaultTitleFromPrompt(input.prompt);
  return input.currentTitle === defaultTitle || input.currentTitle === DEFAULT_SESSION_TITLE;
}

export function normalizeGeneratedTitle(value: string | null | undefined): string | null {
  if (!value) return null;
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  const normalized = firstLine.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!normalized) return null;
  if (
    normalized.toLowerCase() === '(no content)' ||
    normalized.toLowerCase() === '(empty content)'
  ) {
    return null;
  }
  return normalized.slice(0, 120);
}

export function buildTitlePrompt(prompt: string): string {
  return [
    'Generate a short title for the following user request. Rules:',
    '- Max 15 characters (CJK) or 6 words (Latin scripts)',
    '- Reply in the same language as the user request',
    '- If the request language is unclear, keep the title in English and reuse the request text',
    '- No quotes, numbering, or trailing punctuation',
    '',
    `User request: ${prompt.trim()}`,
  ].join('\n');
}
