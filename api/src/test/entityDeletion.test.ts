import dotenv from 'dotenv';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { shutdownApp, TestApp } from './utils/testApp';
import { createAndLoginUser, deleteTestUser } from './utils/users/userTestUtils';
import { createMembership, cleanupOrganization } from './utils/organizations/organizationTestUtils';
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

describe('Deleting Collections, Contracts, Versions and Services', () => {
  let app: TestApp;
  const usersToDelete: Set<string> = testContainer.resolve('usersToDelete');
  const contractsToDelete: Set<string> = testContainer.resolve('contractsToDelete');
  const collectionIdsToDelete: Set<string> = testContainer.resolve('collectionIdsToDelete');
  const orgsToDelete: Set<string> = testContainer.resolve('orgsToDelete');
  const membershipsToDelete: Set<string> = testContainer.resolve('membershipsToDelete');

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

    for (const orgId of orgsToDelete) {
      await cleanupOrganization(orgId);
    }
    orgsToDelete.clear();
    membershipsToDelete.clear();

    for (const username of usersToDelete) {
      await deleteTestUser(username);
    }
    usersToDelete.clear();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function setupContractWithVersions(versionDates: string[]) {
    const { user, organizationId } = await createAndLoginUser('USER', `deleter_${randomSuffix()}`);

    const collectionResponse = await request(app)
      .post(`${BASE_PATH}/contractCollections/${organizationId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: `Deletion tests ${randomSuffix()}` });
    const collectionId = collectionResponse.body._id ?? collectionResponse.body.id;
    collectionIdsToDelete.add(collectionId);

    const first = await request(app)
      .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        collectionId,
        serviceName: `Acme_${randomSuffix()}`,
        contractName: 'x',
        provider: 'Acme',
        title: 'Terms of Service',
        date: versionDates[0],
        text: `Snapshot text for ${versionDates[0]}.`,
        summary: sampleSummary,
        clauses: sampleClauses,
      });
    const contractSlug = first.body.contractSlug;
    const contract: any = await ContractMongoose.findOne({ slug: contractSlug });
    contractsToDelete.add(String(contract!._id));
    const contractId = String(contract!._id);
    const serviceId = String(contract!._serviceId);

    const versionIds: string[] = [first.body.versionId];
    for (const date of versionDates.slice(1)) {
      const saved = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          collectionId,
          contractId,
          serviceId,
          date,
          text: `Snapshot text for ${date}.`,
          summary: sampleSummary,
          clauses: sampleClauses,
        });
      versionIds.push(saved.body.versionId);
    }

    return { user, organizationId, collectionId, contractSlug, contractId, serviceId, versionIds };
  }

  describe('DELETE /contracts/:organizationId/:contractSlug/versions/:versionId', () => {
    it('deletes the oldest version and relabels the remaining one as "last"', async () => {
      const { user, organizationId, contractSlug, contractId, versionIds } = await setupContractWithVersions([
        '2020-01-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
      ]);

      const response = await request(app)
        .delete(`${BASE_PATH}/contracts/${organizationId}/${contractSlug}/versions/${versionIds[0]}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);

      const remaining = await ContractVersionMongoose.find({ _contractId: contractId });
      expect(remaining).toHaveLength(1);
      expect(String(remaining[0]._id)).toBe(versionIds[1]);
      expect(remaining[0].label).toBe('last');

      const contract: any = await ContractMongoose.findById(contractId);
      expect(String(contract._latestVersionId)).toBe(versionIds[1]);
    });

    it('relabels a 3-version contract correctly after deleting the current "last"', async () => {
      const { user, organizationId, contractSlug, contractId, versionIds } = await setupContractWithVersions([
        '2020-01-01T00:00:00.000Z',
        '2023-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ]);

      const response = await request(app)
        .delete(`${BASE_PATH}/contracts/${organizationId}/${contractSlug}/versions/${versionIds[2]}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);

      const remaining = await ContractVersionMongoose.find({ _contractId: contractId }).sort({ capturedAt: 1 });
      expect(remaining).toHaveLength(2);
      expect(remaining[0].label).toBe('first');
      expect(remaining[1].label).toBe('last');
    });

    it('clears the contract cache fields when its only version is deleted', async () => {
      const { user, organizationId, contractSlug, contractId, versionIds } = await setupContractWithVersions([
        '2026-01-01T00:00:00.000Z',
      ]);

      const response = await request(app)
        .delete(`${BASE_PATH}/contracts/${organizationId}/${contractSlug}/versions/${versionIds[0]}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);

      const remaining = await ContractVersionMongoose.find({ _contractId: contractId });
      expect(remaining).toHaveLength(0);

      const contract: any = await ContractMongoose.findById(contractId);
      expect(contract._latestVersionId).toBeFalsy();
    });

    it('rejects deleting a version without authentication', async () => {
      const { organizationId, contractSlug, versionIds } = await setupContractWithVersions([
        '2026-01-01T00:00:00.000Z',
      ]);

      const response = await request(app).delete(
        `${BASE_PATH}/contracts/${organizationId}/${contractSlug}/versions/${versionIds[0]}`
      );

      expect(response.status).toBe(401);
    });

    it('rejects deleting a version by an org member without an explicit DELETE grant', async () => {
      const { organizationId, contractSlug, versionIds } = await setupContractWithVersions([
        '2026-01-01T00:00:00.000Z',
      ]);
      const { user: member } = await createAndLoginUser('USER', `member_${randomSuffix()}`);
      await createMembership(member.id, organizationId, 'MEMBER');

      const response = await request(app)
        .delete(`${BASE_PATH}/contracts/${organizationId}/${contractSlug}/versions/${versionIds[0]}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(response.status).toBe(403);

      const stillThere = await ContractVersionMongoose.findById(versionIds[0]);
      expect(stillThere).not.toBeNull();
    });
  });

  describe('DELETE /contracts/:organizationId/:contractSlug (cascade)', () => {
    it('also deletes all of the contract\'s versions', async () => {
      const { user, organizationId, contractSlug, contractId } = await setupContractWithVersions([
        '2020-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ]);

      const response = await request(app)
        .delete(`${BASE_PATH}/contracts/${organizationId}/${contractSlug}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);

      const remaining = await ContractVersionMongoose.find({ _contractId: contractId });
      expect(remaining).toHaveLength(0);

      contractsToDelete.delete(contractId);
    });
  });

  describe('DELETE /services/:id', () => {
    it('unlinks contracts from the service instead of deleting them, then deletes the service', async () => {
      const { user, organizationId, contractSlug, contractId, serviceId } = await setupContractWithVersions([
        '2026-01-01T00:00:00.000Z',
      ]);

      const response = await request(app)
        .delete(`${BASE_PATH}/services/${serviceId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);

      const service = await ServiceMongoose.findById(serviceId);
      expect(service).toBeNull();

      const contract: any = await ContractMongoose.findById(contractId);
      expect(contract).not.toBeNull();
      expect(contract._serviceId).toBeFalsy();

      const contractResponse = await request(app)
        .get(`${BASE_PATH}/contracts/${organizationId}/${contractSlug}`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(contractResponse.status).toBe(200);
    });

    it('rejects deleting a service without authentication', async () => {
      const { serviceId } = await setupContractWithVersions(['2026-01-01T00:00:00.000Z']);

      const response = await request(app).delete(`${BASE_PATH}/services/${serviceId}`);

      expect(response.status).toBe(401);
    });

    it('rejects deleting a service by a plain org member (owners/admins only)', async () => {
      const { organizationId, serviceId } = await setupContractWithVersions(['2026-01-01T00:00:00.000Z']);
      const { user: member } = await createAndLoginUser('USER', `member_${randomSuffix()}`);
      await createMembership(member.id, organizationId, 'MEMBER');

      const response = await request(app)
        .delete(`${BASE_PATH}/services/${serviceId}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(response.status).toBe(403);

      const service = await ServiceMongoose.findById(serviceId);
      expect(service).not.toBeNull();
    });
  });
});
