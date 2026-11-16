import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ContractVersionListItem } from '../../api/contractCollectionsApi';
import Iconify from '../../../core/components/iconify';
import { parentOf } from '../../utils/versions';

const ACTION = 'cursor-pointer rounded-md p-1.5 text-tp-steel transition-colors hover:bg-tp-primary/10 hover:text-tp-primary';

export default function VersionList({
  versions,
  selectedId,
  onView,
  onCompareWithPrevious,
  onDownload,
  linkTo,
  onDelete,
}: {
  versions: ContractVersionListItem[];
  selectedId: string;
  onView: (id: string) => void;
  onCompareWithPrevious: (id: string) => void;
  onDownload: (id: string) => void;
  linkTo: (id: string) => string;
  onDelete?: (id: string) => void;
}) {
  // Newest first, as a history reads; the numbers keep the release order.
  const rows = versions.map((v, i) => ({ v, n: i + 1 })).reverse();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(linkTo(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    } catch {
      // Clipboard blocked: nothing to copy to.
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-tp-hairline">
      {rows.map(({ v, n }) => (
        <div
          key={v.id}
          className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-tp-hairline px-5 py-3 last:border-b-0 ${
            v.id === selectedId ? 'bg-tp-primary/5' : ''
          }`}
        >
          <span className="min-w-10 text-base text-tp-ink">
            <span className="font-mono">v{n}</span>
            {v.name && <span className="ml-2 font-medium">{v.name}</span>}
          </span>
          {v.label === 'last' && (
            <span className="rounded-full bg-tp-primary/10 px-2 py-0.5 text-xs font-medium text-tp-primary">Current</span>
          )}
          <span className="text-sm text-tp-steel" title={format(new Date(v.capturedAt), 'MMM d, yyyy, HH:mm')}>
            {formatDistanceToNow(new Date(v.capturedAt), { addSuffix: true })}
          </span>
          {v.summary && (
            <span className={`text-sm ${v.summary.unfairClauses > 0 ? 'text-tp-severity-warning' : 'text-tp-muted'}`}>
              {v.summary.unfairClauses} unfair
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => onView(v.id)} title="Show this version" className={ACTION}>
              <Iconify icon="mdi:eye-outline" width={18} />
            </button>
            {parentOf(versions, v.id) && (
              <button
                type="button"
                onClick={() => onCompareWithPrevious(v.id)}
                title={`Compare with v${versions.indexOf(parentOf(versions, v.id)!) + 1}, the version it came from`}
                className={ACTION}
              >
                <Iconify icon="mdi:compare-horizontal" width={18} />
              </button>
            )}
            {!parentOf(versions, v.id) && <span aria-hidden className="w-[30px]" />}
            <button type="button" onClick={() => onDownload(v.id)} title="Download the text (.md)" className={ACTION}>
              <Iconify icon="mdi:download-outline" width={18} />
            </button>
            <button
              type="button"
              onClick={() => copyLink(v.id)}
              title={copiedId === v.id ? 'Link copied' : 'Copy a link to this version'}
              className={ACTION}
            >
              <Iconify icon={copiedId === v.id ? 'mdi:check' : 'mdi:link-variant'} width={18} />
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(v.id)}
                title="Delete this version"
                className="cursor-pointer rounded-md p-1.5 text-tp-steel transition-colors hover:bg-tp-severity-error-bg hover:text-tp-severity-error"
              >
                <Iconify icon="mdi:trash-can-outline" width={18} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
