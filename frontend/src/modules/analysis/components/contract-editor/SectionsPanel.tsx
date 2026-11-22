import { ContractReport, ExpectedSection, SectionReport } from '../../utils/contract-sections';
import Iconify from '../../../core/components/iconify';
import ProblemsPanel, { Problem } from './ProblemsPanel';

// Paragraphs and list items, so "provisions": the clauses the classifier judges are sentences.
const provisionsLabel = (n: number) => `${n} ${n === 1 ? 'provision' : 'provisions'}`;

function StatusDot({ status }: { status: SectionReport['status'] }) {
  if (status === 'present') {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-tp-severity-success-bg text-tp-severity-success">
        <Iconify icon="mdi:check" width={11} />
      </span>
    );
  }
  if (status === 'mentioned') {
    return <span className="flex h-4 w-4 items-center justify-center rounded-full bg-tp-severity-warning-bg text-[10px] font-bold text-tp-severity-warning">~</span>;
  }
  return <span className="h-4 w-4 rounded-full border-[1.5px] border-dashed border-tp-severity-warning" />;
}

function SectionRow({ report, unfair, onReveal, onAdd }: {
  report: SectionReport;
  unfair: number;
  onReveal: (line: number) => void;
  onAdd: (section: ExpectedSection) => void;
}) {
  const { section, status, line, clauses, mentionedIn } = report;
  const content = (
    <>
      <StatusDot status={status} />
      <span className="min-w-0">
        <span className="block truncate text-tp-ink">{section.title}</span>
        {status === 'mentioned' && (
          <span className="block truncate text-xs text-tp-steel">
            Mentioned in {mentionedIn ? `“${mentionedIn}”` : 'the introduction'}, without its own section
          </span>
        )}
        {status === 'missing' && <span className="block truncate text-xs text-tp-steel">{section.covers}</span>}
      </span>
    </>
  );

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-1.5 text-sm">
      {line ? (
        <button
          type="button"
          onClick={() => onReveal(line)}
          title={`Go to line ${line}`}
          className="grid cursor-pointer grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded text-left hover:text-tp-primary"
        >
          {content}
        </button>
      ) : (
        <span className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-2">{content}</span>
      )}
      {status === 'present' && (
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-tp-steel">
          {unfair > 0 && (
            <span className="rounded-full bg-tp-severity-error-bg px-2 py-0.5 font-semibold text-tp-severity-error">{unfair} unfair</span>
          )}
          {provisionsLabel(clauses.length)}
        </span>
      )}
      {status !== 'present' && (
        <button
          type="button"
          onClick={() => onAdd(section)}
          className="cursor-pointer whitespace-nowrap rounded-full border border-tp-severity-warning-border bg-tp-severity-warning-bg px-2 py-0.5 text-xs font-medium text-tp-severity-warning hover:border-tp-severity-warning"
        >
          + Add section
        </button>
      )}
    </li>
  );
}

export default function SectionsPanel({ report, unfairBySection, problems, problemsNote, onReveal, onAdd }: {
  report: ContractReport;
  /** Potentially unfair clauses found in each section, by section id. */
  unfairBySection: Record<string, number>;
  problems: Problem[];
  problemsNote?: string;
  onReveal: (line: number) => void;
  onAdd: (section: ExpectedSection) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2 border-b border-tp-hairline-soft px-4 py-3">
        <h2 className="text-sm font-semibold text-tp-ink">Sections</h2>
        <span className="font-mono text-xs text-tp-steel">
          {report.present} of {report.total} expected
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        <ul>
          {report.sections.map((s) => (
            <SectionRow key={s.section.id} report={s} unfair={unfairBySection[s.section.id] ?? 0} onReveal={onReveal} onAdd={onAdd} />
          ))}
        </ul>

        {report.otherBlocks.length > 0 && (
          <div className="mt-2 border-t border-tp-hairline-soft pt-2">
            <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-tp-steel">Other sections</p>
            <ul>
              {report.otherBlocks.map((block) => (
                <li key={`${block.line}-${block.heading}`} className="px-4 py-1 text-sm">
                  <button
                    type="button"
                    onClick={() => onReveal(block.line)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 text-left text-tp-ink hover:text-tp-primary"
                  >
                    <span className="truncate">{block.heading}</span>
                    <span className="whitespace-nowrap text-xs text-tp-steel">{provisionsLabel(block.clauses.length)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ProblemsPanel problems={problems} note={problemsNote} onReveal={onReveal} />
    </div>
  );
}
