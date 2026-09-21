import { useEffect, useState } from 'react';
import { CategorySelection, ServiceNode } from './model';

interface Props {
  tree: ServiceNode[];
  selection: CategorySelection | null;
  onSelect: (categoryKey: string) => void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 text-tp-steel transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

const rowClass =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tp-primary';

// Vertical guide line for one indentation level; no boxes around the children.
const guideClass = 'ml-[0.9rem] border-l border-tp-hairline pl-2';

export default function CollectionTree({ tree, selection, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const selectedCategoryKey = selection?.category.key;
  const selectedServiceKey = selection?.service.id;
  const selectedAgreementKey = selection?.agreement.key;

  // Collapsed by default: only the service (and agreement) of the selected category is open.
  // Whenever the selection changes -- by click, search or filters -- the tree folds back to that path.
  useEffect(() => {
    setExpanded(
      selectedServiceKey && selectedAgreementKey ? new Set([selectedServiceKey, selectedAgreementKey]) : new Set()
    );
  }, [selectedCategoryKey, selectedServiceKey, selectedAgreementKey]);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <ul role="tree" aria-label="Services" className="space-y-0.5">
      {tree.map(({ service, agreements }) => {
        const serviceOpen = expanded.has(service.id);
        return (
          <li key={service.id} role="treeitem" aria-expanded={serviceOpen}>
            <button
              type="button"
              onClick={() => toggle(service.id)}
              className={`${rowClass} font-medium text-tp-ink hover:bg-tp-surface`}
            >
              <Chevron open={serviceOpen} />
              <span className="min-w-0 flex-1 truncate">{service.name}</span>
            </button>

            {serviceOpen && (
              <ul role="group" className={guideClass}>
                {agreements.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-tp-steel">No documents</li>
                )}
                {agreements.map((agreement) => {
                  const agreementOpen = expanded.has(agreement.key);
                  return (
                    <li key={agreement.key} role="treeitem" aria-expanded={agreementOpen}>
                      <button
                        type="button"
                        onClick={() => toggle(agreement.key)}
                        className={`${rowClass} text-tp-slate hover:bg-tp-surface`}
                      >
                        <Chevron open={agreementOpen} />
                        <span className="min-w-0 flex-1 truncate">{agreement.name}</span>
                      </button>

                      {agreementOpen && (
                        <ul role="group" className={guideClass}>
                          {agreement.categories.map((category) => {
                            const selected = category.key === selectedCategoryKey;
                            return (
                              <li key={category.key} role="treeitem" aria-selected={selected}>
                                <button
                                  type="button"
                                  aria-current={selected ? 'true' : undefined}
                                  onClick={() => onSelect(category.key)}
                                  className={`${rowClass} ${
                                    selected
                                      ? 'bg-tp-cream font-medium text-tp-ink'
                                      : 'text-tp-steel hover:bg-tp-surface hover:text-tp-ink'
                                  }`}
                                >
                                  <span className="min-w-0 flex-1 truncate">{category.name}</span>
                                  <span className="shrink-0 text-xs">{category.contracts.length}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
