import dotenv from 'dotenv';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { shutdownApp, TestApp } from './utils/testApp';
import { createAndLoginUser, deleteTestUser } from './utils/users/userTestUtils';
import { createEntityScopedPermission, createMembership } from './utils/organizations/organizationTestUtils';
import { randomSuffix } from './utils/helpers';
import { BASE_PATH } from './utils/config/variables';
import testContainer from './utils/config/testContainer';
import ContractMongoose from '../main/repositories/mongoose/models/ContractMongoose';

dotenv.config();

describe('Contracts API integration', () => {
  let app: TestApp;
  const usersToDelete: Set<string> = testContainer.resolve('usersToDelete');
  const contractsToDelete: Set<string> = testContainer.resolve('contractsToDelete');

  beforeAll(async () => {
    app = testContainer.resolve('app');
  });

  afterEach(async () => {
    for (const id of contractsToDelete) {
      await ContractMongoose.deleteOne({ _id: id });
    }
    contractsToDelete.clear();

    for (const username of usersToDelete) {
      await deleteTestUser(username);
    }
    usersToDelete.clear();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  describe('POST /api/v1/contracts/:organizationId', () => {
    it('creates a public contract for an org member', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `owner_${randomSuffix()}`);

      const response = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Contract_${randomSuffix()}`, private: false, content: 'Example ToS text' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBeDefined();
      expect(response.body.slug).toBeDefined();
      contractsToDelete.add(response.body._id ?? response.body.id);
    });

    it('rejects creation without authentication', async () => {
      const { organizationId } = await createAndLoginUser('USER', `noauth_${randomSuffix()}`);

      const response = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .send({ name: `Contract_${randomSuffix()}`, private: false });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/contracts/:organizationId/:contractSlug', () => {
    it('allows anyone to read a public contract', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `pubowner_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `PublicContract_${randomSuffix()}`, private: false });
      contractsToDelete.add(createResponse.body._id ?? createResponse.body.id);

      const response = await request(app).get(
        `${BASE_PATH}/contracts/${organizationId}/${createResponse.body.slug}`
      );

      expect(response.status).toBe(200);
      expect(response.body.slug).toBe(createResponse.body.slug);
    });

    it('denies reading a private contract without permission', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `privowner_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `PrivateContract_${randomSuffix()}`, private: true });
      contractsToDelete.add(createResponse.body._id ?? createResponse.body.id);

      const { user: outsider } = await createAndLoginUser('USER', `outsider_${randomSuffix()}`);

      const response = await request(app)
        .get(`${BASE_PATH}/contracts/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(response.status).toBe(404);
    });

    it('allows an org member to read a private contract in their organization', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `privowner2_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `PrivateContract2_${randomSuffix()}`, private: true });
      contractsToDelete.add(createResponse.body._id ?? createResponse.body.id);

      const { user: member } = await createAndLoginUser('USER', `member_${randomSuffix()}`);
      await createMembership(member.id, organizationId, 'MEMBER');
      // Membership alone is not enough for a private contract: it takes an explicit
      // GET grant (or being OWNER/ADMIN of the organization).
      await createEntityScopedPermission(
        member.id,
        organizationId,
        createResponse.body.slug,
        'contract',
        { GET: true, PUT: false, DELETE: false, CREATE: false }
      );

      const response = await request(app)
        .get(`${BASE_PATH}/contracts/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(response.status).toBe(200);
    });

    it('hides a private contract from an org member without an explicit grant', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `privowner3_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `PrivateContract3_${randomSuffix()}`, private: true });
      contractsToDelete.add(createResponse.body._id ?? createResponse.body.id);

      const { user: member } = await createAndLoginUser('USER', `plainmember_${randomSuffix()}`);
      await createMembership(member.id, organizationId, 'MEMBER');

      const response = await request(app)
        .get(`${BASE_PATH}/contracts/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(response.status).toBe(404);
    });

    it('reports canEdit/canDelete for the owner, and denies them to a read-only member', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `flagsowner_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Flags_${randomSuffix()}`, private: true });
      contractsToDelete.add(createResponse.body._id ?? createResponse.body.id);

      const ownerView = await request(app)
        .get(`${BASE_PATH}/contracts/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(ownerView.status).toBe(200);
      expect(ownerView.body.canEdit).toBe(true);
      expect(ownerView.body.canDelete).toBe(true);

      const { user: reader } = await createAndLoginUser('USER', `reader_${randomSuffix()}`);
      await createMembership(reader.id, organizationId, 'MEMBER');
      await createEntityScopedPermission(
        reader.id,
        organizationId,
        createResponse.body.slug,
        'contract',
        { GET: true, PUT: false, DELETE: false, CREATE: false }
      );

      const readerView = await request(app)
        .get(`${BASE_PATH}/contracts/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${reader.token}`);

      expect(readerView.status).toBe(200);
      expect(readerView.body.canEdit).toBe(false);
      expect(readerView.body.canDelete).toBe(false);
    });
  });

  describe('PUT /api/v1/contracts/:organizationId/:contractSlug', () => {
    it('allows the owner to update a contract', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `updater_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `ToUpdate_${randomSuffix()}`, private: false });
      contractsToDelete.add(createResponse.body._id ?? createResponse.body.id);

      const newName = `Updated_${randomSuffix()}`;
      const response = await request(app)
        .put(`${BASE_PATH}/contracts/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: newName });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe(newName);
    });
  });

  describe('DELETE /api/v1/contracts/:organizationId/:contractSlug', () => {
    it('allows the owner to delete a contract', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `deleter_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `ToDelete_${randomSuffix()}`, private: false });

      const response = await request(app)
        .delete(`${BASE_PATH}/contracts/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/v1/contracts', () => {
    it('lists public contracts without authentication', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `lister_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Listed_${randomSuffix()}`, private: false });
      contractsToDelete.add(createResponse.body._id ?? createResponse.body.id);

      const response = await request(app).get(`${BASE_PATH}/contracts`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.contracts)).toBe(true);
    });
  });
});
