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

  it('stores the type of a document, and files it by its type', async () => {
    const { user, organizationId } = await createAndLoginUser('USER', `type_${randomSuffix()}`);
    const auth = { Authorization: `Bearer ${user.token}` };
    const { body: collection } = await request(app).post(`${BASE_PATH}/contractCollections/${organizationId}`).set(auth)
      .send({ name: `Types ${randomSuffix()}`, private: false });
    const payload = {
      collectionId: collection.id ?? collection._id, serviceName: 'Rooms', contractName: 'x', provider: 'Acme', title: 'Uptime promise',
      date: new Date().toISOString(), text: 'We promise 99.9% uptime.', documentType: 'service-level-agreement',
      summary: { totalClauses: 1, unfairClauses: 0, totalWords: 4 }, clauses: [],
    };
    const savePath = `${BASE_PATH}/contracts/${organizationId}/ai-classify/save`;
    expect((await request(app).post(savePath).set(auth).send({ ...payload, documentType: 'poem' })).status).toBe(422);
    expect((await request(app).post(savePath).set(auth).send({ ...payload, url: 'javascript:alert(1)' })).status).toBe(422);
    const saved = await request(app).post(savePath).set(auth).send(payload);
    expect(saved.status).toBeLessThan(300);

    const contract = (await request(app).get(`${BASE_PATH}/contracts/${organizationId}/${saved.body.contractSlug}`)).body;
    expect(contract.documentType).toBe('service-level-agreement');
    const page = (await request(app).get(`${BASE_PATH}/contractCollections/${organizationId}/${collection.slug}/services?policyTypes=service-level-agreement`)).body;
    expect(page.services[0].contracts[0].documentType).toBe('service-level-agreement');

    await request(app).post(savePath).set(auth).send({ ...payload, contractId: contract.id, documentType: 'terms-of-service', text: 'v2', url: 'https://acme.example/terms' });
    expect((await request(app).get(`${BASE_PATH}/contracts/${organizationId}/${saved.body.contractSlug}`)).body.documentType).toBe('terms-of-service');
    expect((await request(app).get(`${BASE_PATH}/contracts/${organizationId}/${saved.body.contractSlug}`)).body.url).toBe('https://acme.example/terms');
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

  it('opens a whole Customer Agreement with its link, and nothing else', async () => {
    const { user, organizationId } = await createAndLoginUser('USER', `ca_${randomSuffix()}`);
    const auth = { Authorization: `Bearer ${user.token}` };
    const { body: collection } = await request(app).post(`${BASE_PATH}/contractCollections/${organizationId}`).set(auth)
      .send({ name: `Agreements ${randomSuffix()}`, private: true });
    const save = (serviceName: string, title: string, documentType: string) =>
      request(app).post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`).set(auth).send({
        collectionId: collection.id ?? collection._id, serviceName, contractName: title, provider: 'Acme', title,
        date: new Date().toISOString(), text: `${title} text.`, documentType, versionNumber: '0.1',
        summary: { totalClauses: 1, unfairClauses: 0, totalWords: 2 }, clauses: [],
      });
    const terms = await save('Rooms', 'Terms of Service', 'terms-of-service');
    await save('Rooms', 'SLA', 'service-level-agreement');
    const other = await save('Flats', 'Terms of Service', 'terms-of-service');

    const contracts = (await request(app).get(`${BASE_PATH}/contracts/${organizationId}?limit=10`).set(auth)).body.contracts;
    const serviceId = contracts.find((c: any) => c.slug === terms.body.contractSlug).service.id;
    const base = `${BASE_PATH}/contractCollections/${organizationId}/${collection.slug}/services/${serviceId}`;

    const own = (await request(app).get(base).set(auth)).body;
    expect(own.service.name).toBe('Rooms');
    expect(own.contracts.map((c: any) => [c.documentType, c.current.number]).sort()).toEqual([
      ['service-level-agreement', '0.1'],
      ['terms-of-service', '0.1'],
    ]);
    expect((await request(app).get(base)).status).toBe(403);

    const { token } = (await request(app).get(`${base}/permalink`).set(auth)).body;
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(JSON.stringify(own)).not.toContain(token);
    expect((await request(app).get(`${BASE_PATH}/permalinks/agreement/${token}`)).body).toEqual({
      organizationId, collectionSlug: collection.slug, serviceId,
    });
    expect((await request(app).get(`${base}?share=${token}`)).body.contracts).toHaveLength(2);
    expect((await request(app).get(`${base}/permalink?share=${token}`)).status).toBe(403);

    // Its documents open with it; another service's do not.
    const doc = (slug: string) => request(app).get(`${BASE_PATH}/contracts/${organizationId}/${slug}?share=${token}`);
    expect((await doc(terms.body.contractSlug)).status).toBe(200);
    expect((await doc(other.body.contractSlug)).status).toBe(404);
  });

  it('shows where a service publishes its pricing, set only by its owners', async () => {
    const { user, organizationId } = await createAndLoginUser('USER', `price_${randomSuffix()}`);
    const { user: stranger } = await createAndLoginUser('USER', `pstr_${randomSuffix()}`);
    const auth = { Authorization: `Bearer ${user.token}` };
    const { body: collection } = await request(app).post(`${BASE_PATH}/contractCollections/${organizationId}`).set(auth)
      .send({ name: `Prices ${randomSuffix()}`, private: false });
    await request(app).post(`${BASE_PATH}/contracts/${organizationId}/ai-classify/save`).set(auth).send({
      collectionId: collection.id ?? collection._id, serviceName: 'Rooms', contractName: 'Terms', provider: 'Acme', title: 'Terms',
      date: new Date().toISOString(), text: 'Text.', summary: { totalClauses: 1, unfairClauses: 0, totalWords: 1 }, clauses: [],
    });
    const [service] = (await request(app).get(`${BASE_PATH}/services?collectionId=${collection.id ?? collection._id}`)).body.services;
    const id = service.id ?? service._id;
    const url = 'https://sphere.score.us.es/p/6aff51536b77f124b0283ec2';

    expect((await request(app).put(`${BASE_PATH}/services/${id}`).set('Authorization', `Bearer ${stranger.token}`).send({ pricingUrl: url })).status).toBe(403);
    expect((await request(app).put(`${BASE_PATH}/services/${id}`).set(auth).send({ pricingUrl: 'javascript:alert(1)' })).status).toBe(422);
    expect((await request(app).put(`${BASE_PATH}/services/${id}`).set(auth).send({ pricingUrl: url })).body.pricingUrl).toBe(url);
    // The provider's own page comes apart, and leaves the SPHERE link as it was.
    const source = 'https://github.com/pricing';
    expect((await request(app).put(`${BASE_PATH}/services/${id}`).set(auth).send({ pricingSourceUrl: 'ftp://x' })).status).toBe(422);
    const updated = (await request(app).put(`${BASE_PATH}/services/${id}`).set(auth).send({ pricingSourceUrl: source })).body;
    expect(updated).toMatchObject({ pricingUrl: url, pricingSourceUrl: source });
    const agreement = (await request(app).get(`${BASE_PATH}/contractCollections/${organizationId}/${collection.slug}/services/${id}`)).body;
    expect(agreement.service).toMatchObject({ pricingUrl: url, pricingSourceUrl: source });
    expect((await request(app).put(`${BASE_PATH}/services/${id}`).set(auth).send({ pricingUrl: null })).body.pricingUrl).toBeNull();
  });
});
