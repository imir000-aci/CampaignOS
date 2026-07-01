// Question-label normalization. Turns a raw label into a canonical form used both as
// the KB key basis and as the input to the fuzzy matcher.

// Common filler words that carry little signal when matching questions.
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'for',
  'your',
  'you',
  'please',
  'enter',
  'select',
  'choose',
  'provide',
  'is',
  'are',
  'and',
  'or',
  'in',
  'on',
  'at',
  'this',
  'that',
  'field',
  'required',
  'optional',
]);

/** camelCase / snake_case / kebab-case → spaced words. */
export function humanizeIdentifier(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

/** Normalize a label to lowercase, punctuation-stripped, whitespace-collapsed text. */
export function normalizeQuestion(raw: string): string {
  return humanizeIdentifier(raw)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenize a normalized question into content words (stopwords removed). */
export function tokenize(normalized: string): string[] {
  const words = normalized.split(' ').filter(Boolean);
  const content = words.filter((w) => !STOPWORDS.has(w));
  // If stripping stopwords leaves nothing, fall back to the raw words so short
  // labels like "to" still match themselves.
  return content.length > 0 ? content : words;
}
