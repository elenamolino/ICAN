import dotenv from 'dotenv';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { shutdownApp, TestApp } from './utils/testApp';
import { createAndLoginUser } from './utils/users/userTestUtils';
import { randomSuffix } from './utils/helpers';
import { createMembership } from './utils/organizations/organizationTestUtils';
import { BASE_PATH } from './utils/config/variables';
import testContainer from './utils/config/testContainer';
import OrganizationMongoose from '../main/repositories/mongoose/models/OrganizationMongoose';
import OrganizationMembershipMongoose from '../main/repositories/mongoose/models/OrganizationMembershipMongoose';
import UserMongoose from '../main/repositories/mongoose/models/UserMongoose';
import NotificationMongoose from '../main/repositories/mongoose/models/NotificationMongoose';
import ServiceMongoose from '../main/repositories/mongoose/models/ServiceMongoose';
import ContractMongoose from '../main/repositories/mongoose/models/ContractMongoose';

dotenv.config();

describe('Access control between organizations', () => {
  let app: TestApp;
  let owner: any;
  let member: any;
  let outsider: any;
  let orgId: string;
  let outsiderOrgId: string;

  const call = (method: 'get' | 'post' | 'put' | 'delete', path: string, who?: any, body?: object) => {
    const req = request(app)[method](BASE_PATH + path);
    if (who) req.set('Authorization', `Bearer ${who.token}`);
    return body ? req.send(body) : req;
  };

  beforeAll(() => {
    app = testContainer.resolve('app');
  });

  beforeEach(async () => {
    const created = await createAndLoginUser('USER', `own_${randomSuffix()}`);
    owner = created.user;
    orgId = created.organizationId;
    member = (await createAndLoginUser('USER', `mem_${randomSuffix()}`)).user;
    await createMembership(member.id, orgId, 'MEMBER');
    const other = await createAndLoginUser('USER', `out_${randomSuffix()}`);
    outsider = other.user;
    outsiderOrgId = other.organizationId;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  describe('API keys', () => {
    const createKey = (who: any, organizationId: string) =>
      call('post', `/users/${who.username}/api-keys`, who, { name: 'key', scopes: [{ organizationId, scope: 'ALL' }] });

    it('are not created for an organization of others', async () => {
      expect((await createKey(outsider, orgId)).status).toBe(403);
    });

    it('stop working when their user is not in the organization', async () => {
      const { body } = await createKey(member, orgId);
      const read = () => request(app).get(`${BASE_PATH}/orgs/${orgId}/permissions`).set('x-api-key', body.plainKey);
      expect((await read()).status).toBe(200);

      await OrganizationMembershipMongoose.deleteOne({ _userId: member.id, _organizationId: orgId });
      expect((await read()).status).toBe(403);
    });
  });

  describe('profile updates', () => {
    it.each([
      ['$set', { $set: { role: 'ADMIN' } }],
      ['$set next to a field', { firstName: 'Changed', $set: { role: 'ADMIN' } }],
      ['$rename', { $rename: { firstName: 'role' } }],
    ])('cannot change the role with %s', async (_label, body) => {
      await call('put', `/users/${outsider.username}`, outsider, body);
      expect((await UserMongoose.findById(outsider.id).lean<any>()).role).toBe('USER');
    });
  });

  describe('emails', () => {
    const emails = async (who?: any) =>
      (await call('get', `/orgs/${orgId}/members`, who)).body.map((m: any) => m.user.email).filter(Boolean);

    it('are only sent to the people of the organization', async () => {
      expect(await emails()).toEqual([]);
      expect(await emails(outsider)).toEqual([]);
      expect(await emails(member)).toHaveLength(2);
    });

    it('are not in the profile or the search results of others', async () => {
      const email = `sso_${randomSuffix()}@example.com`;
      await UserMongoose.updateOne(
        { _id: owner.id },
        { $set: { identities: [{ provider: 'scoretech', providerId: email, email }], 'settings.phone': '600000000' } }
      );
      for (const path of [`/users/${owner.username}`, `/users?q=${owner.username}`]) {
        const response = await call('get', path, outsider);
        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).toContain(owner.username);
        expect(JSON.stringify(response.body)).not.toContain(email);
        expect(JSON.stringify(response.body)).not.toContain('600000000');
      }
    });
  });

  describe('deletes', () => {
    it('do not reach the permissions of another organization', async () => {
      const { body } = await call('post', `/orgs/${orgId}/permissions`, owner, {
        userId: member.id,
        entityType: 'contract',
        entitySlug: null,
        permissions: { GET: true, PUT: false, DELETE: false, CREATE: true },
      });
      const id = body.id ?? body._id;
      expect((await call('delete', `/orgs/${outsiderOrgId}/permissions/${id}`, outsider)).status).toBe(404);
      expect((await call('delete', `/orgs/${orgId}/permissions/${id}`, owner)).status).toBe(200);
    });

    it('do not reach the invitations of another organization', async () => {
      const { body } = await call('post', `/orgs/${orgId}/invitations`, owner, {});
      expect((await call('delete', `/orgs/${outsiderOrgId}/invitations/${body.id}`, outsider)).status).toBe(404);
      expect((await call('delete', `/orgs/${orgId}/invitations/${body.id}`, owner)).status).toBe(200);
    });

    it('do not reach the notifications of another user', async () => {
      const id = new NotificationMongoose()._id;
      await NotificationMongoose.collection.insertOne({ _id: id, _userId: new UserMongoose({ _id: owner.id })._id } as any);
      expect((await call('delete', `/notifications/${id}`, outsider)).status).toBe(404);
      expect((await call('delete', `/notifications/${id}`, owner)).status).toBe(200);
    });
  });

  describe('collections', () => {
    it('leave out private contracts and their services', async () => {
      const { body: collection } = await call('post', `/contractCollections/${orgId}`, owner, {
        name: `Open ${randomSuffix()}`,
        private: false,
      });
      const collectionId = collection.id ?? collection._id;
      const service = await ServiceMongoose.create({
        name: 'HiddenProvider', slug: 'hiddenprovider', _collectionId: collectionId, _organizationId: orgId,
      });
      await ContractMongoose.create({
        name: 'HiddenProvider — Terms', slug: `hidden-${randomSuffix()}`, content: 'Secret.', private: true,
        _collectionId: collectionId, _organizationId: orgId, _serviceId: String(service._id),
      });

      for (const path of [`/contractCollections/${orgId}/${collection.slug}/services`, `/services?collectionId=${collectionId}`]) {
        for (const who of [undefined, outsider, member]) {
          expect(JSON.stringify((await call('get', path, who)).body)).not.toContain('HiddenProvider');
        }
        expect(JSON.stringify((await call('get', path, owner)).body)).toContain('HiddenProvider');
      }
    });

    it('do not list the services of a private collection to others', async () => {
      const { body } = await call('post', `/contractCollections/${orgId}`, owner, { name: `Closed ${randomSuffix()}`, private: true });
      const path = `/services?collectionId=${body.id ?? body._id}`;
      expect((await call('get', path)).status).toBe(403);
      expect((await call('get', path, outsider)).status).toBe(403);
      expect((await call('get', path, owner)).status).toBe(200);
    });
  });

  describe('invitations', () => {
    it('show their codes to owners, not to plain members', async () => {
      await call('post', `/orgs/${orgId}/invitations`, owner, {});
      expect((await call('get', `/orgs/${orgId}/invitations`, member)).status).toBe(403);
      expect((await call('get', `/orgs/${orgId}/invitations`, owner)).body).toHaveLength(1);
    });
  });

  describe('hierarchy', () => {
    const child = () => ({ name: `child-${randomSuffix()}`, displayName: `Child ${randomSuffix()}`, _parentId: orgId });

    it('takes sub-organizations only from who manages the parent', async () => {
      expect((await call('post', '/orgs', outsider, child())).status).toBe(403);
      expect((await call('post', '/orgs', member, child())).status).toBe(403);
      expect((await call('post', '/orgs', owner, child())).status).toBe(201);
    });

    it('cannot be rewritten by updating an organization', async () => {
      for (const body of [{ _parentId: orgId, ancestors: [orgId] }, { $set: { _parentId: orgId } }]) {
        await call('put', `/orgs/${outsiderOrgId}`, outsider, body);
        expect((await OrganizationMongoose.findById(outsiderOrgId).lean<any>())._parentId ?? null).toBeNull();
      }
    });
  });
});
