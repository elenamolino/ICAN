import dotenv from 'dotenv';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { shutdownApp, TestApp } from './utils/testApp';
import { createAndLoginUser, deleteTestUser } from './utils/users/userTestUtils';
import { randomSuffix } from './utils/helpers';
import { BASE_PATH } from './utils/config/variables';
import testContainer from './utils/config/testContainer';
import ContractCollectionMongoose from '../main/repositories/mongoose/models/ContractCollectionMongoose';
import ContractMongoose from '../main/repositories/mongoose/models/ContractMongoose';
import ContractVersionMongoose from '../main/repositories/mongoose/models/ContractVersionMongoose';
import ServiceMongoose from '../main/repositories/mongoose/models/ServiceMongoose';

dotenv.config();

const sampleSummary = { totalClauses: 1, unfairClauses: 1, totalWords: 5, sectionCount: 0 };
const sampleClauses = [
  {
    term: 'We may terminate at will.',
    isUnfair: true,
    wordCount: 5,
    ltd: 0,
    ter: 0.9,
    ch: 0,
    cr: 0,
    use: 0,
    law: 0,
    j: 0,
    a: 0,
  },
];

function sampleReport(overrides: Record<string, any> = {}) {
  return {
    job_id: `job_${randomSuffix()}`,
    provider: 'Acme',
    title: 'Terms of Service',
    date: '2026-01-01',
    aggregate: {
      total_clauses: 1,
      conforming: 1,
      permissions: 1,
      prohibitions: 0,
      duties: 0,
      unfair_count: 0,
      mean_semantic_sim: 0.9,
    },
    clauses: [
      {
        clause_id: 'c1',
        clause_text: 'We may terminate at will.',
        type: 'termination',
        party: 'provider',
        action: 'terminate',
        asset: 'account',
        conforms: true,
        repair_rounds: 0,
        permissions: [],
        prohibitions: [],
        duties: [],
        unfair_terms: {},
        semantic_sim: 0.9,
        back_translated: null,
        ttl: '<urn:c1> a odrl:Rule .',
      },
    ],
    ...overrides,
  };
}

