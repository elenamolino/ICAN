import { describe, expect, it } from 'vitest';
import { Contract } from '../../api/contractCollectionsApi';
import { buildServiceTree } from './model';

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
});
