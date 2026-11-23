import { format } from 'date-fns';
import { ContractVersionListItem } from '../../api/contractCollectionsApi';
import { versionLabel, layoutVersionGraph, parentOf, TextChange, VersionChanges, versionTitle } from '../../utils/versions';

const STEP = 88;
// Height of one row: the dot and its two labels.
const ROW_H = 76;
const DOT_Y = 16;

const MAX_CHANGES = 6;

const inSection = (section: string | null) => (section ? <>In “{section}”: </> : null);

function ChangeLine({ change }: { change: TextChange }) {
  switch (change.kind) {
    case 'section-removed':
      return <>Removed the section “{change.section}”.</>;
    case 'section-added':
      return <>Added the section “{change.section}”.</>;
    case 'paragraph-added':
      return <>{inSection(change.section)}added “{change.text}”</>;
    case 'paragraph-removed':
      return <>{inSection(change.section)}removed “{change.text}”</>;
    case 'reworded':
      return (
        <>
          {inSection(change.section)}
          {change.context && <>{change.context} </>}
          {/* Only text taken out, only text put in, or one replaced by the other. */}
          {change.before && <del className="rounded bg-tp-severity-error-bg px-1 text-tp-severity-error">{change.before}</del>}
          {change.before && change.after && ' → '}
          {change.after && (
            <ins className="rounded bg-tp-severity-success-bg px-1 font-medium text-tp-severity-success no-underline">{change.after}</ins>
          )}
        </>
      );
  }
}

const MARK: Record<TextChange['kind'], string> = {
  'section-added': '+', 'paragraph-added': '+', 'section-removed': '−', 'paragraph-removed': '−', reworded: '~',
};

export default function VersionGraph({
  contractName,
  ownerName,
  versions,
  selectedId,
  onSelect,
  changes,
  textChanges,
  onSeeChanges,
}: {
  contractName: string;
  ownerName?: string;
  versions: ContractVersionListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** What changed from the previous version, once both are loaded. */
  changes?: VersionChanges | null;
  /** The text changes from the previous version, in order. */
  textChanges?: TextChange[] | null;
  onSeeChanges?: () => void;
}) {
  const selected = versions.find(v => v.id === selectedId);
  const selectedIndex = versions.findIndex(v => v.id === selectedId);
  const width = Math.max(versions.length * STEP, STEP);
  const nodes = layoutVersionGraph(versions);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rows = Math.max(...nodes.map((n) => n.row), 0) + 1;
  const parent = selected ? parentOf(versions, selected.id) : null;
  const parentNumber = parent ? versions.indexOf(parent) + 1 : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-tp-hairline bg-tp-canvas dark:bg-tp-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-tp-ink">Version graph</h2>
          <p className="text-sm text-tp-steel">
            {versions.length} {versions.length === 1 ? 'version' : 'versions'}, in the order they came out
            {rows > 1 ? '. A branch is a version edited from an older one.' : '.'}
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
          <div className="relative" style={{ width, height: rows * ROW_H }}>
            {/* Lines from each version to the one it came from: straight along a
                row, curving down where a branch starts. */}
            <svg className="absolute inset-0" width={width} height={rows * ROW_H} aria-hidden>
              {nodes.filter((n) => n.parentId).map((node) => {
                const parent = byId.get(node.parentId!)!;
                const x1 = parent.column * STEP + STEP / 2, y1 = parent.row * ROW_H + DOT_Y;
                const x2 = node.column * STEP + STEP / 2, y2 = node.row * ROW_H + DOT_Y;
                const d = y1 === y2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} Q${x1},${y2} ${x1 + STEP / 2},${y2} L${x2},${y2}`;
                return <path key={node.id} d={d} fill="none" strokeWidth={2} className="stroke-tp-primary opacity-40" />;
              })}
            </svg>
            {nodes.map((node) => {
              const v = versions[node.column];
              const isSelected = v.id === selectedId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelect(v.id)}
                  title={`${versionTitle(v, node.column + 1)} · ${format(new Date(v.capturedAt), 'MMM d, yyyy')}${node.parentId && node.row > 0 && byId.get(node.parentId)!.row !== node.row ? ` · edited from ${versionLabel(versions[byId.get(node.parentId)!.column], byId.get(node.parentId)!.column + 1)}` : ''}`}
                  className="group absolute flex w-[88px] cursor-pointer flex-col items-center gap-1"
                  style={{ left: node.column * STEP, top: node.row * ROW_H }}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      isSelected ? 'border-2 border-tp-primary bg-tp-canvas' : 'group-hover:bg-tp-primary/10'
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full bg-tp-primary" />
                  </span>
                  <span className={`font-mono text-xs ${isSelected ? 'font-semibold text-tp-ink' : 'text-tp-steel'}`}>
                    {versionLabel(v, node.column + 1)}
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
              <span>{versionTitle(selected, selectedIndex + 1)}</span>
              <span className="rounded-full bg-tp-primary/10 px-2 py-0.5 text-xs font-medium text-tp-primary">Shown</span>
              {selected.label === 'last' && (
                <span className="rounded-full border border-tp-hairline px-2 py-0.5 text-xs text-tp-steel">Current</span>
              )}
            </p>
            <p className="text-sm text-tp-steel">
              {format(new Date(selected.capturedAt), 'MMM d, yyyy')}
              {selected.createdAt && <> · added to iCan {format(new Date(selected.createdAt), 'MMM d, yyyy, HH:mm')}</>}
              {selected.summary && (
                <> · {selected.summary.totalClauses} provisions, {selected.summary.unfairClauses} potentially unfair</>
              )}
            </p>
            {!parent ? (
              <p className="mt-1 text-sm text-tp-steel">First version of the contract.</p>
            ) : textChanges ? (
              <div className="mt-2 text-sm text-tp-ink">
                <p className="font-medium">
                  Compared with {versionLabel(parent, parentNumber!)}
                  {parentNumber !== selectedIndex ? ', the version it was edited from' : ''}:
                </p>
                {textChanges.length === 0 ? (
                  <p className="text-tp-steel">No changes in the text.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {textChanges.slice(0, MAX_CHANGES).map((change, i) => (
                      <li key={i} className="grid grid-cols-[14px_minmax(0,1fr)] gap-1.5">
                        <span className="font-mono text-tp-steel">{MARK[change.kind]}</span>
                        <span className="min-w-0"><ChangeLine change={change} /></span>
                      </li>
                    ))}
                  </ul>
                )}
                {changes && changes.unfairBefore !== changes.unfairAfter && (
                  <p className="mt-1 text-tp-steel">
                    Unfair provisions {changes.unfairBefore} → {changes.unfairAfter}
                    {changes.newUnfairCategories.length > 0 && <> (new: {changes.newUnfairCategories.join(', ')})</>}.
                  </p>
                )}
                <p className="mt-1 text-tp-steel">
                  {textChanges.length > MAX_CHANGES && <>And {textChanges.length - MAX_CHANGES} more changes. </>}
                  {onSeeChanges && (
                    <button type="button" onClick={onSeeChanges} className="cursor-pointer font-medium text-tp-primary hover:underline">
                      See the comparison
                    </button>
                  )}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
