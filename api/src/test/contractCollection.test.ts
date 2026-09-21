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

dotenv.config();

describe('Contract Collections API integration', () => {
  let app: TestApp;
  const usersToDelete: Set<string> = testContainer.resolve('usersToDelete');
  const collectionIdsToDelete: Set<string> = testContainer.resolve('collectionIdsToDelete');

  beforeAll(async () => {
    app = testContainer.resolve('app');
  });

  afterEach(async () => {
    for (const id of collectionIdsToDelete) {
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

  describe('POST /api/v1/contractCollections/:organizationId', () => {
    it('creates a contract collection for an org member', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `owner_${randomSuffix()}`);

      const response = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Collection_${randomSuffix()}`, description: 'Test collection', private: false });

      expect(response.status).toBe(201);
      expect(response.body.name).toBeDefined();
      expect(response.body.slug).toBeDefined();
      collectionIdsToDelete.add(response.body.id ?? response.body._id);
    });
  });

  describe('GET /api/v1/contractCollections/:organizationId/:collectionSlug', () => {
    it('allows anyone to read a public collection', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `pubowner_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `PublicCollection_${randomSuffix()}`, private: false });
      collectionIdsToDelete.add(createResponse.body.id ?? createResponse.body._id);

      const response = await request(app).get(
        `${BASE_PATH}/contractCollections/${organizationId}/${createResponse.body.slug}`
      );

      expect(response.status).toBe(200);
      expect(response.body.slug).toBe(createResponse.body.slug);
    });
  });

  describe('PUT /api/v1/contractCollections/:organizationId/:collectionSlug', () => {
    it('allows the owner to rename a collection', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `updater_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `ToRename_${randomSuffix()}`, private: false });
      collectionIdsToDelete.add(createResponse.body.id ?? createResponse.body._id);

      const newName = `Renamed_${randomSuffix()}`;
      const response = await request(app)
        .put(`${BASE_PATH}/contractCollections/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: newName });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe(newName);
    });
  });

  describe('Contract membership in a collection', () => {
    it('adds and removes a contract from a collection', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `member_${randomSuffix()}`);
      const collectionResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Membership_${randomSuffix()}`, private: false });
      const collectionSlug = collectionResponse.body.slug;
      collectionIdsToDelete.add(collectionResponse.body.id ?? collectionResponse.body._id);

      const contractResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `MemberContract_${randomSuffix()}`, private: false });
      const contractSlug = contractResponse.body.slug;

      const addResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}/${collectionSlug}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ contractSlug });

      expect(addResponse.status).toBe(200);

      const removeResponse = await request(app)
        .delete(`${BASE_PATH}/contractCollections/${organizationId}/${collectionSlug}/contracts/${contractSlug}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(removeResponse.status).toBe(200);

      await ContractMongoose.deleteOne({ slug: contractSlug, _organizationId: organizationId });
    });
  });

  describe('Collection visibility', () => {
    it('creates collections private by default when "private" is omitted', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `defpriv_${randomSuffix()}`);

      const response = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Defaulted_${randomSuffix()}` });

      expect(response.status).toBe(201);
      expect(response.body.private).toBe(true);
      collectionIdsToDelete.add(response.body.id ?? response.body._id);
    });

    it('lists the owner private collections but hides them from anonymous callers', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `listpriv_${randomSuffix()}`);
      const name = `Hidden_${randomSuffix()}`;
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name, private: true });
      collectionIdsToDelete.add(createResponse.body.id ?? createResponse.body._id);

      const ownerListing = await request(app)
        .get(`${BASE_PATH}/contractCollections`)
        .query({ name, limit: 50 })
        .set('Authorization', `Bearer ${user.token}`);

      expect(ownerListing.status).toBe(200);
      expect(ownerListing.body.collections.map((c: any) => c.name)).toContain(name);

      const anonymousListing = await request(app)
        .get(`${BASE_PATH}/contractCollections`)
        .query({ name, limit: 50 });

      expect(anonymousListing.status).toBe(200);
      expect(anonymousListing.body.collections.map((c: any) => c.name)).not.toContain(name);
    });

    it('reports canEdit/canDelete for the owner and denies them to anonymous callers', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `flags_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Flags_${randomSuffix()}`, private: false });
      collectionIdsToDelete.add(createResponse.body.id ?? createResponse.body._id);

      const ownerView = await request(app)
        .get(`${BASE_PATH}/contractCollections/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(ownerView.status).toBe(200);
      expect(ownerView.body.canEdit).toBe(true);
      expect(ownerView.body.canDelete).toBe(true);

      const anonymousView = await request(app).get(
        `${BASE_PATH}/contractCollections/${organizationId}/${createResponse.body.slug}`
      );

      expect(anonymousView.status).toBe(200);
      expect(anonymousView.body.canEdit).toBe(false);
      expect(anonymousView.body.canDelete).toBe(false);
    });

    it('hides a private collection detail from a user outside the organization', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `secret_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Secret_${randomSuffix()}`, private: true });
      collectionIdsToDelete.add(createResponse.body.id ?? createResponse.body._id);

      const { user: outsider } = await createAndLoginUser('USER', `outsider_${randomSuffix()}`);

      const response = await request(app)
        .get(`${BASE_PATH}/contractCollections/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(response.status).toBe(403);
    });

    it('cascades the visibility change to the contracts inside the collection', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `cascade_${randomSuffix()}`);
      const collectionResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Cascade_${randomSuffix()}`, private: false });
      const collectionSlug = collectionResponse.body.slug;
      collectionIdsToDelete.add(collectionResponse.body.id ?? collectionResponse.body._id);

      const contractResponse = await request(app)
        .post(`${BASE_PATH}/contracts/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `CascadeContract_${randomSuffix()}`, private: false });
      const contractSlug = contractResponse.body.slug;

      await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}/${collectionSlug}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ contractSlug });

      const updateResponse = await request(app)
        .put(`${BASE_PATH}/contractCollections/${organizationId}/${collectionSlug}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ private: true });

      expect(updateResponse.status).toBe(200);

      const storedContract = await ContractMongoose.findOne({ slug: contractSlug });
      expect(storedContract?.private).toBe(true);

      await ContractMongoose.deleteOne({ slug: contractSlug });
    });
  });

  describe('DELETE /api/v1/contractCollections/:organizationId/:collectionSlug', () => {
    it('allows the owner to delete a collection', async () => {
      const { user, organizationId } = await createAndLoginUser('USER', `deleter_${randomSuffix()}`);
      const createResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `ToDelete_${randomSuffix()}`, private: false });

      const response = await request(app)
        .delete(`${BASE_PATH}/contractCollections/${organizationId}/${createResponse.body.slug}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.status).toBe(200);
    });
  });
});
