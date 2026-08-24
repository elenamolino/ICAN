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

export async function listCollections(params?: {
  name?: string;
  limit?: number;
  offset?: number;
  organizationIds?: string[];
}): Promise<{ collections: ContractCollectionSummary[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.name) qs.set('name', params.name);
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  if (params?.organizationIds?.length) qs.set('organizationIds', params.organizationIds.join(','));
  const query = qs.toString();

  const response = await fetch(`${BASE_URL}/contractCollections${query ? `?${query}` : ''}`);
  if (!response.ok) throw new Error('Failed to fetch collections');
  const data = await response.json();
  return { collections: data.collections ?? [], total: data.total ?? 0 };
}

export async function getCollection(organizationId: string, collectionSlug: string): Promise<ContractCollectionSummary> {
  const response = await fetch(`${BASE_URL}/contractCollections/${organizationId}/${collectionSlug}`);
  if (!response.ok) throw new Error('Collection not found');
  return response.json();
}

export async function getContract(organizationId: string, contractSlug: string): Promise<Contract> {
  const response = await fetch(`${BASE_URL}/contracts/${organizationId}/${contractSlug}`);
  if (!response.ok) throw new Error('Contract not found');
  return response.json();
}

export async function listContracts(params?: {
  name?: string;
  limit?: number;
  offset?: number;
  collection?: string;
}): Promise<{ contracts: Contract[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.name) qs.set('name', params.name);
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  if (params?.collection) qs.set('collection', params.collection);
  const query = qs.toString();

  const response = await fetch(`${BASE_URL}/contracts${query ? `?${query}` : ''}`);
  if (!response.ok) throw new Error('Failed to fetch contracts');
  const data = await response.json();
  return { contracts: data.contracts ?? [], total: data.total ?? 0 };
}

export async function listContractVersions(
  organizationId: string,
  contractSlug: string
): Promise<ContractVersionListItem[]> {
  const response = await fetch(`${BASE_URL}/contracts/${organizationId}/${contractSlug}/versions`);
  if (!response.ok) throw new Error('Failed to fetch contract versions');
  const data = await response.json();
  return data.versions ?? [];
}

export async function getContractVersion(
  organizationId: string,
  contractSlug: string,
  versionId: string
): Promise<ContractVersionDetail> {
  const response = await fetch(`${BASE_URL}/contracts/${organizationId}/${contractSlug}/versions/${versionId}`);
  if (!response.ok) throw new Error('Contract version not found');
  return response.json();
}
