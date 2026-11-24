import type { DocumentType } from '../../core/utils/document-types';

import { useAuth } from '../../auth/hooks/useAuth';
import { AnalysisSummary, ClauseAnalysis } from '../../analysis/api/analysisApi';
import { JobReport } from '../../analysis/api/ontologyAnalysisApi';

const BASE_URL = import.meta.env.VITE_API_URL;

export interface ContractCollectionOrganization {
  id: string;
  name: string;
  displayName: string;
  avatar: string | null;
}

export interface ContractCollectionSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  private: boolean;
  /** Server-computed, only on the detail endpoint: what the current user may do. */
  canEdit?: boolean;
  canDelete?: boolean;
  /** Whether the user may move it to another organization. */
  canMove?: boolean;
  organization: ContractCollectionOrganization;
  /** Only on the detail endpoint. The documents themselves come from listCollectionServices. */
  contractCount?: number;
  contracts?: Contract[];
}

export type PolicyType =
  | 'terms-of-service'
  | 'privacy-policy'
  | 'acceptable-use-policy'
  | 'service-level-agreement'
  | 'data-security-policy'
  | 'other-policy';
export type ReviewState = 'has-unfair-clauses' | 'no-unfair-clauses' | 'not-analysed';
export type CaptureAge = 'last-30-days' | 'older-than-90-days';
export type DocumentFilter = 'with-documents' | 'empty';

export interface CollectionServiceNode {
  id: string;
  name: string;
  slug: string;
  pricingUrl?: string | null;
  /** The provider's own pricing page. */
  pricingSourceUrl?: string | null;
  contracts: Contract[];
}

export interface CollectionServicesPage {
  services: CollectionServiceNode[];
  total: number;
  limit: number;
  offset: number;
  /** How many services, before filtering, have at least one document of each kind. */
  facets: {
    documents: Record<DocumentFilter, number>;
    policyTypes: Record<PolicyType, number>;
    review: Record<ReviewState, number>;
    captured: Record<CaptureAge, number>;
  };
}

export interface CollectionServicesQuery {
  limit: number;
  offset: number;
  name?: string;
  documents?: DocumentFilter[];
  policyTypes?: PolicyType[];
  review?: ReviewState[];
  captured?: CaptureAge[];
}

export interface ContractServiceRef {
  id: string;
  name: string;
  slug: string;
}

export interface Contract {
  id: string;
  name: string;
  /** Who provides the service. Null for documents saved before it was kept apart. */
  company?: string | null;
  slug: string;
  /** Null for contracts saved before there were types. */
  documentType?: DocumentType | null;
  version?: string;
  createdAt: string;
  url?: string;
  content?: string;
  private: boolean;
  /** Server-computed, only on the detail endpoint: what the current user may do. */
  canEdit?: boolean;
  canDelete?: boolean;
  organization?: ContractCollectionOrganization;
  collection?: { id: string; name: string; slug: string } | null;
  service?: ContractServiceRef | null;
  latestVersionSummary?: AnalysisSummary;
}

/** The Customer Agreement of a service: its documents, each with its current version. */
export interface Agreement {
  collection: { name: string; slug: string; private: boolean };
  organization: ContractCollectionOrganization;
  service: { id: string; name: string; pricingUrl: string | null; pricingSourceUrl: string | null };
  contracts: (Pick<Contract, 'id' | 'name' | 'company' | 'slug' | 'documentType' | 'private' | 'latestVersionSummary' | 'url'> & {
    current: { id: string; number: string | null; name: string | null; capturedAt: string } | null;
  })[];
}

export type ContractVersionLabel = 'first' | 'intermediate' | 'last';

