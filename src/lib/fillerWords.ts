/**
 * Filler-word removal for transcribed speech.
 *
 * This is intentionally simple, regex-based cleanup rather than full NLP —
 * good enough to strip the classic verbal tics ("um", "you know", "like")
 * out of a raw transcript so the cleaned version reads more naturally.
 */

export const DEFAULT_FILLER_WORDS: string[] = [
  // Multi-word phrases first (checked before their single-word substrings).
  'you know',
  'i mean',
  'sort of',
  'kind of',
  'okay so',
  'so yeah',
  // Single-word fillers.
  'um',
  'umm',
  'ummm',
  'uh',
  'uhh',
  'uhhh',
  'erm',
  'er',
  'hmm',
  'hmmm',
  'like',
  'basically',
  'actually',
  'literally',
  'right',
];

export interface FillerRemovalOptions {
  /** Override the default filler word/phrase list. */
  words?: string[];
}

/**
 * Strips filler words/phrases out of `text` and tidies up the leftover
 * whitespace and punctuation so the result reads as a normal sentence.
 */
export function removeFillerWords(text: string, options: FillerRemovalOptions = {}): string {
  if (!text) return text;

  const words = options.words ?? DEFAULT_FILLER_WORDS;
  // Longest phrases first so "you know" is removed before "know" style
  // single-word matches could ever apply to part of it.
  const sorted = [...words].sort((a, b) => b.length - a.length);

  let result = text;
  for (const phrase of sorted) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Whole-word match, optionally swallowing a trailing comma
    // ("um," / "like,") so the punctuation doesn't linger behind.
    const pattern = new RegExp(`\\b${escaped}\\b,?`, 'gi');
    result = result.replace(pattern, ' ');
  }

  return tidy(result);
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ') // collapse repeated whitespace
    .replace(/\s+([.,!?])/g, '$1') // no space before punctuation
    .replace(/([.,!?])(?=[^\s.,!?]|$)(?!$)/g, '$1 ') // space after punctuation
    .trim()
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}
