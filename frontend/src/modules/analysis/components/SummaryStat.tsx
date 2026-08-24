export default function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-tp-hairline-soft bg-tp-canvas px-4 py-3 text-center">
      <p className="text-xl font-bold text-tp-ink">{value}</p>
      <p className="text-xs text-tp-steel">{label}</p>
    </div>
  );
}
