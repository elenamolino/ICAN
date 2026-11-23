import { Contract } from '../../api/contractCollectionsApi';
import { ServiceSummary } from '../../api/servicesApi';
import { DocumentType } from '../../../core/utils/document-types';

// A contract's category comes from its type, or from its name when it has none.
// A service has one Customer Agreement, and every document, the SLA too, is part of it.
export type AgreementName = 'Customer Agreement';

/** The node where the API puts documents without a service: it has no agreement page. */
export const UNASSIGNED_SERVICE_ID = '__unassigned__';
export type CategoryName = 'Terms and Policies' | 'Service Level Agreement' | 'Guidelines' | 'Other documents';

const CUSTOMER_AGREEMENT: AgreementName = 'Customer Agreement';
const CATEGORY_ORDER: CategoryName[] = ['Terms and Policies', 'Service Level Agreement', 'Guidelines', 'Other documents'];

export interface CategoryNode {
  key: string;
  name: CategoryName;
  contracts: Contract[];
}

export interface AgreementNode {
  key: string;
  name: AgreementName;
  categories: CategoryNode[];
  /** The pricing, a sibling of the categories: it is a page elsewhere, not a document here. */
  pricingUrl?: string | null;
}

export interface ServiceNode {
  service: ServiceSummary;
  agreements: AgreementNode[];
}

const CATEGORY_OF: Record<DocumentType, CategoryName> = {
  'terms-of-service': 'Terms and Policies',
  'service-level-agreement': 'Service Level Agreement',
  'privacy-policy': 'Terms and Policies',
  'acceptable-use-policy': 'Terms and Policies',
  'cookie-policy': 'Terms and Policies',
  'data-processing-agreement': 'Terms and Policies',
  'security-policy': 'Terms and Policies',
  other: 'Other documents',
};

function categoryForContract(contract: Contract): CategoryName {
  // The type, when it was chosen; for older contracts, the name.
  if (contract.documentType) return CATEGORY_OF[contract.documentType];
  const name = contract.name.toLocaleLowerCase();
  if (name.includes('service level') || name.includes(' sla')) return 'Service Level Agreement';
  if (name.includes('guidelines')) return 'Guidelines';
  if (/(terms|conditions|agreement|licen[cs]e|imprint|privacy|acceptable use|policy|policies|data|content|security|tracker)/.test(name)) {
    return 'Terms and Policies';
  }
  return 'Other documents';
}

export function buildServiceTree(
  nodes: { service: ServiceSummary; contracts: Contract[] }[]
): ServiceNode[] {
  return nodes.map(({ service, contracts }) => {
    const byCategory = new Map<CategoryName, Contract[]>();
    for (const contract of contracts) {
      const category = categoryForContract(contract);
      byCategory.set(category, [...(byCategory.get(category) ?? []), contract]);
    }

    const categories = CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
      key: `${service.id}/${CUSTOMER_AGREEMENT}/${category}`,
      name: category,
      contracts: byCategory.get(category)!,
    }));
    const agreements = categories.length || service.pricingUrl
      ? [{ key: `${service.id}/${CUSTOMER_AGREEMENT}`, name: CUSTOMER_AGREEMENT, categories, pricingUrl: service.pricingUrl ?? null }]
      : [];

    return { service, agreements };
  });
}

export interface CategorySelection {
  service: ServiceSummary;
  agreement: AgreementNode;
  category: CategoryNode;
}

export function findCategory(tree: ServiceNode[], key: string | null): CategorySelection | null {
  for (const { service, agreements } of tree) {
    for (const agreement of agreements) {
      for (const category of agreement.categories) {
        if (category.key === key) return { service, agreement, category };
      }
    }
  }
  return null;
}

export function firstCategory(tree: ServiceNode[]): CategorySelection | null {
  for (const { service, agreements } of tree) {
    // A service whose agreement only has its pricing has no documents to show.
    const agreement = agreements.find((a) => a.categories.length > 0);
    if (agreement) return { service, agreement, category: agreement.categories[0] };
  }
  return null;
}
