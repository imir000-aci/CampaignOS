// Local fuzzy matcher. Scores a page field's question against a KB entry's question
// using a blend of token Jaccard, character-trigram overlap, and Levenshtein ratio.

import type { FieldType } from './types';
import { tokenize } from './normalize';

/** Field types that can substitute for one another during matching. */
function typeCompatible(a: FieldType, b: FieldType): boolean {
  if (a === b) return true;
  const textLike: FieldType[] = ['text', 'email', 'url', 'tel', 'number', 'textarea'];
  const choiceLike: FieldType[] = ['select', 'radio'];
  const inSet = (set: FieldType[]) => set.includes(a) && set.includes(b);
  return inSet(textLike) || inSet(choiceLike);
}

function jaccard(aTokens: string[], bTokens: string[]): number {
  if (aTokens.length === 0 && bTokens.length === 0) return 1;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

function trigramOverlap(a: string, b: string): number {
  if (!a && !b) return 1;
  const ga = trigrams(a);
  const gb = trigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

function levenshteinRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Similarity in [0, 1] between two normalized questions. An exact string match
 * returns 1 so callers can treat it as an "exact" source.
 */
export function questionSimilarity(aNorm: string, bNorm: string): number {
  if (aNorm === bNorm) return 1;
  const tokenScore = jaccard(tokenize(aNorm), tokenize(bNorm));
  const triScore = trigramOverlap(aNorm, bNorm);
  const levScore = levenshteinRatio(aNorm, bNorm);
  return 0.5 * tokenScore + 0.3 * triScore + 0.2 * levScore;
}

export interface ScoredCandidate {
  entryId: string;
  score: number;
  exact: boolean;
}

/**
 * Score a field's question against all KB entries of a compatible type.
 * Returns candidates sorted by score, best first.
 */
export function scoreCandidates(
  fieldNorm: string,
  fieldType: FieldType,
  entries: { id: string; questionNorm: string; fieldType: FieldType }[],
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = [];
  for (const e of entries) {
    if (!typeCompatible(fieldType, e.fieldType)) continue;
    const score = questionSimilarity(fieldNorm, e.questionNorm);
    scored.push({ entryId: e.id, score, exact: score === 1 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
