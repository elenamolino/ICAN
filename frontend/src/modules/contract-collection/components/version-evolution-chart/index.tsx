import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { ContractVersionListItem } from '../../api/contractCollectionsApi';
import { versionLabel } from '../../utils/versions';

// One chart per measure, as SPHERE shows a pricing's evolution. Each has its own
// scale: words and clauses are of different sizes, so they never share an axis.
interface Measure {
  key: 'unfair' | 'provisions' | 'words' | 'versions';
  title: string;
  /** Versions saved without an analysis have no value: their point is left out. */
  value: (version: ContractVersionListItem, index: number) => number | null;
  step?: boolean;
}

const MEASURES: Measure[] = [
  { key: 'unfair', title: 'Unfair provisions', value: (v) => v.summary?.unfairClauses ?? null },
  { key: 'provisions', title: 'Provisions', value: (v) => v.summary?.totalClauses ?? null },
  { key: 'words', title: 'Words', value: (v) => v.summary?.totalWords ?? null },
  { key: 'versions', title: 'Versions', value: (_v, index) => index + 1, step: true },
];

const LINE = 'var(--color-tp-primary)';

interface Point {
  date: string;
  version: string;
  value: number | null;
}

function ChartTooltip({ active, payload, title }: any) {
  if (!active || !payload?.length || payload[0].value === null) return null;
  const point: Point = payload[0].payload;
  return (
    <div className="rounded-lg border border-tp-hairline bg-tp-canvas px-3 py-2 text-xs shadow-elevation-2">
      <p className="font-medium text-tp-ink">{point.version} · {point.date}</p>
      <p className="mt-0.5 text-tp-steel">
        {title}: <span className="font-semibold text-tp-ink">{point.value?.toLocaleString()}</span>
      </p>
    </div>
  );
}

function MeasureChart({ measure, points }: { measure: Measure; points: Point[] }) {
  const last = [...points].reverse().find((p) => p.value !== null);
  return (
    <figure className="rounded-xl border border-tp-hairline bg-tp-canvas p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-tp-ink">{measure.title}</span>
        {last && <span className="text-xs text-tp-steel">now {last.value?.toLocaleString()}</span>}
      </figcaption>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-tp-hairline-soft)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--color-tp-steel)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--color-tp-hairline)' }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--color-tp-steel)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              domain={[0, 'auto']}
            />
            <Tooltip content={<ChartTooltip title={measure.title} />} cursor={{ stroke: 'var(--color-tp-hairline-strong)' }} />
            <Line
              type={measure.step ? 'stepAfter' : 'linear'}
              dataKey="value"
              stroke={LINE}
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
              dot={{ r: 4, fill: LINE, stroke: 'var(--color-tp-canvas)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: LINE, stroke: 'var(--color-tp-canvas)', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function VersionEvolutionChart({ versions }: { versions: ContractVersionListItem[] }) {
  if (versions.length < 2) {
    return <p className="text-sm text-tp-steel">The evolution needs at least two versions.</p>;
  }

  const rows = versions.map((v, i) => ({
    date: format(new Date(v.capturedAt), 'MMM d, yyyy'),
    version: versionLabel(v, i + 1),
    values: MEASURES.map((m) => m.value(v, i)),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {MEASURES.map((measure, m) => (
          <MeasureChart
            key={measure.key}
            measure={measure}
            points={rows.map((r) => ({ date: r.date, version: r.version, value: r.values[m] }))}
          />
        ))}
      </div>

      <details className="rounded-xl border border-tp-hairline bg-tp-canvas">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-tp-ink">See the numbers</summary>
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-tp-steel">
              <tr>
                <th className="py-2 pr-4 font-medium">Version</th>
                <th className="py-2 pr-4 font-medium">Date</th>
                {MEASURES.map((m) => (
                  <th key={m.key} className="py-2 pr-4 text-right font-medium">{m.title}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-tp-ink">
              {rows.map((r) => (
                <tr key={r.version + r.date} className="border-t border-tp-hairline-soft">
                  <td className="py-2 pr-4 font-mono">{r.version}</td>
                  <td className="py-2 pr-4 text-tp-steel">{r.date}</td>
                  {r.values.map((value, i) => (
                    <td key={MEASURES[i].key} className="py-2 pr-4 text-right tabular-nums">{value?.toLocaleString() ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
