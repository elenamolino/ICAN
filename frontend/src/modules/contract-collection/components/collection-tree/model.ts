import { Contract } from '../../api/contractCollectionsApi';
import { ServiceSummary } from '../../api/servicesApi';

// Contracts carry no agreement/category of their own, so both levels are derived
// from the contract name.
export type AgreementName = 'Customer Agreement' | 'Service Level Agreement';
export type CategoryName = 'Terms and Policies' | 'Service Level Agreement' | 'Guidelines' | 'Other documents';

const AGREEMENT_ORDER: AgreementName[] = ['Customer Agreement', 'Service Level Agreement'];
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
  if (/(terms|conditions|imprint|privacy|acceptable use|policy|policies|data|content|security|tracker)/.test(name)) {
    return 'Terms and Policies';
  }
  return 'Other documents';
}

function agreementForCategory(category: CategoryName): AgreementName {
  return category === 'Service Level Agreement' ? 'Service Level Agreement' : 'Customer Agreement';
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

    const agreements = AGREEMENT_ORDER.flatMap((agreementName) => {
      const categories = CATEGORY_ORDER.filter(
        (category) => agreementForCategory(category) === agreementName && byCategory.has(category)
      ).map((category) => ({
        key: `${service.id}/${agreementName}/${category}`,
        name: category,
        contracts: byCategory.get(category)!,
      }));
      return categories.length > 0
        ? [{ key: `${service.id}/${agreementName}`, name: agreementName, categories }]
        : [];
    });

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