describe('POST /api/v1/contracts/:organizationId/ontology-analysis/save', () => {
  let app: TestApp;
  const usersToDelete: Set<string> = testContainer.resolve('usersToDelete');
  const contractsToDelete: Set<string> = testContainer.resolve('contractsToDelete');
  const collectionIdsToDelete: Set<string> = testContainer.resolve('collectionIdsToDelete');

  beforeAll(async () => {
    app = testContainer.resolve('app');
  });

  afterEach(async () => {
    for (const id of contractsToDelete) {
      await ContractVersionMongoose.deleteMany({ _contractId: id });
      await ContractMongoose.deleteOne({ _id: id });
    }
    contractsToDelete.clear();

    for (const id of collectionIdsToDelete) {
      await ServiceMongoose.deleteMany({ _collectionId: id });
      await ContractCollectionMongoose.deleteOne({ _id: id });
    }
    collectionIdsToDelete.clear();

    for (const username of usersToDelete) {
      await deleteTestUser(username);
    }
    usersToDelete.clear();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function setupCollection() {
    const { user, organizationId } = await createAndLoginUser('USER', `saver_${randomSuffix()}`);

    const collectionResponse = await request(app)
      .post(`${BASE_PATH}/contractCollections/${organizationId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: `Saved analyses ${randomSuffix()}` });
    collectionIdsToDelete.add(collectionResponse.body._id ?? collectionResponse.body.id);

    return { user, organizationId, collectionId: collectionResponse.body._id ?? collectionResponse.body.id };
  }

  it('creates a new Service and Contract, and a single "last"-labeled version with the full report', async () => {
    const { user, organizationId, collectionId } = await setupCollection();
    const report = sampleReport();

    const response = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        text: 'We may terminate at will.',
        report,
      });

    expect(response.status).toBe(201);
    expect(response.body.contractSlug).toBeDefined();

    const contract: any = await ContractMongoose.findOne({ slug: response.body.contractSlug });
    expect(contract).not.toBeNull();
    contractsToDelete.add(String(contract!._id));

    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id });
    expect(versions).toHaveLength(1);
    expect(versions[0].label).toBe('last');
    expect(versions[0].ontologyReport?.aggregate?.total_clauses).toBe(1);
    expect(versions[0].ontologyReport?.clauses?.[0]?.ttl).toBe('<urn:c1> a odrl:Rule .');
    expect(versions[0].summary).toBeNull();
  });

  it('falls back to reconstructing content from clause_text when no text is provided (e.g. a PDF upload)', async () => {
    const { user, organizationId, collectionId } = await setupCollection();
    const report = sampleReport();

    const response = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        report,
      });

    expect(response.status).toBe(201);
    const contract: any = await ContractMongoose.findOne({ slug: response.body.contractSlug });
    contractsToDelete.add(String(contract!._id));

    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id });
    expect(versions[0].content).toBe('We may terminate at will.');
  });

  it('reuses the existing version instead of duplicating it when the same content is saved again', async () => {
    const { user, organizationId, collectionId } = await setupCollection();

    const first = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        text: 'Identical content for hashing.',
        report: sampleReport(),
      });
    const contract: any = await ContractMongoose.findOne({ slug: first.body.contractSlug });
    contractsToDelete.add(String(contract!._id));

    const second = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        contractId: String(contract!._id),
        serviceId: String(contract!._serviceId),
        date: '2026-01-02T00:00:00.000Z',
        text: 'Identical content for hashing.',
        report: sampleReport(),
      });

    expect(second.status).toBe(201);
    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id });
    expect(versions).toHaveLength(1);
  });

  it('backfills the ontology report onto a version already saved from AI Classify with the same content', async () => {
    const { user, organizationId, collectionId } = await setupCollection();
    const text = 'Shared content across both analyses.';

    const classifyResponse = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        text,
        summary: sampleSummary,
        clauses: sampleClauses,
      });
    const contract: any = await ContractMongoose.findOne({ slug: classifyResponse.body.contractSlug });
    contractsToDelete.add(String(contract!._id));

    const ontologyResponse = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        contractId: String(contract!._id),
        serviceId: String(contract!._serviceId),
        date: '2026-01-02T00:00:00.000Z',
        text,
        report: sampleReport(),
      });

    expect(ontologyResponse.status).toBe(201);
    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id });
    expect(versions).toHaveLength(1);
    expect(versions[0].summary?.totalClauses).toBe(1);
    expect(versions[0].ontologyReport?.aggregate?.total_clauses).toBe(1);
  });

  it('backfills the AI Classify summary onto a version already saved from Ontology Analysis with the same content', async () => {
    const { user, organizationId, collectionId } = await setupCollection();
    const text = 'Shared content, ontology first this time.';

    const ontologyResponse = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        text,
        report: sampleReport(),
      });
    const contract: any = await ContractMongoose.findOne({ slug: ontologyResponse.body.contractSlug });
    contractsToDelete.add(String(contract!._id));

    const classifyResponse = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        contractId: String(contract!._id),
        serviceId: String(contract!._serviceId),
        date: '2026-01-02T00:00:00.000Z',
        text,
        summary: sampleSummary,
        clauses: sampleClauses,
      });

    expect(classifyResponse.status).toBe(201);
    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id });
    expect(versions).toHaveLength(1);
    expect(versions[0].ontologyReport?.aggregate?.total_clauses).toBe(1);
    expect(versions[0].summary?.totalClauses).toBe(1);
  });

  it('attaches the report to an explicitly-picked version and refreshes its content to the newly-analyzed text', async () => {
    const { user, organizationId, collectionId } = await setupCollection();

    const classifyResponse = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        text: 'Version A original text.',
        summary: sampleSummary,
        clauses: sampleClauses,
      });
    const contract: any = await ContractMongoose.findOne({ slug: classifyResponse.body.contractSlug });
    contractsToDelete.add(String(contract!._id));
    const versionId = classifyResponse.body.versionId;

    const ontologyResponse = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        contractId: String(contract!._id),
        serviceId: String(contract!._serviceId),
        versionId,
        date: '2026-02-01T00:00:00.000Z',
        text: 'Totally different text from a differently-extracted PDF.',
        report: sampleReport(),
      });

    expect(ontologyResponse.status).toBe(201);
    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id });
    expect(versions).toHaveLength(1);
    expect(String(versions[0]._id)).toBe(String(versionId));
    expect(versions[0].content).toBe('Totally different text from a differently-extracted PDF.');
    expect(versions[0].summary?.totalClauses).toBe(1);
    expect(versions[0].ontologyReport?.aggregate?.total_clauses).toBe(1);
  });

  it('preserves an empty unfair_terms object on a clause (Mongoose minimize would otherwise strip it)', async () => {
    const { user, organizationId, collectionId } = await setupCollection();

    const response = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        text: 'We may terminate at will.',
        report: sampleReport({ clauses: [{ ...sampleReport().clauses[0], unfair_terms: {} }] }),
      });

    expect(response.status).toBe(201);
    const contract: any = await ContractMongoose.findOne({ slug: response.body.contractSlug });
    contractsToDelete.add(String(contract!._id));

    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id });
    expect(versions[0].ontologyReport?.clauses?.[0]?.unfair_terms).toEqual({});
  });

  it('rejects a versionId without a contractId', async () => {
    const { user, organizationId, collectionId } = await setupCollection();

    const response = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        versionId: '507f1f77bcf86cd799439011',
        report: sampleReport(),
      });

    expect(response.status).toBe(422);
  });

  it('rejects saving without authentication', async () => {
    const response = await request(app)
      .post(`${BASE_PATH}/contracts/507f1f77bcf86cd799439011/ontology-analysis/save`)
      .send({});

    expect(response.status).toBe(401);
  });

  it('rejects saving without a report', async () => {
    const { user, organizationId, collectionId } = await setupCollection();

    const response = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        text: 'no report here',
      });

    expect(response.status).toBe(422);
  });
});
