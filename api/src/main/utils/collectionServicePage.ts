// Filters, counts and pages the services of a collection for the collection
// detail page. This used to run in the browser over every contract of the
// collection; it lives here so the page only receives the services it shows.

export const POLICY_TYPES = [
  'terms-of-service',
  'privacy-policy',
  'acceptable-use-policy',
  'service-level-agreement',
  'data-security-policy',
  'other-policy',
] as const;
export const REVIEW_STATES = ['has-unfair-clauses', 'no-unfair-clauses', 'not-analysed'] as const;
export const CAPTURE_AGES = ['last-30-days', 'older-than-90-days'] as const;
export const DOCUMENT_FILTERS = ['with-documents', 'empty'] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];
export type ReviewState = (typeof REVIEW_STATES)[number];
export type CaptureAge = (typeof CAPTURE_AGES)[number];
export type DocumentFilter = (typeof DOCUMENT_FILTERS)[number];

export const UNASSIGNED_SERVICE = { id: '__unassigned__', name: 'Unassigned documents', slug: '__unassigned__' };

export interface ServicePageContract {
  id: string;
  name: string;
  createdAt: Date | string;
  latestVersionSummary?: { unfairClauses: number } | null;
  [key: string]: any;
}

export interface ServicePageService {
  id: string;
  name: string;
  slug: string;
}

export interface ServicePageQuery {
  limit: number;
  offset: number;
  name?: string;
  documents?: DocumentFilter[];
  policyTypes?: PolicyType[];
  review?: ReviewState[];
  captured?: CaptureAge[];
}

export interface ServicePageNode<C extends ServicePageContract> extends ServicePageService {
  contracts: C[];
}

export interface ServicePage<C extends ServicePageContract> {
  services: ServicePageNode<C>[];
  total: number;
  limit: number;
  offset: number;
  // How many services (before filtering) have at least one document of each kind.
  facets: {
    documents: Record<DocumentFilter, number>;
    policyTypes: Record<PolicyType, number>;
    review: Record<ReviewState, number>;
    captured: Record<CaptureAge, number>;
  };
}

const DAY_MS = 86_400_000;

export function policyTypeForContract(contract: Pick<ServicePageContract, 'name'>): PolicyType {
  const name = contract.name.toLocaleLowerCase();
  if (name.includes('service level') || name.includes(' sla')) return 'service-level-agreement';
  if (name.includes('privacy')) return 'privacy-policy';
  if (name.includes('acceptable use')) return 'acceptable-use-policy';
  if (name.includes('terms of service') || name.includes('terms and conditions') || name.includes('general terms')) {
    return 'terms-of-service';
  }
  if (/(data|content|security|tracker|cookie)/.test(name)) return 'data-security-policy';
  return 'other-policy';
}

function reviewStateOf(contract: ServicePageContract): ReviewState {
  const summary = contract.latestVersionSummary;
  if (!summary) return 'not-analysed';
  return summary.unfairClauses > 0 ? 'has-unfair-clauses' : 'no-unfair-clauses';
}

function captureAgesOf(contract: ServicePageContract, now: number): CaptureAge[] {
  const capturedAt = new Date(contract.createdAt).getTime();
  if (Number.isNaN(capturedAt)) return [];
  const ageInDays = (now - capturedAt) / DAY_MS;
  if (ageInDays <= 30) return ['last-30-days'];
  if (ageInDays > 90) return ['older-than-90-days'];
  return [];
}

function countBy<K extends string, C extends ServicePageContract>(
  keys: readonly K[],
  nodes: ServicePageNode<C>[],
  keysOf: (contract: C) => K[]
): Record<K, number> {
  const counts = Object.fromEntries(keys.map(key => [key, 0])) as Record<K, number>;
  for (const node of nodes) {
    const present = new Set(node.contracts.flatMap(keysOf));
    present.forEach(key => { counts[key] += 1; });
  }
  return counts;
}

// Groups contracts under their service. Contracts without a known service go
// to a trailing "Unassigned documents" node, which only exists when needed.
export function groupContractsByService<C extends ServicePageContract>(
  services: ServicePageService[],
  contracts: (C & { serviceId?: string | null })[]
): ServicePageNode<C>[] {
  const byService = new Map<string, C[]>(services.map(service => [service.id, []]));
  const unassigned: C[] = [];

  for (const contract of contracts) {
    const bucket = contract.serviceId ? byService.get(contract.serviceId) : undefined;
    if (bucket) bucket.push(contract);
    else unassigned.push(contract);
  }

  const nodes = services.map(service => ({ ...service, contracts: byService.get(service.id)! }));
  if (unassigned.length > 0) nodes.push({ ...UNASSIGNED_SERVICE, contracts: unassigned });
  return nodes;
}

export function buildServicePage<C extends ServicePageContract>(
  nodes: ServicePageNode<C>[],
  query: ServicePageQuery,
  now: number = Date.now()
): ServicePage<C> {
  const name = query.name?.trim().toLocaleLowerCase() ?? '';
  const documents = query.documents ?? [];
  const policyTypes = query.policyTypes ?? [];
  const review = query.review ?? [];
  const captured = query.captured ?? [];
  const hasDocumentLevelFilter = policyTypes.length > 0 || review.length > 0 || captured.length > 0;

  const filtered = nodes.flatMap(node => {
    if (name && !node.name.toLocaleLowerCase().includes(name)) return [];

    const hasDocuments = node.contracts.length > 0;
    if (
      documents.length > 0
      && !(documents.includes('with-documents') && hasDocuments)
      && !(documents.includes('empty') && !hasDocuments)
    ) {
      return [];
    }

    const contracts = node.contracts.filter(contract => (
      (policyTypes.length === 0 || policyTypes.includes(policyTypeForContract(contract)))
      && (review.length === 0 || review.includes(reviewStateOf(contract)))
      && (captured.length === 0 || captureAgesOf(contract, now).some(age => captured.includes(age)))
    ));
    if (hasDocumentLevelFilter && contracts.length === 0) return [];

    return [{ ...node, contracts }];
  });

  return {
    services: filtered.slice(query.offset, query.offset + query.limit),
    total: filtered.length,
    limit: query.limit,
    offset: query.offset,
    facets: {
      documents: {
        'with-documents': nodes.filter(node => node.contracts.length > 0).length,
        empty: nodes.filter(node => node.contracts.length === 0).length,
      },
      policyTypes: countBy(POLICY_TYPES, nodes, contract => [policyTypeForContract(contract)]),
      review: countBy(REVIEW_STATES, nodes, contract => [reviewStateOf(contract)]),
      captured: countBy(CAPTURE_AGES, nodes, contract => captureAgesOf(contract, now)),
    },
  };
}
