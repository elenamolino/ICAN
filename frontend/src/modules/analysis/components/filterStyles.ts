// Shared by the AI Classify and Ontology clause lists so both filter cards look the same.
export const SELECT_CLASS =
  'w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none';

export function pillClass(active: boolean) {
  return `cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active ? 'bg-tp-primary text-tp-on-primary' : 'border border-tp-hairline text-tp-slate hover:bg-tp-canvas'
  }`;
}

export const CHIP_CLASS = 'rounded-full bg-tp-surface px-2 py-0.5 text-xs text-tp-slate';
