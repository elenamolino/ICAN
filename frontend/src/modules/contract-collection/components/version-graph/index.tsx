import { format } from 'date-fns';
import { ContractVersionListItem } from '../../api/contractCollectionsApi';

// Versions come sorted by capture date, so their position is their number.
export const versionName = (versions: ContractVersionListItem[], id: string) =>
  `v${versions.findIndex(v => v.id === id) + 1}`;

const STEP = 88;

export default function VersionGraph({
  contractName,
  ownerName,
  versions,
  selectedId,
  onSelect,
}: {
  contractName: string;
  ownerName?: string;
  versions: ContractVersionListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = versions.find(v => v.id === selectedId);
  const selectedIndex = versions.findIndex(v => v.id === selectedId);
  const width = Math.max(versions.length * STEP, STEP);

  return (
    <section className="overflow-hidden rounded-2xl border border-tp-hairline bg-tp-canvas dark:bg-tp-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-tp-ink">Version graph</h2>
          <p className="text-sm text-tp-steel">
            {versions.length} {versions.length === 1 ? 'version' : 'versions'}, in the order they came out.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-tp-steel">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-tp-primary" />Version
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-tp-primary bg-tp-canvas" />Shown
          </span>
        </div>
      </header>

      <div className="flex border-y border-tp-hairline bg-tp-primary/5">
        <div className="hidden w-56 shrink-0 flex-col justify-center border-r border-tp-hairline px-5 py-3 sm:flex">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-tp-primary">
            <span className="h-2 w-2 rounded-full bg-tp-primary" />This contract
          </span>
          <span className="truncate font-semibold text-tp-ink" title={contractName}>{contractName}</span>
          {ownerName && <span className="truncate text-xs text-tp-steel">{ownerName}</span>}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto px-4 py-3">
          <div className="relative h-[72px]" style={{ width }}>
            <div
              className="absolute top-[15px] h-0.5 bg-tp-primary/40"
              style={{ left: STEP / 2, width: Math.max(width - STEP, 0) }}
            />
            {versions.map((v, i) => {
              const isSelected = v.id === selectedId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelect(v.id)}
                  title={`v${i + 1} · ${format(new Date(v.capturedAt), 'MMM d, yyyy')}${v.summary ? ` · ${v.summary.unfairClauses} unfair` : ''}`}
                  className="group absolute top-0 flex w-[88px] cursor-pointer flex-col items-center gap-1"
                  style={{ left: i * STEP }}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      isSelected ? 'border-2 border-tp-primary bg-tp-canvas' : 'group-hover:bg-tp-primary/10'
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full bg-tp-primary" />
                  </span>
                  <span className={`font-mono text-xs ${isSelected ? 'font-semibold text-tp-ink' : 'text-tp-steel'}`}>
                    v{i + 1}
                  </span>
                  <span className="text-[11px] text-tp-muted">{format(new Date(v.capturedAt), 'MMM yyyy')}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <p className="flex items-center gap-2 text-tp-ink">
              <span className="font-semibold">{contractName}</span>
              <span>v{selectedIndex + 1}</span>
              <span className="rounded-full bg-tp-primary/10 px-2 py-0.5 text-xs font-medium text-tp-primary">Shown</span>
              {selected.label === 'last' && (
                <span className="rounded-full border border-tp-hairline px-2 py-0.5 text-xs text-tp-steel">Current</span>
              )}
            </p>
            <p className="text-sm text-tp-steel">
              {format(new Date(selected.capturedAt), 'MMM d, yyyy')}
              {selected.createdAt && <> · added to iCan {format(new Date(selected.createdAt), 'MMM d, yyyy, HH:mm')}</>}
              {selected.summary && (
                <> · {selected.summary.totalClauses} clauses, {selected.summary.unfairClauses} potentially unfair</>
              )}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
