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
import { openApiSpec } from '../main/docs/openapi';

dotenv.config();

const summary = { totalClauses: 1, unfairClauses: 1, totalWords: 5, sectionCount: 0 };
const clauses = [
  { term: 'We may terminate at will.', isUnfair: true, wordCount: 5, ltd: 0, ter: 0.9, ch: 0, cr: 0, use: 0, law: 0, j: 0, a: 0 },
];
const report = {
  job_id: 'job_rest',
  provider: 'Acme',
  title: 'Terms of Service',
  date: '2026-01-01',
  aggregate: {
    total_clauses: 1,
    conforming: 1,
    permissions: 1,
    prohibitions: 0,
    duties: 0,
    unfair_count: 1,
    mean_semantic_sim: null,
  },
  clauses: [
    {
      clause_id: 'use_case_1',
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
      unfair_terms: { termination: [{}] },
      semantic_sim: null,
      back_translated: null,
      ttl: '<urn:c1> a odrl:Rule .',
    },
  ],
};

describe('REST API: documentation and API-key access', () => {
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
    for (const username of usersToDelete) await deleteTestUser(username);
    usersToDelete.clear();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  describe('documentation', () => {
    it('serves the OpenAPI description without credentials', async () => {
      const res = await request(app).get(`${BASE_PATH}/docs/openapi.json`);

      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.0.3');
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining([
          '/analysis/ai-classify',
          '/analysis/ontology-analysis',
          '/analysis/ontology-analysis/{jobId}',
          '/analysis/ontology-analysis/{jobId}/report',
          '/contracts/{organizationId}/ai-classify/save',
          '/contracts/{organizationId}/ontology-analysis/save',
        ])
      );
    });

    it('describes the Ontology submit as a JSON text body, not a file upload', () => {
      const body: any = (openApiSpec.paths['/analysis/ontology-analysis'] as any).post.requestBody;

      expect(body.content['application/json'].schema.required).toEqual(['text']);
      expect(body.content['multipart/form-data']).toBeUndefined();
    });

    it('serves the Swagger UI page pointing at the spec', async () => {
      const res = await request(app).get(`${BASE_PATH}/docs`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.headers['content-security-policy']).toContain('cdn.jsdelivr.net');
      expect(res.text).toContain(`${BASE_PATH}/docs/openapi.json`);
    });
  });

  describe('with an API key', () => {
    async function setup() {
      const { user, organizationId } = await createAndLoginUser('USER', `apiuser_${randomSuffix()}`);
      usersToDelete.add(user.username);

      const collection = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `REST ${randomSuffix()}` });
      const collectionId = collection.body._id ?? collection.body.id;
      collectionIdsToDelete.add(collectionId);

      const createKey = async (scope: 'ALL' | 'VIEW') => {
        const res = await request(app)
          .post(`${BASE_PATH}/users/${user.username}/api-keys`)
          .set('Authorization', `Bearer ${user.token}`)
          .send({ name: `key ${scope}`, scopes: [{ organizationId, scope }] });
        expect(res.status).toBe(201);
        return res.body.plainKey as string;
      };

      return { user, organizationId, collectionId, createKey };
    }

    it('saves both analyses on the same version and reads them back, using only the key', async () => {
      const { organizationId, collectionId, createKey } = await setup();
      const key = await createKey('ALL');
      const target = { collectionId, serviceName: `Acme_${randomSuffix()}`, contractName: 'x', provider: 'Acme', title: 'ToS', date: '2026-01-01T00:00:00.000Z', text: 'We may terminate at will.' };

      const aiSave = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
        .set('x-api-key', key)
        .send({ ...target, summary, clauses });
      expect(aiSave.status).toBe(201);
      contractsToDelete.add(String((await ContractMongoose.findOne({ slug: aiSave.body.contractSlug }))!._id));

      const ontologySave = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}/ontology-analysis/save`)
        .set('x-api-key', key)
        .send({
          collectionId,
          serviceName: target.serviceName,
          contractId: String((await ContractMongoose.findOne({ slug: aiSave.body.contractSlug }))!._id),
          versionId: aiSave.body.versionId,
          date: target.date,
          text: target.text,
          report,
        });
      expect(ontologySave.status).toBe(201);

      const version = await request(app)
        .get(`${BASE_PATH}/contracts/${organizationId}/${aiSave.body.contractSlug}/versions/${aiSave.body.versionId}`)
        .set('x-api-key', key);
      expect(version.status).toBe(200);
      expect(version.body.summary.totalClauses).toBe(1);
      expect(version.body.ontologyReport.aggregate.total_clauses).toBe(1);
    });

    it('rejects a save without credentials', async () => {
      const { organizationId, collectionId } = await setup();

      const res = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
        .send({ collectionId, serviceName: 's', contractName: 'c', provider: 'p', title: 't', date: '2026-01-01', text: 'x', summary, clauses });

      expect(res.status).toBe(401);
    });

    it('does not let a VIEW-scoped key save', async () => {
      const { organizationId, collectionId, createKey } = await setup();
      const key = await createKey('VIEW');

      const res = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
        .set('x-api-key', key)
        .send({ collectionId, serviceName: 's', contractName: 'c', provider: 'p', title: 't', date: '2026-01-01', text: 'x', summary, clauses });

      expect(res.status).toBeGreaterThanOrEqual(401);
      expect(res.status).toBeLessThan(500);
      expect(res.status).not.toBe(201);
    });
  });
});
