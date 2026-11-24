import { useAuth } from '../../auth/hooks/useAuth';

const BASE_URL = import.meta.env.VITE_API_URL;

export interface ServiceSummary {
  id: string;
  name: string;
  slug: string;
  /** Where the service's pricing is published, if it is. */
  pricingUrl?: string | null;
}

// Takes the caller's fetchWithInterceptor: the services of a private collection need the token.
export async function listServices(
  params: { collectionId: string },
  fetcher: (url: string) => Promise<Response>
): Promise<ServiceSummary[]> {
  const qs = new URLSearchParams({ collectionId: params.collectionId });
  const response = await fetcher(`${BASE_URL}/services?${qs.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch services');
  const data = await response.json();
  return data.services ?? [];
}

export function useServicesApi() {
  const { fetchWithInterceptor } = useAuth();

  async function deleteService(serviceId: string): Promise<void> {
    const res = await fetchWithInterceptor(`${BASE_URL}/services/${serviceId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to delete service');
    }
  }

  /** Sets the link shown as the Pricing entry of the service's Customer Agreement. */
  async function setServicePricing(serviceId: string, pricingUrl: string): Promise<void> {
    const res = await fetchWithInterceptor(`${BASE_URL}/services/${serviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricingUrl }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to update the service');
    }
  }

  return { deleteService, setServicePricing };
}