export interface ContractVersionListItem {
  id: string;
  commitHash: string;
  capturedAt: string;
  label: ContractVersionLabel;
  insertions: number | null;
  deletions: number | null;
  summary: AnalysisSummary | null;
  hasOntologyReport: boolean;
  analysisSkipped: boolean;
  /** When it was saved in iCan, as opposed to when the text was captured. */
  createdAt?: string;
  /** "0.1" when saved from the editor; null for versions numbered by date. */
  number?: string | null;
  /** Name its author gave it when saving ("Adds a refund policy"), or null. */
  name?: string | null;
  /** The version it was edited from; null means the one before it by date. */
  _parentVersionId?: string | null;
}

export interface ContractVersionDetail extends ContractVersionListItem {
  content: string;
  clauses: ClauseAnalysis[] | null;
  ontologyReport: JobReport | null;
}

function buildQuery(params: Record<string, string | number | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length) qs.set(key, value.join(','));
      continue;
    }
    qs.set(key, String(value));
  }
  const query = qs.toString();
  return query ? `?${query}` : '';
}

// Opened from a permanent link, the page's address carries the link's secret. The
// reads of a contract and its versions pass it on, whoever makes them.
function shareQuery(): string {
  return buildQuery({ share: new URLSearchParams(window.location.search).get('share') ?? undefined });
}

