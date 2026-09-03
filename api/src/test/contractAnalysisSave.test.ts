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

describe('POST /api/v1/contracts/:organizationId/ai-classify/save', () => {
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

  it('creates a new Service and Contract, and a single "last"-labeled version', async () => {
    const { user, organizationId, collectionId } = await setupCollection();

    const response = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        text: 'We may terminate at will.',
        summary: sampleSummary,
        clauses: sampleClauses,
      });

    expect(response.status).toBe(201);
    expect(response.body.contractSlug).toBeDefined();

    const contract: any = await ContractMongoose.findOne({ slug: response.body.contractSlug });
    expect(contract).not.toBeNull();
    contractsToDelete.add(String(contract!._id));

    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id });
    expect(versions).toHaveLength(1);
    expect(versions[0].label).toBe('last');
    expect(versions[0].summary?.totalClauses).toBe(1);
  });

  it('reuses the existing version instead of duplicating it when the same text is saved again', async () => {
    const { user, organizationId, collectionId } = await setupCollection();

    const first = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-01-01T00:00:00.000Z',
        text: 'Identical content for hashing.',
        summary: sampleSummary,
        clauses: sampleClauses,
      });
    const contract: any = await ContractMongoose.findOne({ slug: first.body.contractSlug });
    contractsToDelete.add(String(contract!._id));

    const second = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        contractId: String(contract!._id),
        serviceId: String(contract!._serviceId),
        date: '2026-01-02T00:00:00.000Z',
        text: 'Identical content for hashing.',
        summary: sampleSummary,
        clauses: sampleClauses,
      });

    expect(second.status).toBe(201);
    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id });
    expect(versions).toHaveLength(1);
  });

  it('relabels all versions by date when backfilling an older snapshot', async () => {
    const { user, organizationId, collectionId } = await setupCollection();

    const first = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: '2026-06-01T00:00:00.000Z',
        text: 'The newer snapshot text.',
        summary: sampleSummary,
        clauses: sampleClauses,
      });
    const contract: any = await ContractMongoose.findOne({ slug: first.body.contractSlug });
    contractsToDelete.add(String(contract!._id));

    await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        contractId: String(contract!._id),
        serviceId: String(contract!._serviceId),
        date: '2020-01-01T00:00:00.000Z',
        text: 'An older, backfilled snapshot text.',
        summary: sampleSummary,
        clauses: sampleClauses,
      });

    const versions = await ContractVersionMongoose.find({ _contractId: contract!._id }).sort({ capturedAt: 1 });
    expect(versions).toHaveLength(2);
    expect(versions[0].capturedAt.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(versions[0].label).toBe('first');
    expect(versions[1].label).toBe('last');
  });

  it('rejects saving without authentication', async () => {
    const response = await request(app)
      .post(`${BASE_PATH}/contracts/507f1f77bcf86cd799439011/ai-classify/save`)
      .send({});

    expect(response.status).toBe(401);
  });
});
