import { useAuth } from '../../auth/hooks/useAuth';
import { AnalysisSummary, ClauseAnalysis } from '../../analysis/api/analysisApi';

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
  organization: ContractCollectionOrganization;
  contracts?: Contract[];
}

export interface ContractServiceRef {
  id: string;
  name: string;
  slug: string;
}

export interface Contract {
  id: string;
  name: string;
  slug: string;
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

export type ContractVersionLabel = 'first' | 'intermediate' | 'last';

export interface ContractVersionListItem {
  id: string;
  commitHash: string;
  capturedAt: string;
  label: ContractVersionLabel;
  insertions: number | null;
  deletions: number | null;
  summary: AnalysisSummary | null;
  analysisSkipped: boolean;
}

export interface ContractVersionDetail extends ContractVersionListItem {
  content: string;
  clauses: ClauseAnalysis[] | null;
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
    const res = await fetchWithInterceptor(`${BASE_URL}/contracts/${organizationId}/${contractSlug}`);
    if (!res.ok) throw new Error('Contract not found');
    return res.json();
  }

  async function listContractVersions(
    organizationId: string,
    contractSlug: string
  ): Promise<ContractVersionListItem[]> {
    const res = await fetchWithInterceptor(`${BASE_URL}/contracts/${organizationId}/${contractSlug}/versions`);
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
      `${BASE_URL}/contracts/${organizationId}/${contractSlug}/versions/${versionId}`
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
    listContracts,
    getContract,
    listContractVersions,
    getContractVersion,
    createCollection,
    updateCollection,
    updateContract,
    deleteCollection,
    deleteContract,
    deleteContractVersion,
  };
}
