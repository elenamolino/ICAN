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

// The ontology names the same eight categories differently (UNFAIR_TERM_TYPES in tos-to-odrl),
// listed here in the same order and with the same labels as above.
export const ONTOLOGY_CATEGORY_LABELS: Record<string, string> = {
  limitation_of_liability: CATEGORY_LABELS.ltd,
  termination: CATEGORY_LABELS.ter,
  change: CATEGORY_LABELS.ch,
  content_removal: CATEGORY_LABELS.cr,
  contract_by_use: CATEGORY_LABELS.use,
  choice_of_law: CATEGORY_LABELS.law,
  jurisdiction: CATEGORY_LABELS.j,
  arbitration: CATEGORY_LABELS.a,
};

export function ontologyCategoryLabel(category: string) {
  return ONTOLOGY_CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

export const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];
export const RELEVANCE_THRESHOLD = 0.3;

export function topCategories(clause: ClauseAnalysis, threshold: number = RELEVANCE_THRESHOLD) {
  return CATEGORY_KEYS.map((key) => ({ key, label: CATEGORY_LABELS[key], score: clause[key] as number }))
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
