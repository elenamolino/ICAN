import dotenv from 'dotenv';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shutdownApp, TestApp } from './utils/testApp';
import { createAndLoginUser } from './utils/users/userTestUtils';
import { randomSuffix } from './utils/helpers';
import { BASE_PATH } from './utils/config/variables';
import testContainer from './utils/config/testContainer';

dotenv.config();

describe('Contract permalinks and version numbers', () => {
  let app: TestApp;

  beforeAll(() => {
    app = testContainer.resolve('app');
  });

  afterAll(async () => {
    await shutdownApp();
  });

  it('numbers versions, and opens a private contract to who has its link', async () => {
    const { user, organizationId } = await createAndLoginUser('USER', `link_${randomSuffix()}`);
    const post = (path: string, body: object) =>
      request(app).post(BASE_PATH + path).set('Authorization', `Bearer ${user.token}`).send(body);

    const { body: collection } = await post(`/contractCollections/${organizationId}`, { name: `Links ${randomSuffix()}`, private: true });
    const payload = {
      collectionId: collection.id ?? collection._id,
      serviceName: 'Rooms', contractName: 'Draft', provider: 'Unnamed company', title: 'Terms',
      date: new Date().toISOString(), text: 'Last updated: [date].', versionNumber: '0.1',
      summary: { totalClauses: 1, unfairClauses: 0, totalWords: 3 }, clauses: [],
    };
    const savePath = `/contracts/${organizationId}/ai-classify/save`;
    expect((await post(savePath, { ...payload, versionNumber: 'one' })).status).toBe(422);
    const saved = await post(savePath, payload);
    expect(saved.status).toBeLessThan(300);

    const base = `${BASE_PATH}/contracts/${organizationId}/${saved.body.contractSlug}`;
    const get = (url: string) => request(app).get(url).set('Authorization', `Bearer ${user.token}`);
    expect((await get(`${base}/versions`)).body.versions[0].number).toBe('0.1');

    const contract = (await get(base)).body;
    const { token } = (await get(`${base}/permalink`)).body;
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect((await get(`${base}/permalink`)).body.token).toBe(token);

    // The secret is in no other answer, and the id, which can be guessed, opens nothing.
    for (const url of [base, `${base}/versions`, `${BASE_PATH}/contracts/${organizationId}`]) {
      expect(JSON.stringify((await get(url)).body)).not.toContain(token);
    }
    const anonymous = (url: string) => request(app).get(url);
    const link = `${BASE_PATH}/permalinks/contract`;
    expect((await anonymous(`${link}/${contract.id}`)).status).toBe(404);
    expect((await anonymous(`${link}/${'0'.repeat(32)}`)).status).toBe(404);
    expect((await anonymous(`${link}/${token}`)).body).toEqual({ organizationId, contractSlug: saved.body.contractSlug });

    // Without login, the secret opens the private contract and its versions, only to read.
    const versionPath = `${base}/versions/${saved.body.versionId}`;
    for (const url of [base, `${base}/versions`, versionPath]) {
      expect((await anonymous(url)).status).toBe(404);
      expect((await anonymous(`${url}?share=${'0'.repeat(32)}`)).status).toBe(404);
      expect((await anonymous(`${url}?share[$ne]=x`)).status).toBe(404);
      expect((await anonymous(`${url}?share=${token}`)).status).toBe(200);
    }
    expect((await anonymous(`${base}?share=${token}`)).body.canEdit).toBe(false);
    expect((await anonymous(`${base}/permalink?share=${token}`)).status).toBe(404);

    const { user: stranger } = await createAndLoginUser('USER', `reader_${randomSuffix()}`);
    const asStranger = (method: 'get' | 'put' | 'delete', url: string) =>
      request(app)[method](url).set('Authorization', `Bearer ${stranger.token}`);
    expect((await asStranger('get', `${base}?share=${token}`)).body.canEdit).toBe(false);
    expect((await asStranger('put', `${base}?share=${token}`).send({ name: 'Taken' })).status).toBe(403);
    expect((await asStranger('delete', `${versionPath}?share=${token}`)).status).toBeGreaterThanOrEqual(403);

    // It opens that contract and no other.
    const other = await post(savePath, { ...payload, title: 'Other', contractName: 'Other', text: 'Another text.' });
    const otherUrl = `${BASE_PATH}/contracts/${organizationId}/${other.body.contractSlug}`;
    expect((await anonymous(`${otherUrl}?share=${token}`)).status).toBe(404);

    const renamed = await request(app).put(base).set('Authorization', `Bearer ${user.token}`).send({ name: `Renamed ${randomSuffix()}` });
    expect(renamed.status).toBe(200);
    expect((await anonymous(`${link}/${token}`)).body.contractSlug).toBe(renamed.body.slug);
  });
});
