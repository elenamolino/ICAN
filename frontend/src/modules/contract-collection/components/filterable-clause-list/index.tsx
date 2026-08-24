import { useMemo, useState } from 'react';
import { ClauseAnalysis } from '../../../analysis/api/analysisApi';
import { CATEGORY_LABELS, CATEGORY_KEYS, topCategories } from '../../../analysis/constants/clauseCategories';

type ViewMode = 'all' | 'unfair';
type SortMode = 'default' | 'high-to-low';

const SELECT_CLASS =
  'w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none';

function pillClass(active: boolean) {
  return `cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active ? 'bg-tp-primary text-tp-on-primary' : 'border border-tp-hairline text-tp-slate hover:bg-tp-canvas'
  }`;
}

function scoreFor(clause: ClauseAnalysis, category: string) {
  if (category === 'all') {
    return Math.max(...CATEGORY_KEYS.map((k) => clause[k] as number));
  }
  return clause[category as keyof ClauseAnalysis] as number;
}

function ClauseCard({ clause, threshold }: { clause: ClauseAnalysis; threshold: number }) {
  const relevantCategories = topCategories(clause, threshold);

  return (
    <div className="rounded-lg border border-tp-hairline bg-tp-canvas p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 text-sm text-tp-ink">{clause.term}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            clause.isUnfair
              ? 'border border-tp-severity-error-border bg-tp-severity-error-bg text-tp-severity-error'
              : 'border border-tp-severity-success-border bg-tp-severity-success-bg text-tp-severity-success'
          }`}
        >
          {clause.isUnfair ? 'Potentially unfair' : 'Fair'}
        </span>
      </div>
      {relevantCategories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {relevantCategories.map(({ key, label, score }) => (
            <span key={key} className="rounded-full bg-tp-surface px-2 py-0.5 text-xs text-tp-slate" title={label}>
              {label} · {Math.round(score * 100)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterableClauseList({ clauses }: { clauses: ClauseAnalysis[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [category, setCategory] = useState<string>('all');
  const [thresholdPct, setThresholdPct] = useState(30);

  const threshold = thresholdPct / 100;

  const filtered = useMemo(() => {
    let list = clauses;
    if (viewMode === 'unfair') list = list.filter((c) => c.isUnfair);
    if (category !== 'all') {
      list = list.filter((c) => scoreFor(c, category) >= threshold);
    }
    if (sortMode === 'high-to-low') {
      list = [...list].sort((a, b) => scoreFor(b, category) - scoreFor(a, category));
    }
    return list;
  }, [clauses, viewMode, category, threshold, sortMode]);

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-lg border border-tp-hairline-soft bg-tp-canvas p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-tp-steel">Filters</h2>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setViewMode('all')} className={pillClass(viewMode === 'all')}>
            View all
          </button>
          <button type="button" onClick={() => setViewMode('unfair')} className={pillClass(viewMode === 'unfair')}>
            Unfair terms
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-tp-steel">Sort</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className={SELECT_CLASS}
            >
              <option value="default">Default order</option>
              <option value="high-to-low">High to low</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-tp-steel">Unfairness type</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT_CLASS}>
              <option value="all">All categories</option>
              {CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-tp-steel">Threshold: {thresholdPct}</label>
            <input
              type="range"
              min={0}
              max={100}
              value={thresholdPct}
              onChange={(e) => setThresholdPct(Number(e.target.value))}
              className="mt-2.5 w-full accent-tp-primary"
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-tp-steel">
        {filtered.length} of {clauses.length} clauses
      </p>

      <div className="space-y-3">
        {filtered.map((clause, index) => (
          <ClauseCard key={index} clause={clause} threshold={threshold} />
        ))}
        {filtered.length === 0 && <p className="text-sm text-tp-steel">No clauses match the current filters.</p>}
      </div>
    </div>
  );
}
