import { useState } from 'react';
import { AggregateStats, ClauseReportItem, JobReport } from '../api/ontologyAnalysisApi';
import Iconify from '../../core/components/iconify';

function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-tp-hairline-soft bg-tp-canvas px-4 py-3 text-center">
      <p className="text-xl font-bold text-tp-ink">{value}</p>
      <p className="text-xs text-tp-steel">{label}</p>
    </div>
  );
}

function unfairCount(clause: ClauseReportItem) {
  return Object.values(clause.unfair_terms).reduce((sum, entries) => sum + entries.length, 0);
}

function totalWords(clauses: ClauseReportItem[]) {
  return clauses.reduce(
    (sum, c) => sum + c.clause_text.trim().split(/\s+/).filter(Boolean).length,
    0
  );
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
  const unfairCategories = Object.entries(clause.unfair_terms)
    .filter(([, entries]) => entries.length > 0)
    .map(([category]) => category.replace(/_/g, ' '));

  return (
    <div className="rounded-lg border border-tp-hairline bg-tp-canvas">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-tp-surface"
      >
        <span className="mt-0.5 shrink-0 rounded-full bg-tp-surface px-2 py-0.5 text-xs font-medium text-tp-slate">
          {clause.type || 'other'}
        </span>
        <span className="flex-1 text-sm text-tp-ink">{clause.clause_text}</span>
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

function AggregateSummary({
  aggregate,
  words,
}: {
  aggregate: AggregateStats;
  words: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <SummaryStat label="Clauses" value={aggregate.total_clauses} />
      <SummaryStat label="Potentially unfair" value={aggregate.unfair_count} />
      <SummaryStat label="Words" value={words} />
      <SummaryStat
        label="Semantic sim."
        value={aggregate.mean_semantic_sim !== null ? aggregate.mean_semantic_sim.toFixed(2) : 'N/A'}
      />
      <SummaryStat label="Permissions" value={aggregate.permissions} />
      <SummaryStat label="Prohibitions" value={aggregate.prohibitions} />
      <SummaryStat label="Duties" value={aggregate.duties} />
    </div>
  );
}

export default function OntologyReport({ report }: { report: JobReport }) {
  const { aggregate, clauses } = report;
  const unfairClauses = clauses.filter((c) => unfairCount(c) > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-tp-ink">{report.title || 'Untitled contract'}</h2>
        <p className="text-sm text-tp-steel">
          {report.provider || 'Unknown provider'} · {report.date || 'Unknown date'}
        </p>
      </div>

      <AggregateSummary aggregate={aggregate} words={totalWords(clauses)} />

      {unfairClauses.length > 0 && (
        <div className="rounded-lg border border-tp-severity-warning-border bg-tp-severity-warning-bg p-4">
          <h3 className="mb-3 font-semibold text-tp-severity-warning">⚠ Potentially unfair terms</h3>
          <ul className="space-y-2">
            {unfairClauses.map((c) => {
              const categories = Object.entries(c.unfair_terms)
                .filter(([, entries]) => entries.length > 0)
                .map(([category]) => category.replace(/_/g, ' '));
              return (
                <li key={c.clause_id} className="text-sm">
                  <span className="text-tp-severity-warning">{c.clause_id}:</span>{' '}
                  <span className="text-tp-slate">{categories.join(', ')}</span>
                  <p className="mt-0.5 line-clamp-1 text-xs text-tp-steel">{c.clause_text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-3 font-semibold text-tp-ink">All clauses</h3>
        <div className="space-y-2">
          {clauses.map((clause) => (
            <ClauseCard key={clause.clause_id} clause={clause} />
          ))}
        </div>
      </div>
    </div>
  );
}
