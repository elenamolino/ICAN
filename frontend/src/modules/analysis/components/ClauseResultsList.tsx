import { AnalyzeResponse, ClauseAnalysis } from '../api/analysisApi';

const CATEGORY_LABELS: Record<string, string> = {
  ltd: 'Limitation of liability',
  ter: 'Unilateral termination',
  ch: 'Unilateral change',
  cr: 'Content removal',
  use: 'Contract by using',
  law: 'Choice of law',
  j: 'Jurisdiction',
  a: 'Arbitration',
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[];
const RELEVANCE_THRESHOLD = 0.3;

function topCategories(clause: ClauseAnalysis) {
  return CATEGORY_KEYS.map((key) => ({ key, label: CATEGORY_LABELS[key], score: clause[key] as number }))
    .filter((entry) => entry.score >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-tp-hairline-soft bg-tp-canvas px-4 py-3 text-center">
      <p className="text-xl font-bold text-tp-ink">{value}</p>
      <p className="text-xs text-tp-steel">{label}</p>
    </div>
  );
}

function ClauseCard({ clause }: { clause: ClauseAnalysis }) {
  const relevantCategories = topCategories(clause);

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
            <span
              key={key}
              className="rounded-full bg-tp-surface px-2 py-0.5 text-xs text-tp-slate"
              title={label}
            >
              {label} · {Math.round(score * 100)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClauseResultsList({ result }: { result: AnalyzeResponse }) {
  const { summary, clauses } = result;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Clauses" value={summary.totalClauses} />
        <SummaryStat label="Potentially unfair" value={summary.unfairClauses} />
        <SummaryStat label="Words" value={summary.totalWords} />
        <SummaryStat label="Sections" value={summary.sectionCount ? summary.sectionCount : 'N/A'} />
      </div>

      <div className="space-y-3">
        {clauses.map((clause, index) => (
          <ClauseCard key={index} clause={clause} />
        ))}
      </div>
    </div>
  );
}
