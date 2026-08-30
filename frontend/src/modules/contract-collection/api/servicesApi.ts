const BASE_URL = import.meta.env.VITE_API_URL;

export interface ServiceSummary {
  id: string;
  name: string;
  slug: string;
}

export async function listServices(params: { collectionId: string }): Promise<ServiceSummary[]> {
  const qs = new URLSearchParams({ collectionId: params.collectionId });
  const response = await fetch(`${BASE_URL}/services?${qs.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch services');
  const data = await response.json();
  return data.services ?? [];
}