// Every read below goes through fetchWithInterceptor: private collections and
// contracts are only returned when the caller's token identifies them as someone
// with access, and an anonymous caller still gets the public ones.
export function useContractCollectionsApi() {
  const { fetchWithInterceptor } = useAuth();

  async function listCollections(params?: {
    name?: string;
    limit?: number;
    offset?: number;
    organizationIds?: string[];
  }): Promise<{ collections: ContractCollectionSummary[]; total: number }> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contractCollections${buildQuery({ ...params })}`);
    if (!res.ok) throw new Error('Failed to fetch collections');
    const data = await res.json();
    return { collections: data.collections ?? [], total: data.total ?? 0 };
  }

  async function getCollection(organizationId: string, collectionSlug: string): Promise<ContractCollectionSummary> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contractCollections/${organizationId}/${collectionSlug}`);
    if (!res.ok) throw new Error('Collection not found');
    return res.json();
  }

  async function listCollectionServices(
    organizationId: string,
    collectionSlug: string,
    params: CollectionServicesQuery,
    signal?: AbortSignal
  ): Promise<CollectionServicesPage> {
    const res = await fetchWithInterceptor(
      `${BASE_URL}/contractCollections/${organizationId}/${collectionSlug}/services${buildQuery({ ...params })}`,
      { signal }
    );
    if (!res.ok) throw new Error('Failed to fetch the services of the collection');
    return res.json();
  }

  async function listContracts(params?: {
    name?: string;
    limit?: number;
    offset?: number;
    collection?: string;
  }): Promise<{ contracts: Contract[]; total: number }> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contracts${buildQuery({ ...params })}`);
    if (!res.ok) throw new Error('Failed to fetch contracts');
    const data = await res.json();
    return { contracts: data.contracts ?? [], total: data.total ?? 0 };
  }

  async function getContract(organizationId: string, contractSlug: string): Promise<Contract> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contracts/${organizationId}/${contractSlug}${shareQuery()}`);
    if (!res.ok) throw new Error('Contract not found');
    return res.json();
  }

  async function resolvePermalink(token: string): Promise<{ organizationId: string; contractSlug: string }> {
    const res = await fetchWithInterceptor(`${BASE_URL}/permalinks/contract/${token}`);
    if (!res.ok) throw new Error('Contract not found');
    return res.json();
  }

  async function getAgreement(organizationId: string, collectionSlug: string, serviceId: string): Promise<Agreement> {
    const res = await fetchWithInterceptor(
      `${BASE_URL}/contractCollections/${organizationId}/${collectionSlug}/services/${serviceId}${shareQuery()}`
    );
    if (!res.ok) throw new Error(res.status === 404 ? 'Customer Agreement not found' : 'You cannot see this Customer Agreement');
    return res.json();
  }

  async function getAgreementShareToken(organizationId: string, collectionSlug: string, serviceId: string): Promise<string> {
    const res = await fetchWithInterceptor(
      `${BASE_URL}/contractCollections/${organizationId}/${collectionSlug}/services/${serviceId}/permalink`
    );
    if (!res.ok) throw new Error('This Customer Agreement cannot be shared');
    return (await res.json()).token;
  }

  async function resolveAgreementPermalink(token: string): Promise<{ organizationId: string; collectionSlug: string; serviceId: string }> {
    const res = await fetchWithInterceptor(`${BASE_URL}/permalinks/agreement/${token}`);
    if (!res.ok) throw new Error('Customer Agreement not found');
    return res.json();
  }

  async function getShareToken(organizationId: string, contractSlug: string): Promise<string> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contracts/${organizationId}/${contractSlug}/permalink`);
    if (!res.ok) throw new Error('This contract cannot be shared');
    return (await res.json()).token;
  }

  async function listContractVersions(
    organizationId: string,
    contractSlug: string
  ): Promise<ContractVersionListItem[]> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contracts/${organizationId}/${contractSlug}/versions${shareQuery()}`);
    if (!res.ok) throw new Error('Failed to fetch contract versions');
    const data = await res.json();
    return data.versions ?? [];
  }

  async function getContractVersion(
    organizationId: string,
    contractSlug: string,
    versionId: string
  ): Promise<ContractVersionDetail> {
    const res = await fetchWithInterceptor(
      `${BASE_URL}/contracts/${organizationId}/${contractSlug}/versions/${versionId}${shareQuery()}`
    );
    if (!res.ok) throw new Error('Contract version not found');
    return res.json();
  }

  async function createCollection(
    organizationId: string,
    data: { name: string; private?: boolean }
  ): Promise<ContractCollectionSummary> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contractCollections/${organizationId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to create collection');
    }
    return res.json();
  }

  async function transferCollection(
    organizationId: string,
    collectionSlug: string,
    targetOrganizationId: string
  ): Promise<ContractCollectionSummary> {
    const res = await fetchWithInterceptor(
      `${BASE_URL}/contractCollections/${organizationId}/${collectionSlug}/transfer`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: targetOrganizationId }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to move collection');
    }
    return res.json();
  }

  async function updateCollection(
    organizationId: string,
    collectionSlug: string,
    data: { private?: boolean; name?: string; description?: string }
  ): Promise<ContractCollectionSummary> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contractCollections/${organizationId}/${collectionSlug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update collection');
    }
    return res.json();
  }

  async function updateContract(
    organizationId: string,
    contractSlug: string,
    data: { private?: boolean; name?: string }
  ): Promise<Contract> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contracts/${organizationId}/${contractSlug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update contract');
    }
    return res.json();
  }

  async function deleteCollection(
    organizationId: string,
    collectionSlug: string,
    cascade: boolean
  ): Promise<void> {
    const res = await fetchWithInterceptor(
      `${BASE_URL}/contractCollections/${organizationId}/${collectionSlug}?cascade=${cascade}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to delete collection');
    }
  }

  async function deleteContract(organizationId: string, contractSlug: string): Promise<void> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contracts/${organizationId}/${contractSlug}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to delete contract');
    }
  }

  async function deleteContractVersion(
    organizationId: string,
    contractSlug: string,
    versionId: string
  ): Promise<void> {
    const res = await fetchWithInterceptor(
      `${BASE_URL}/contracts/${organizationId}/${contractSlug}/versions/${versionId}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to delete version');
    }
  }

  return {
    listCollections,
    getCollection,
    listCollectionServices,
    listContracts,
    getContract,
    listContractVersions,
    getContractVersion,
    createCollection,
    updateCollection,
    transferCollection,
    resolvePermalink,
    getShareToken,
    getAgreement,
    getAgreementShareToken,
    resolveAgreementPermalink,
    updateContract,
    deleteCollection,
    deleteContract,
    deleteContractVersion,
  };
}
