import { Contract } from '../../api/contractCollectionsApi';
import { ServiceSummary } from '../../api/servicesApi';

// Contracts carry no category of their own, so it is derived from the contract name.
// A service has one Customer Agreement, and every document, the SLA too, is part of it.
export type AgreementName = 'Customer Agreement';
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
}

export interface ServiceNode {
  service: ServiceSummary;
  agreements: AgreementNode[];
}

function categoryForContract(contract: Contract): CategoryName {
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
    const agreements = categories.length
      ? [{ key: `${service.id}/${CUSTOMER_AGREEMENT}`, name: CUSTOMER_AGREEMENT, categories }]
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
    if (agreements.length > 0) {
      return { service, agreement: agreements[0], category: agreements[0].categories[0] };
    }
  }
  return null;
}
