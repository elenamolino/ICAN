import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import { format } from 'date-fns';
import { ContractVersionListItem } from '../../api/contractCollectionsApi';

type Metric = 'unfairClauses' | 'totalClauses' | 'totalWords';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'unfairClauses', label: 'Unfair clauses' },
  { key: 'totalClauses', label: 'Clauses' },
  { key: 'totalWords', label: 'Words' },
];

const LINE_COLOR = 'var(--color-tp-primary)';

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-tp-hairline bg-tp-canvas px-3 py-2 text-xs shadow-elevation-2">
      <p className="font-medium text-tp-ink">{point.dateLabel}</p>
      <p className="mt-0.5 text-tp-steel">
        {point.label}: <span className="font-semibold text-tp-ink">{payload[0].value}</span>
      </p>
    </div>
  );
}

function EndDot({ cx, cy, index, dataLength }: { cx: number; cy: number; index: number; dataLength: number }) {
  const isLast = index === dataLength - 1;
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={isLast ? 5 : 4}
      fill={LINE_COLOR}
      stroke="var(--color-tp-canvas)"
      strokeWidth={2}
    />
  );
}

export default function VersionEvolutionChart({ versions }: { versions: ContractVersionListItem[] }) {
  const [metric, setMetric] = useState<Metric>('unfairClauses');

  const usable = versions.filter((v) => v.summary !== null);
  if (usable.length < 2) {
    return (
      <p className="text-sm text-tp-steel">
        Not enough analyzed versions yet to plot an evolution chart.
      </p>
    );
  }

  const metricMeta = METRICS.find((m) => m.key === metric)!;
  const data = usable.map((v) => ({
    dateLabel: format(new Date(v.capturedAt), 'MMM d, yyyy'),
    label: metricMeta.label,
    value: v.summary ? v.summary[metric] : 0,
  }));
  const dataLength = data.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              metric === m.key
                ? 'bg-tp-primary text-tp-on-primary'
                : 'border border-tp-hairline text-tp-slate hover:bg-tp-canvas'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="h-64 rounded-lg border border-tp-hairline-soft bg-tp-canvas p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--color-tp-hairline-soft)" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fill: 'var(--color-tp-steel)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--color-tp-hairline)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--color-tp-steel)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE_COLOR}
              strokeWidth={2}
              dot={({ cx, cy, index }: any) => (
                <EndDot key={index} cx={cx} cy={cy} index={index} dataLength={dataLength} />
              )}
              activeDot={{ r: 6, fill: LINE_COLOR, stroke: 'var(--color-tp-canvas)', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
