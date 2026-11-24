import { describe, expect, it } from 'vitest';
import { Contract } from '../../api/contractCollectionsApi';
import { buildServiceTree, firstCategory } from './model';

describe('buildServiceTree', () => {
  it('puts the SLA in the Customer Agreement, next to the terms', () => {
    const contracts = ['Acme — Service Level Agreement', 'Acme — Terms of Service', 'Acme — SLA'].map(
      (name) => ({ name }) as Contract
    );
    const [{ agreements }] = buildServiceTree([{ service: { id: 's', name: 'Acme', slug: 'acme' }, contracts }]);

    expect(agreements.map((a) => a.name)).toEqual(['Customer Agreement']);
    expect(agreements[0].categories.map((c) => [c.name, c.contracts.length])).toEqual([
      ['Terms and Policies', 1],
      ['Service Level Agreement', 2],
    ]);
  });

  it('puts the pricing next to the categories, also when it is all the agreement has', () => {
    const service = { id: 's', name: 'Acme', slug: 'acme', pricingUrl: 'https://sphere.score.us.es/p/1' };
    const [withDocs] = buildServiceTree([{ service, contracts: [{ name: 'Acme — Terms of Service' } as Contract] }]);
    expect(withDocs.agreements[0].pricingUrl).toBe(service.pricingUrl);
    const [onlyPricing] = buildServiceTree([{ service, contracts: [] }]);
    expect(onlyPricing.agreements).toEqual([expect.objectContaining({ categories: [], pricingUrl: service.pricingUrl })]);
    expect(firstCategory([onlyPricing])).toBeNull();
  });

  it('links the provider\'s pricing page when the pricing is not in SPHERE', () => {
    const service = { id: 's', name: 'Acme', slug: 'acme', pricingUrl: null, pricingSourceUrl: 'https://acme.com/pricing' };
    const [tree] = buildServiceTree([{ service, contracts: [] }]);
    expect(tree.agreements[0].pricingUrl).toBe('https://acme.com/pricing');
  });
});
