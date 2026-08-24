import { format } from 'date-fns';
import { ContractVersionListItem } from '../../api/contractCollectionsApi';

const LABEL_TEXT: Record<string, string> = {
  first: 'First',
  intermediate: 'Update',
  last: 'Latest',
};

export default function VersionSelector({
  versions,
  selectedId,
  onSelect,
}: {
  versions: ContractVersionListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {versions.map((v) => {
        const isSelected = v.id === selectedId;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            className={`cursor-pointer rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
              isSelected
                ? 'border-tp-primary bg-tp-primary/8 text-tp-ink'
                : 'border-tp-hairline text-tp-steel hover:border-tp-hairline-strong hover:text-tp-ink'
            }`}
          >
            <p className="font-semibold">{LABEL_TEXT[v.label] ?? v.label}</p>
            <p className="mt-0.5 text-tp-muted">{format(new Date(v.capturedAt), 'MMM d, yyyy')}</p>
            {v.summary && (
              <p className={`mt-0.5 ${v.summary.unfairClauses > 0 ? 'text-tp-severity-warning' : 'text-tp-muted'}`}>
                {v.summary.unfairClauses} unfair
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
