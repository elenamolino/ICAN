import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  ContractVersionDetail,
  ContractVersionListItem,
  useContractCollectionsApi,
} from '../../api/contractCollectionsApi';
import { CATEGORY_LABELS, CATEGORY_KEYS, RELEVANCE_THRESHOLD } from '../../../analysis/constants/clauseCategories';
import Iconify from '../../../core/components/iconify';

const SELECT_CLASS =
  'w-full rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none';

function versionLabel(v: ContractVersionListItem) {
  const dateStr = format(new Date(v.capturedAt), 'MMM d, yyyy');
  const tag = v.label === 'first' ? 'First' : v.label === 'last' ? 'Latest' : 'Update';
  return `${tag} · ${dateStr}`;
}

function Delta({ before, after, invertGood = false }: { before: number; after: number; invertGood?: boolean }) {
  const diff = after - before;
  if (diff === 0) return <span className="text-tp-muted">—</span>;
  const isGood = invertGood ? diff < 0 : diff > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium ${
        isGood ? 'text-tp-severity-success' : 'text-tp-severity-error'
      }`}
    >
      <Iconify icon={diff > 0 ? 'mdi:arrow-up' : 'mdi:arrow-down'} width={12} />
      {Math.abs(diff)}
    </span>
  );
}

function StatRow({ label, before, after, invertGood }: { label: string; before: number; after: number; invertGood?: boolean }) {
  return (
    <div className="grid grid-cols-4 items-center gap-2 py-2 text-sm">
      <span className="text-tp-steel">{label}</span>
      <span className="text-center text-tp-ink">{before}</span>
      <span className="text-center text-tp-ink">{after}</span>
      <span className="text-center">
        <Delta before={before} after={after} invertGood={invertGood} />
      </span>
    </div>
  );
}

function categoryCount(version: ContractVersionDetail, key: string) {
  if (!version.clauses) return 0;
  return version.clauses.filter((c) => (c[key as keyof typeof c] as number) >= RELEVANCE_THRESHOLD).length;
}

export default function VersionComparison({
  organizationId,
  contractSlug,
  versions,
}: {
  organizationId: string;
  contractSlug: string;
  versions: ContractVersionListItem[];
}) {
  const { getContractVersion } = useContractCollectionsApi();
  const [beforeId, setBeforeId] = useState(versions[0]?.id ?? '');
  const [afterId, setAfterId] = useState(versions[versions.length - 1]?.id ?? '');
  const [before, setBefore] = useState<ContractVersionDetail | null>(null);
  const [after, setAfter] = useState<ContractVersionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!beforeId || !afterId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getContractVersion(organizationId, contractSlug, beforeId),
      getContractVersion(organizationId, contractSlug, afterId),
    ])
      .then(([b, a]) => {
        if (cancelled) return;
        setBefore(b);
        setAfter(a);
      })
      .catch(() => !cancelled && setError('Failed to load the selected versions'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [organizationId, contractSlug, beforeId, afterId]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-tp-steel">Compare</label>
          <select value={beforeId} onChange={(e) => setBeforeId(e.target.value)} className={SELECT_CLASS}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {versionLabel(v)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-tp-steel">Against</label>
          <select value={afterId} onChange={(e) => setAfterId(e.target.value)} className={SELECT_CLASS}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {versionLabel(v)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-tp-severity-error">{error}</p>}

      {loading && <p className="text-sm text-tp-steel">Loading versions…</p>}

      {!loading && before && after && before.summary && after.summary && (
        <div className="space-y-4 rounded-lg border border-tp-hairline-soft bg-tp-canvas p-5">
          <div className="grid grid-cols-4 gap-2 text-xs font-semibold uppercase tracking-wide text-tp-steel">
            <span></span>
            <span className="text-center">Compare</span>
            <span className="text-center">Against</span>
            <span className="text-center">Δ</span>
          </div>
          <div className="divide-y divide-tp-hairline-soft">
            <StatRow label="Clauses" before={before.summary.totalClauses} after={after.summary.totalClauses} />
            <StatRow
              label="Unfair clauses"
              before={before.summary.unfairClauses}
              after={after.summary.unfairClauses}
              invertGood
            />
            <StatRow label="Words" before={before.summary.totalWords} after={after.summary.totalWords} />
          </div>

          {before.clauses && after.clauses && (
            <>
              <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-tp-steel">
                Clauses by category
              </h3>
              <div className="divide-y divide-tp-hairline-soft">
                {CATEGORY_KEYS.map((key) => (
                  <StatRow
                    key={key}
                    label={CATEGORY_LABELS[key]}
                    before={categoryCount(before, key)}
                    after={categoryCount(after, key)}
                    invertGood
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
