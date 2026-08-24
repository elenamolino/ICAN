import { ClauseAnalysis } from '../api/analysisApi';

export const CATEGORY_LABELS: Record<string, string> = {
  ltd: 'Limitation of liability',
  ter: 'Unilateral termination',
  ch: 'Unilateral change',
  cr: 'Content removal',
  use: 'Contract by using',
  law: 'Choice of law',
  j: 'Jurisdiction',
  a: 'Arbitration',
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];
export const RELEVANCE_THRESHOLD = 0.3;

export function topCategories(clause: ClauseAnalysis, threshold: number = RELEVANCE_THRESHOLD) {
  return CATEGORY_KEYS.map((key) => ({ key, label: CATEGORY_LABELS[key], score: clause[key] as number }))
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
