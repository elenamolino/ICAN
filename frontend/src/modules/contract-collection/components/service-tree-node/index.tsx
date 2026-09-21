import { useId, useState } from 'react';
import { Contract, ContractCollectionSummary } from '../../api/contractCollectionsApi';
import { ServiceSummary } from '../../api/servicesApi';
import ContractCard from '../contract-card';

interface Props {
  service: ServiceSummary;
  contracts: Contract[];
  collection: ContractCollectionSummary;
  defaultExpanded?: boolean;
}

type AgreementCategory = 'Terms and Policies' | 'Service Level Agreement' | 'Other documents';

const categoryOrder: AgreementCategory[] = ['Terms and Policies', 'Service Level Agreement', 'Other documents'];

const categoryDescription: Record<AgreementCategory, string> = {
  'Terms and Policies': 'Terms, privacy, acceptable use and data policies',
  'Service Level Agreement': 'Availability and service commitments',
  'Other documents': 'Additional conditions and supporting documents',
};

function categoryForContract(contract: Contract): AgreementCategory {
  const normalizedName = contract.name.toLocaleLowerCase();
  if (normalizedName.includes('service level') || normalizedName.includes(' sla')) {
    return 'Service Level Agreement';
  }
  if (/(terms|privacy|acceptable use|policy|policies|data|content|security|tracker)/.test(normalizedName)) {
    return 'Terms and Policies';
  }
  return 'Other documents';
}

interface TreeBranchProps {
  category: AgreementCategory;
  contracts: Contract[];
  collection: ContractCollectionSummary;
}

function TreeBranch({ category, contracts, collection }: TreeBranchProps) {
  const [isOpen, setIsOpen] = useState(contracts.length <= 4);
  const contentId = useId();
  const accentClass = category === 'Service Level Agreement'
    ? 'bg-tp-primary text-white'
    : category === 'Other documents'
      ? 'bg-tp-canvas text-tp-steel'
      : 'bg-tp-cream text-tp-ink';

  return (
    <div className="rounded-xl border border-tp-hairline bg-tp-canvas/80 p-1.5 transition-colors hover:border-tp-hairline-strong">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((open) => !open)}
        className="group flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tp-primary"
      >
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border border-tp-hairline bg-tp-canvas text-tp-steel transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-tp-ink">{category}</span>
          <span className="mt-0.5 block truncate text-xs text-tp-steel">{categoryDescription[category]}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${accentClass}`}>
          {contracts.length}
        </span>
      </button>

      {isOpen ? (
        <div id={contentId} className="px-1 pb-1 pt-2">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {contracts.map((contract) => (
              <ContractCard
                key={contract.id ?? contract.slug}
                data={{
                  ...contract,
                  organization: contract.organization ?? collection.organization,
                  collection: { id: collection.id, name: collection.name, slug: collection.slug },
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ServiceTreeNode({ service, contracts, collection, defaultExpanded = false }: Props) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const documentLabel = contracts.length === 1 ? 'document' : 'documents';
  const contractsByCategory = contracts.reduce((groups, contract) => {
    const category = categoryForContract(contract);
    const categoryContracts = groups.get(category) ?? [];
    categoryContracts.push(contract);
    groups.set(category, categoryContracts);
    return groups;
  }, new Map<AgreementCategory, Contract[]>());
  const populatedCategories = categoryOrder.flatMap((category) => {
    const categoryContracts = contractsByCategory.get(category);
    return categoryContracts ? [[category, categoryContracts] as const] : [];
  });

  return (
    <section className="overflow-hidden rounded-xl border border-tp-hairline bg-tp-canvas shadow-[0_10px_30px_-24px_rgba(17,33,56,0.55)] transition-shadow hover:shadow-[0_18px_36px_-24px_rgba(17,33,56,0.7)]">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-tp-surface"
      >
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center text-tp-steel transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tp-cream text-tp-primary">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5h16.5v9.75a1.5 1.5 0 01-1.5 1.5h-13.5a1.5 1.5 0 01-1.5-1.5V7.5zm0 0L5.1 5.16A1.5 1.5 0 016.42 4.5h3.66a1.5 1.5 0 011.06.44l1.2 1.2a1.5 1.5 0 001.06.44h5.1a1.5 1.5 0 011.5 1.5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-tp-ink">{service.name}</span>
          <span className="mt-0.5 block text-xs text-tp-steel">Service</span>
        </span>
        <span className="shrink-0 rounded-full bg-tp-surface px-2.5 py-1 text-xs font-medium text-tp-steel">
          {contracts.length} {documentLabel}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-tp-hairline bg-[linear-gradient(115deg,rgba(255,252,244,0.7),rgba(255,255,255,0.2))] px-4 py-4 sm:pl-[4.75rem]">
          {contracts.length === 0 ? (
            <p className="py-2 text-sm text-tp-steel">There are no documents in this service yet.</p>
          ) : (
            <div className="rounded-2xl border border-tp-beige-deep/60 bg-tp-cream/35 p-3 sm:p-4">
              <div className="mb-3 flex items-center gap-2.5 text-sm font-medium text-tp-ink">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tp-cream text-tp-primary shadow-sm" aria-hidden="true">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v16.5m-8.25-8.25h16.5" />
                  </svg>
                </span>
                <span className="rounded-md bg-tp-cream px-2.5 py-1.5 font-semibold shadow-sm">Customer Agreement</span>
                <span className="ml-auto text-xs text-tp-steel">{contracts.length} documents</span>
              </div>
              <div className="space-y-2">
                {populatedCategories.map(([category, categoryContracts]) => (
                  <TreeBranch key={category} category={category} contracts={categoryContracts} collection={collection} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
