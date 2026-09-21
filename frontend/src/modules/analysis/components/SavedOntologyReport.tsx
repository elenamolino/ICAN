import { useMemo, useState, type ReactNode } from 'react';
import { AggregateStats, ClauseReportItem, JobReport } from '../api/ontologyAnalysisApi';
import Iconify from '../../core/components/iconify';
import SummaryStat from './SummaryStat';
import { ONTOLOGY_CATEGORY_LABELS, ontologyCategoryLabel } from '../constants/clauseCategories';
import { CHIP_CLASS, SELECT_CLASS, pillClass } from './filterStyles';

function unfairCount(clause: ClauseReportItem) {
  return Object.values(clause.unfair_terms ?? {}).reduce((sum, entries) => sum + entries.length, 0);
}

function simColor(v: number | null) {
  if (v === null) return 'text-tp-steel';
  if (v >= 0.85) return 'text-tp-severity-success';
  if (v >= 0.7) return 'text-tp-severity-warning';
  return 'text-tp-severity-error';
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : 'Copy'}
      className="flex cursor-pointer items-center gap-1 rounded border border-tp-hairline px-2 py-0.5 text-xs text-tp-steel transition-colors hover:text-tp-ink"
    >
      <Iconify icon={copied ? 'mdi:check' : 'mdi:content-copy'} width={12} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function ClauseCard({ clause }: { clause: ClauseReportItem }) {
  const [open, setOpen] = useState(false);
  const [showTtl, setShowTtl] = useState(false);
  const unfair = unfairCount(clause);
  const unfairCategories = Object.entries(clause.unfair_terms ?? {})
    .filter(([, entries]) => entries.length > 0)
    .map(([category]) => ontologyCategoryLabel(category));

  return (
    <div className="rounded-lg border border-tp-hairline bg-tp-canvas">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-tp-surface"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-tp-ink">{clause.clause_text}</span>
          <span className="mt-3 flex flex-wrap gap-2">
            <span className={CHIP_CLASS}>{clause.type || 'other'}</span>
            {unfairCategories.map((category) => (
              <span key={category} className={CHIP_CLASS}>
                {category}
              </span>
            ))}
          </span>
        </span>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              unfair > 0
                ? 'border border-tp-severity-error-border bg-tp-severity-error-bg text-tp-severity-error'
                : 'border border-tp-severity-success-border bg-tp-severity-success-bg text-tp-severity-success'
            }`}
          >
            {unfair > 0 ? 'Potentially unfair' : 'Fair'}
          </span>
          {clause.semantic_sim !== null && (
            <span className={`font-mono text-xs ${simColor(clause.semantic_sim)}`}>
              sim {clause.semantic_sim.toFixed(2)}
            </span>
          )}
          <span className="text-xs text-tp-muted">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-tp-hairline-soft p-4 text-sm">
          <div className="grid grid-cols-3 gap-2 text-xs text-tp-steel">
            <span>
              Party: <span className="text-tp-ink">{clause.party || '—'}</span>
            </span>
            <span>
              Action: <span className="text-tp-ink">{clause.action || '—'}</span>
            </span>
            <span>
              Asset: <span className="text-tp-ink">{clause.asset || '—'}</span>
            </span>
          </div>

          {clause.permissions.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tp-severity-success">Permissions</p>
              {clause.permissions.map((p) => (
                <p key={p.id} className="text-xs text-tp-slate">
                  {p.assignee ?? 'Someone'} may {p.actions.join(', ')} → {p.targets.join(', ')}
                </p>
              ))}
            </div>
          )}
          {clause.prohibitions.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tp-severity-error">Prohibitions</p>
              {clause.prohibitions.map((p) => (
                <p key={p.id} className="text-xs text-tp-slate">
                  {p.assignee ?? 'Someone'} must not {p.actions.join(', ')} → {p.targets.join(', ')}
                </p>
              ))}
            </div>
          )}
          {clause.duties.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tp-severity-info">Duties</p>
              {clause.duties.map((d) => (
                <p key={d.id} className="text-xs text-tp-slate">
                  {d.assignee ?? 'Someone'} must {d.actions.join(', ')} → {d.targets.join(', ')}
                </p>
              ))}
            </div>
          )}

          {unfairCategories.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tp-severity-warning">Unfair term categories</p>
              <div className="flex flex-wrap gap-1">
                {unfairCategories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-tp-severity-warning-bg px-2 py-0.5 text-xs text-tp-severity-warning"
                  >
                    {category}
                  </span>
                ))}
              </div>
            </div>
          )}

          {clause.back_translated && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tp-steel">Back-translation</p>
              <p className="text-xs italic text-tp-steel">{clause.back_translated}</p>
            </div>
          )}

          <div className="flex gap-3 text-xs text-tp-steel">
            <span>
              Conforms:{' '}
              <span className={clause.conforms ? 'text-tp-severity-success' : 'text-tp-severity-error'}>
                {clause.conforms ? 'yes' : 'no'}
              </span>
            </span>
            <span>Repair rounds: {clause.repair_rounds}</span>
          </div>

          {clause.ttl && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowTtl((v) => !v)}
                  className="flex cursor-pointer items-center gap-1 text-xs text-tp-steel transition-colors hover:text-tp-ink"
                >
                  <span>{showTtl ? '▲' : '▶'}</span> Turtle (TTL)
                </button>
                {showTtl && <CopyButton text={clause.ttl} />}
              </div>
              {showTtl && (
                <pre className="overflow-x-auto whitespace-pre rounded-lg border border-tp-hairline-soft bg-tp-surface-code p-3 font-mono text-xs leading-relaxed text-tp-on-dark">
                  {clause.ttl}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The saved version already shows the contract's details and its own summary, so the report
// leaves out the header and the Clauses / Potentially unfair / Words figures.
function AggregateSummary({ aggregate }: { aggregate: AggregateStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <SummaryStat label="Permissions" value={aggregate.permissions} />
      <SummaryStat label="Prohibitions" value={aggregate.prohibitions} />
      <SummaryStat label="Duties" value={aggregate.duties} />
      <SummaryStat
        label="Semantic sim."
        value={aggregate.mean_semantic_sim !== null ? aggregate.mean_semantic_sim.toFixed(2) : 'N/A'}
      />
    </div>
  );
}

type ViewMode = 'all' | 'unfair';
type SortMode = 'default' | 'unfair-first' | 'lowest-sim';

function unfairCategoriesOf(clause: ClauseReportItem) {
  return Object.entries(clause.unfair_terms ?? {})
    .filter(([, entries]) => entries.length > 0)
    .map(([category]) => category);
}

// Same filter card, count line and card spacing as the AI Classify clause list.
function ClauseList({ clauses, summary }: { clauses: ClauseReportItem[]; summary: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [category, setCategory] = useState('all');
  const [type, setType] = useState('all');

  const types = useMemo(() => [...new Set(clauses.map((c) => c.type || 'other'))].sort(), [clauses]);

  const filtered = useMemo(() => {
    let list = clauses;
    if (viewMode === 'unfair') list = list.filter((c) => unfairCount(c) > 0);
    if (category !== 'all') list = list.filter((c) => unfairCategoriesOf(c).includes(category));
    if (type !== 'all') list = list.filter((c) => (c.type || 'other') === type);
    if (sortMode === 'unfair-first') list = [...list].sort((a, b) => unfairCount(b) - unfairCount(a));
    if (sortMode === 'lowest-sim') {
      list = [...list].sort((a, b) => (a.semantic_sim ?? Infinity) - (b.semantic_sim ?? Infinity));
    }
    return list;
  }, [clauses, viewMode, category, type, sortMode]);

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
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className={SELECT_CLASS}>
              <option value="default">Default order</option>
              <option value="unfair-first">Unfair first</option>
              <option value="lowest-sim">Lowest similarity first</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-tp-steel">Unfairness type</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT_CLASS}>
              <option value="all">All categories</option>
              {Object.entries(ONTOLOGY_CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-tp-steel">Clause type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={SELECT_CLASS}>
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {summary}

      <p className="text-xs text-tp-steel">
        {filtered.length} of {clauses.length} clauses
      </p>

      <div className="space-y-3">
        {filtered.map((clause) => (
          <ClauseCard key={clause.clause_id} clause={clause} />
        ))}
        {filtered.length === 0 && <p className="text-sm text-tp-steel">No clauses match the current filters.</p>}
      </div>
    </div>
  );
}

export default function SavedOntologyReport({ report }: { report: JobReport }) {
  const { aggregate, clauses } = report;

  return (
    <div className="space-y-6">
      <ClauseList clauses={clauses} summary={<AggregateSummary aggregate={aggregate} />} />
    </div>
  );
}
