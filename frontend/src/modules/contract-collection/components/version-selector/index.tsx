import { format } from 'date-fns';
import { ContractVersionListItem } from '../../api/contractCollectionsApi';
import Iconify from '../../../core/components/iconify';

const LABEL_TEXT: Record<string, string> = {
  first: 'First',
  intermediate: 'Update',
  last: 'Latest',
};

export default function VersionSelector({
  versions,
  selectedId,
  onSelect,
  onDelete,
}: {
  versions: ContractVersionListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {versions.map((v) => {
        const isSelected = v.id === selectedId;
        return (
          <div key={v.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(v.id)}
              className={`cursor-pointer rounded-lg border px-3 py-2 pr-3 text-left text-xs transition-colors ${
                isSelected
                  ? 'border-tp-primary bg-tp-primary/8 text-tp-ink'
                  : 'border-tp-hairline text-tp-steel hover:border-tp-hairline-strong hover:text-tp-ink'
              } ${onDelete ? 'pr-7' : ''}`}
            >
              <p className="font-semibold">{LABEL_TEXT[v.label] ?? v.label}</p>
              <p className="mt-0.5 text-tp-muted">{format(new Date(v.capturedAt), 'MMM d, yyyy')}</p>
              {v.summary && (
                <p className={`mt-0.5 ${v.summary.unfairClauses > 0 ? 'text-tp-severity-warning' : 'text-tp-muted'}`}>
                  {v.summary.unfairClauses} unfair
                </p>
              )}
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(v.id);
                }}
                aria-label="Delete version"
                className="absolute right-1.5 top-1.5 cursor-pointer rounded p-0.5 text-tp-muted opacity-0 transition-opacity hover:bg-tp-severity-error-bg hover:text-tp-severity-error group-hover:opacity-100"
              >
                <Iconify icon="mdi:trash-can-outline" width={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
