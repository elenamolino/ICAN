import { describe, it, expect } from 'vitest';
import {
  buildServicePage,
  groupContractsByService,
  policyTypeForContract,
  UNASSIGNED_SERVICE,
} from '../../main/utils/collectionServicePage';

const NOW = new Date('2026-10-12T00:00:00Z').getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function contract(id: string, name: string, serviceId: string | null, extra: Record<string, any> = {}) {
  return { id, name, serviceId, createdAt: daysAgo(10), ...extra };
}

const services = Array.from({ length: 25 }, (_, i) => ({
  id: `s${String(i).padStart(2, '0')}`,
  name: `Service ${String(i).padStart(2, '0')}`,
  slug: `service-${i}`,
}));

describe('policyTypeForContract', () => {
  it('classifies documents by their name', () => {
    expect(policyTypeForContract({ name: 'GitHub — Privacy Policy' })).toBe('privacy-policy');
    expect(policyTypeForContract({ name: 'AWS Service Level Agreement' })).toBe('service-level-agreement');
    expect(policyTypeForContract({ name: 'Terms of Service' })).toBe('terms-of-service');
    expect(policyTypeForContract({ name: 'Cookie notice' })).toBe('data-security-policy');
    expect(policyTypeForContract({ name: 'Imprint' })).toBe('other-policy');
  });
});

describe('groupContractsByService', () => {
  it('puts contracts under their service and the rest in a trailing unassigned node', () => {
    const nodes = groupContractsByService(services.slice(0, 2), [
      contract('c1', 'ToS', 's00'),
      contract('c2', 'ToS', null),
      contract('c3', 'ToS', 'deleted-service'),
    ]);

    expect(nodes.map(node => node.id)).toEqual(['s00', 's01', UNASSIGNED_SERVICE.id]);
    expect(nodes[0].contracts.map(c => c.id)).toEqual(['c1']);
    expect(nodes[1].contracts).toEqual([]);
    expect(nodes[2].contracts.map(c => c.id)).toEqual(['c2', 'c3']);
  });

  it('adds no unassigned node when every contract has a service', () => {
    const nodes = groupContractsByService(services.slice(0, 1), [contract('c1', 'ToS', 's00')]);
    expect(nodes.map(node => node.id)).toEqual(['s00']);
  });
});

describe('buildServicePage', () => {
  const nodes = groupContractsByService(services, [
    contract('c1', 'Terms of Service', 's00', { latestVersionSummary: { unfairClauses: 3 } }),
    contract('c2', 'Privacy Policy', 's00', { latestVersionSummary: { unfairClauses: 0 } }),
    contract('c3', 'Privacy Policy', 's01', { createdAt: daysAgo(200) }),
    contract('c4', 'Terms of Service', 's02', { createdAt: daysAgo(60) }),
  ]);

  it('returns ten services at a time with the total', () => {
    const first = buildServicePage(nodes, { limit: 10, offset: 0 }, NOW);
    const last = buildServicePage(nodes, { limit: 10, offset: 20 }, NOW);

    expect(first.total).toBe(25);
    expect(first.services.map(s => s.id)).toEqual(services.slice(0, 10).map(s => s.id));
    expect(last.services).toHaveLength(5);
  });

  it('searches service names case-insensitively', () => {
    const page = buildServicePage(nodes, { limit: 10, offset: 0, name: 'service 2' }, NOW);
    expect(page.services.map(s => s.id)).toEqual(['s20', 's21', 's22', 's23', 's24']);
    expect(page.total).toBe(5);
  });

  it('keeps only the matching documents and drops services left without any', () => {
    const page = buildServicePage(nodes, { limit: 10, offset: 0, policyTypes: ['privacy-policy'] }, NOW);
    expect(page.services.map(s => [s.id, s.contracts.map(c => c.id)])).toEqual([
      ['s00', ['c2']],
      ['s01', ['c3']],
    ]);
  });

  it('filters by review state and capture age', () => {
    expect(buildServicePage(nodes, { limit: 10, offset: 0, review: ['has-unfair-clauses'] }, NOW).services
      .map(s => s.id)).toEqual(['s00']);
    expect(buildServicePage(nodes, { limit: 10, offset: 0, review: ['not-analysed'] }, NOW).services
      .map(s => s.id)).toEqual(['s01', 's02']);
    expect(buildServicePage(nodes, { limit: 10, offset: 0, captured: ['older-than-90-days'] }, NOW).services
      .map(s => s.id)).toEqual(['s01']);
  });

  it('filters empty services and services with documents', () => {
    expect(buildServicePage(nodes, { limit: 100, offset: 0, documents: ['with-documents'] }, NOW).total).toBe(3);
    expect(buildServicePage(nodes, { limit: 100, offset: 0, documents: ['empty'] }, NOW).total).toBe(22);
  });

  it('counts facets over every service, whatever the filters', () => {
    const { facets } = buildServicePage(nodes, { limit: 10, offset: 0, name: 'nothing matches' }, NOW);
    expect(facets.documents).toEqual({ 'with-documents': 3, empty: 22 });
    expect(facets.policyTypes['privacy-policy']).toBe(2);
    expect(facets.policyTypes['terms-of-service']).toBe(2);
    expect(facets.review).toEqual({ 'has-unfair-clauses': 1, 'no-unfair-clauses': 1, 'not-analysed': 2 });
    expect(facets.captured).toEqual({ 'last-30-days': 1, 'older-than-90-days': 1 });
  });
});
