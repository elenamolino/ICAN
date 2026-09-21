import { formatDistanceToNow, parseISO } from 'date-fns';
import { useRouter } from '../../../core/hooks/useRouter';
import { Contract, ContractCollectionSummary } from '../../api/contractCollectionsApi';
import { CategorySelection } from '../collection-tree/model';

interface Props {
  selection: CategorySelection;
  collection: ContractCollectionSummary;
  onBack: () => void;
}

function UnfairBadge({ contract }: { contract: Contract }) {
  const summary = contract.latestVersionSummary;
  if (!summary) {
    return <span className="rounded bg-tp-surface px-1.5 py-0.5 text-[11px] text-tp-muted">Not analysed</span>;
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] ${
        summary.unfairClauses > 0
          ? 'bg-tp-severity-warning-bg text-tp-severity-warning'
          : 'bg-tp-severity-success-bg text-tp-severity-success'
      }`}
    >
      {summary.unfairClauses} unfair
    </span>
  );
}

// Documents are named "<Service> — <Document>"; the service is already in the breadcrumb.
function documentTitle(contractName: string, serviceName: string): string {
  if (!contractName.toLocaleLowerCase().startsWith(serviceName.toLocaleLowerCase())) return contractName;
  const rest = contractName.slice(serviceName.length).replace(/^\s*[—–:-]\s*/, '').trim();
  return rest || contractName;
}

export default function DocumentList({ selection, collection, onBack }: Props) {
  const router = useRouter();
  const { service, agreement, category } = selection;
  const organizationId = (category.contracts[0]?.organization ?? collection.organization).id;

  const open = (contract: Contract) =>
    router.push(`/collections/${contract.organization?.id ?? organizationId}/${collection.slug}/${contract.slug}`);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-tp-steel hover:text-tp-ink lg:hidden"
      >
        ← Back
      </button>
      <p className="text-xs text-tp-steel">
        {service.name} / {agreement.name}
      </p>
      <h2 className="mt-1 font-display text-lg text-tp-ink">{category.name}</h2>

      <ul className="mt-3 divide-y divide-tp-hairline-soft border-t border-tp-hairline-soft">
        {category.contracts.map((contract) => (
          <li key={contract.id}>
            <button
              type="button"
              onClick={() => open(contract)}
              className="group flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 text-left transition-colors hover:bg-tp-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tp-primary"
            >
              <span className="min-w-0 flex-1 basis-56 truncate text-sm font-medium text-tp-ink group-hover:text-tp-primary">
                {documentTitle(contract.name, service.name)}
              </span>
              <span className="flex flex-wrap items-center gap-3 text-[11px] text-tp-steel">
                <UnfairBadge contract={contract} />
                <span>{contract.version ? 'Synced' : 'Not synced'}</span>
                {contract.createdAt && (
                  <span className="text-tp-muted">
                    {formatDistanceToNow(parseISO(contract.createdAt), { addSuffix: true })}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
