import dotenv from 'dotenv';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { shutdownApp, TestApp } from './utils/testApp';
import { createAndLoginUser, deleteTestUser } from './utils/users/userTestUtils';
import { randomSuffix } from './utils/helpers';
import { createMembership, createTestOrganization } from './utils/organizations/organizationTestUtils';
import EntityPermissionMongoose from '../main/repositories/mongoose/models/EntityPermissionMongoose';
import OrganizationMongoose from '../main/repositories/mongoose/models/OrganizationMongoose';
import { BASE_PATH } from './utils/config/variables';
import testContainer from './utils/config/testContainer';
import ContractCollectionMongoose from '../main/repositories/mongoose/models/ContractCollectionMongoose';
import ContractMongoose from '../main/repositories/mongoose/models/ContractMongoose';
import ServiceMongoose from '../main/repositories/mongoose/models/ServiceMongoose';

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

  describe('GET /api/v1/contractCollections/:organizationId/:collectionSlug/services', () => {
    async function createCollectionWithServices(isPrivate: boolean, serviceCount: number) {
      const { user, organizationId } = await createAndLoginUser('USER', `paged_${randomSuffix()}`);
      const collectionResponse = await request(app)
        .post(`${BASE_PATH}/contractCollections/${organizationId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: `Paged_${randomSuffix()}`, private: isPrivate });
      const collectionId = collectionResponse.body.id ?? collectionResponse.body._id;
      collectionIdsToDelete.add(collectionId);

      const services = await ServiceMongoose.insertMany(
        Array.from({ length: serviceCount }, (_, i) => ({
          name: `Service ${String(i).padStart(2, '0')}`,
          slug: `service-${i}`,
          _collectionId: String(collectionId),
          _organizationId: organizationId,
        }))
      );
      await ContractMongoose.insertMany(
        services.map((service, i) => ({
          name: `Service ${String(i).padStart(2, '0')} — Privacy Policy`,
          slug: `paged-contract-${i}-${randomSuffix()}`,
          _collectionId: String(collectionId),
          _serviceId: String(service._id),
          _organizationId: organizationId,
          content: 'Full text that the page does not need. '.repeat(100),
          private: isPrivate,
        }))
      );

      return { user, organizationId, collectionId: String(collectionId), slug: collectionResponse.body.slug };
    }

    afterEach(async () => {
      await ServiceMongoose.deleteMany({ name: /^Service \d\d$/, slug: /^service-\d+$/ });
      await ContractMongoose.deleteMany({ slug: /^paged-contract-/ });
    });

    it('returns the services ten at a time, with their documents but not their text', async () => {
      const { organizationId, slug } = await createCollectionWithServices(false, 12);
      const url = `${BASE_PATH}/contractCollections/${organizationId}/${slug}/services`;

      const firstPage = await request(app).get(url);
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.total).toBe(12);
      expect(firstPage.body.services).toHaveLength(10);
      expect(firstPage.body.services[0].name).toBe('Service 00');
      expect(firstPage.body.services[0].contracts).toHaveLength(1);
      expect(firstPage.body.services[0].contracts[0].content).toBeUndefined();
      expect(firstPage.body.services[0].contracts[0].service.slug).toBe('service-0');
      expect(firstPage.body.facets.documents).toEqual({ 'with-documents': 12, empty: 0 });

      const secondPage = await request(app).get(`${url}?offset=10`);
      expect(secondPage.body.services.map((s: any) => s.name)).toEqual(['Service 10', 'Service 11']);
    });

    it('searches by service name', async () => {
      const { organizationId, slug } = await createCollectionWithServices(false, 12);

      const response = await request(app)
        .get(`${BASE_PATH}/contractCollections/${organizationId}/${slug}/services?name=service 1`);

      expect(response.body.services.map((s: any) => s.name)).toEqual(['Service 10', 'Service 11']);
    });

    it('rejects an invalid limit or filter value', async () => {
      const { organizationId, slug } = await createCollectionWithServices(false, 1);
      const url = `${BASE_PATH}/contractCollections/${organizationId}/${slug}/services`;

      expect((await request(app).get(`${url}?limit=500`)).status).toBe(422);
      expect((await request(app).get(`${url}?review=bogus`)).status).toBe(422);
    });

    it('hides the services of a private collection from a user outside the organization', async () => {
      const { organizationId, slug } = await createCollectionWithServices(true, 1);
      const { user: outsider } = await createAndLoginUser('USER', `outsider_${randomSuffix()}`);

      const response = await request(app)
        .get(`${BASE_PATH}/contractCollections/${organizationId}/${slug}/services`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(response.status).toBe(403);
    });

    it('no longer embeds the contracts in the collection detail, only their count', async () => {
      const { organizationId, slug } = await createCollectionWithServices(false, 3);

      const response = await request(app).get(`${BASE_PATH}/contractCollections/${organizationId}/${slug}`);

      expect(response.body.contractCount).toBe(3);
      expect(response.body.contracts).toBeUndefined();
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

  describe('Organization ownership', () => {
    const call = (method: 'get' | 'post' | 'put' | 'delete', path: string, token: string, body?: object) => {
      const pending = request(app)[method](`${BASE_PATH}${path}`).set('Authorization', `Bearer ${token}`);
      return body ? pending.send(body) : pending;
    };

    async function setUp() {
      const { user, organizationId: source } = await createAndLoginUser('USER', `owner_${randomSuffix()}`);
      const target = (await createTestOrganization(user.token)).id;
      const created = await call('post', `/contractCollections/${source}`, user.token, {
        name: `Coll ${randomSuffix()}`,
        private: true,
      });
      expect(created.status).toBe(201);
      const { id, slug, name } = created.body;
      collectionIdsToDelete.add(id);
      const service = await ServiceMongoose.create({
        name: 'Service',
        slug: 'service',
        _collectionId: id,
        _organizationId: source,
      });
      const contract = await ContractMongoose.create({
        name: 'Terms',
        slug: `terms-${randomSuffix()}`.toLowerCase(),
        _collectionId: id,
        _organizationId: source,
        _serviceId: String(service._id),
        private: true,
        url: '',
        content: 'Text.',
      });
      return { user, source, target, id, slug, name, service, contract };
    }

    type SetUp = Awaited<ReturnType<typeof setUp>>;
    const transfer = ({ source, slug, target }: SetUp, token: string, organizationId: string = target) =>
      call('post', `/contractCollections/${source}/${slug}/transfer`, token, { organizationId });

    async function organizationsOf({ id, service, contract }: SetUp) {
      const found: any[] = await Promise.all([
        ContractCollectionMongoose.findById(id).lean(),
        ServiceMongoose.findById(service._id).lean(),
        ContractMongoose.findById(contract._id).lean(),
      ]);
      return found.map(document => String(document._organizationId));
    }

    it('moves the collection with its services and contracts, keeping it private', async () => {
      const data = await setUp();
      const { user, source, target, slug, contract } = data;

      const response = await transfer(data, user.token);

      expect(response.status).toBe(200);
      expect(response.body.private).toBe(true);
      expect(await organizationsOf(data)).toEqual([target, target, target]);
      expect((await call('get', `/contracts/${target}/${contract.slug}`, user.token)).status).toBe(200);
      expect((await call('get', `/contractCollections/${source}/${slug}`, user.token)).status).toBe(404);
      expect((await request(app).get(`${BASE_PATH}/contractCollections/${target}/${slug}`)).status).toBe(403);
    });

    it('drops grants on the moved entities at both ends and keeps the others', async () => {
      const data = await setUp();
      const { user, source, target, slug, contract } = data;
      const grant = (organization: string, entityType: string, entitySlug: string | null) => ({
        _userId: user.id,
        _organizationId: organization,
        entityType,
        entitySlug,
        permissions: { GET: true, PUT: true, DELETE: true, CREATE: true },
      });
      await EntityPermissionMongoose.create([
        grant(source, 'contractCollection', slug),
        grant(target, 'contract', contract.slug as string),
        grant(source, 'contract', 'another-contract'),
      ]);

      expect((await transfer(data, user.token)).status).toBe(200);

      const left: any[] = await EntityPermissionMongoose.find({ _userId: user.id }).lean();
      expect(left.map(permission => permission.entitySlug)).toEqual(['another-contract']);
    });

    it('refuses a move by a MEMBER of the source', async () => {
      const data = await setUp();
      const { user: member } = await createAndLoginUser('USER', `member_${randomSuffix()}`);
      const ownOrg = (await createTestOrganization(member.token)).id;
      await createMembership(member.id, data.source, 'MEMBER');

      expect((await transfer(data, member.token, ownOrg)).status).toBe(403);
      expect(await organizationsOf(data)).toEqual([data.source, data.source, data.source]);
    });

    it('refuses a move into an organization where the user is only a MEMBER', async () => {
      const data = await setUp();
      const { user: other } = await createAndLoginUser('USER', `other_${randomSuffix()}`);
      const otherOrg = (await createTestOrganization(other.token)).id;
      await createMembership(data.user.id, otherOrg, 'MEMBER');

      expect((await transfer(data, data.user.token, otherOrg)).status).toBe(403);
      expect(await organizationsOf(data)).toEqual([data.source, data.source, data.source]);
    });

    it('refuses a move by someone outside the source', async () => {
      const data = await setUp();
      const { user: outsider } = await createAndLoginUser('USER', `out_${randomSuffix()}`);
      const ownOrg = (await createTestOrganization(outsider.token)).id;

      expect((await transfer(data, outsider.token, ownOrg)).status).toBe(403);
    });

    it('refuses an invalid target and the organization it is already in', async () => {
      const data = await setUp();

      expect((await transfer(data, data.user.token, 'not-an-id')).status).toBe(422);
      expect((await transfer(data, data.user.token, data.source)).status).toBe(422);
    });

    it('requires signing in to move', async () => {
      const { source, target, slug } = await setUp();
      const response = await request(app)
        .post(`${BASE_PATH}/contractCollections/${source}/${slug}/transfer`)
        .send({ organizationId: target });

      expect(response.status).toBe(401);
    });

    it('refuses a move onto a collection with the same name', async () => {
      const data = await setUp();
      const twin = await call('post', `/contractCollections/${data.target}`, data.user.token, { name: data.name });
      collectionIdsToDelete.add(twin.body.id);

      expect((await transfer(data, data.user.token)).status).toBe(409);
    });

    it('refuses a move onto a contract with the same slug', async () => {
      const data = await setUp();
      await ContractMongoose.create({
        name: 'Terms',
        slug: data.contract.slug,
        _organizationId: data.target,
        private: true,
        url: '',
        content: 'Other.',
      });

      expect((await transfer(data, data.user.token)).status).toBe(409);
      expect(await organizationsOf(data)).toEqual([data.source, data.source, data.source]);
    });

    it('puts everything back when a step of the move fails', async () => {
      const data = await setUp();
      const original = ContractMongoose.updateMany;
      let failed = false;
      (ContractMongoose as any).updateMany = function (...args: any[]) {
        if (!failed) {
          failed = true;
          return Promise.reject(new Error('Simulated failure'));
        }
        return (original as any).apply(this, args);
      };

      try {
        expect((await transfer(data, data.user.token)).status).toBe(500);
      } finally {
        (ContractMongoose as any).updateMany = original;
      }
      expect(await organizationsOf(data)).toEqual([data.source, data.source, data.source]);
    });

    it('says who can move it', async () => {
      const { user, source, slug } = await setUp();
      const { user: member } = await createAndLoginUser('USER', `member_${randomSuffix()}`);
      await createMembership(member.id, source, 'MEMBER');
      const path = `/contractCollections/${source}/${slug}`;

      expect((await call('get', path, user.token)).body.canMove).toBe(true);
      expect((await call('get', path, member.token)).body.canMove).not.toBe(true);
    });

    it('ignores the organization when editing a collection', async () => {
      const data = await setUp();
      const path = `/contractCollections/${data.source}/${data.slug}`;

      for (const _organizationId of [null, data.target]) {
        await call('put', path, data.user.token, { description: 'Edited', _organizationId });
        expect((await organizationsOf(data))[0]).toBe(data.source);
      }
    });

    it('ignores the organization and collection when editing a contract', async () => {
      const data = await setUp();
      const response = await call('put', `/contracts/${data.source}/${data.contract.slug}`, data.user.token, {
        version: '2',
        _organizationId: data.target,
        _collectionId: null,
      });

      expect(response.status).toBe(200);
      const stored: any = await ContractMongoose.findById(data.contract._id).lean();
      expect(String(stored._organizationId)).toBe(data.source);
      expect(stored._collectionId).toBe(data.id);
    });

    it('does not create a contract in a collection of another organization', async () => {
      const { user, target, id } = await setUp();
      const response = await call('post', `/contracts/${target}`, user.token, {
        name: `Stray ${randomSuffix()}`,
        content: 'Text.',
        private: true,
        collectionId: id,
      });

      expect(response.status).toBe(404);
    });

    it('does not save a collection without an organization', async () => {
      const orphan = new ContractCollectionMongoose({ name: 'Orphan', slug: 'orphan' });

      await expect(orphan.validate()).rejects.toThrow(/_organizationId/);
    });

    it('does not delete an organization that still has content', async () => {
      const data = await setUp();
      expect((await transfer(data, data.user.token)).status).toBe(200);

      expect((await call('delete', `/orgs/${data.target}`, data.user.token)).status).toBe(409);
      expect(await OrganizationMongoose.findById(data.target)).not.toBeNull();
    });

    it('does not delete a user whose personal organization has content, nor half delete it', async () => {
      const { user, source, target } = await setUp();

      expect((await call('delete', `/users/${user.username}`, user.token)).status).toBe(409);
      expect(await OrganizationMongoose.findById(source)).not.toBeNull();
      expect(await OrganizationMongoose.findById(target)).not.toBeNull();
      expect((await call('get', '/users/me', user.token)).status).toBe(200);
    });
  });
});
