export type ProblemKind = 'unfair' | 'placeholder' | 'field' | 'missing' | 'mentioned';

export interface Problem {
  id: string;
  kind: ProblemKind;
  text: string;
  line?: number;
  /** For problems outside the text, such as an empty field: what clicking it does. */
  onSelect?: () => void;
}

// Unfair clauses and anything that blocks saving are errors; the rest are advice.
const BADGE: Record<ProblemKind, { label: string; className: string }> = {
  unfair: { label: 'Unfair', className: 'bg-tp-severity-error-bg text-tp-severity-error' },
  placeholder: { label: 'Fill in', className: 'bg-tp-severity-error-bg text-tp-severity-error' },
  field: { label: 'Required', className: 'bg-tp-severity-error-bg text-tp-severity-error' },
  missing: { label: 'Missing', className: 'bg-tp-severity-warning-bg text-tp-severity-warning' },
  mentioned: { label: 'No section', className: 'bg-tp-severity-warning-bg text-tp-severity-warning' },
};

export default function ProblemsPanel({ problems, note, onReveal }: {
  problems: Problem[];
  /** One line about the analysis: not run yet, outdated... */
  note?: string;
  onReveal: (line: number) => void;
}) {
  return (
    <div className="border-t border-tp-hairline bg-tp-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-tp-steel">
        Problems
        <span
          className={`rounded-full px-2 py-0.5 normal-case tracking-normal ${
            problems.length ? 'bg-tp-severity-warning-bg text-tp-severity-warning' : 'bg-tp-severity-success-bg text-tp-severity-success'
          }`}
        >
          {problems.length ? `${problems.length} to review` : 'No issues'}
        </span>
        {note && <span className="ml-auto font-normal normal-case tracking-normal text-tp-steel">{note}</span>}
      </div>
      {problems.length > 0 && (
        <ul className="max-h-44 space-y-1 overflow-y-auto px-4 pb-3 text-sm">
          {problems.map((problem) => {
            const badge = BADGE[problem.kind];
            const body = (
              <>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                <span className="min-w-0 text-tp-ink">
                  {problem.line && <span className="font-mono text-xs text-tp-steel">L{problem.line} </span>}
                  {problem.text}
                </span>
              </>
            );
            return (
              <li key={problem.id}>
                {problem.line || problem.onSelect ? (
                  <button
                    type="button"
                    onClick={() => (problem.onSelect ? problem.onSelect() : onReveal(problem.line!))}
                    className="flex w-full cursor-pointer items-baseline gap-2 rounded text-left hover:text-tp-primary"
                  >
                    {body}
                  </button>
                ) : (
                  <span className="flex items-baseline gap-2">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
