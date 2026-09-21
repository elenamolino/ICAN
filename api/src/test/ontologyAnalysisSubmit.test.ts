import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getApp, shutdownApp } from './utils/testApp';

const fetchMock = vi.fn();

describe('POST /analysis/ontology-analysis', () => {
  let app: any;
  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';
  const originalUrl = process.env.TOS_TO_ODRL_SERVICE_URL;

  beforeAll(async () => {
    app = await getApp();
    process.env.TOS_TO_ODRL_SERVICE_URL = 'http://tos-to-odrl.test';
  });

  afterAll(async () => {
    process.env.TOS_TO_ODRL_SERVICE_URL = originalUrl;
    await shutdownApp();
  });

  it('rejects a request without text', async () => {
    const res = await request(app).post(`${baseUrl}/analysis/ontology-analysis`).send({ provider: 'Acme' });

    expect(res.status).toBe(422);
    expect(res.body.errors.some((e: any) => e.path === 'text')).toBe(true);
  });

  it('rejects blank text', async () => {
    const res = await request(app).post(`${baseUrl}/analysis/ontology-analysis`).send({ text: '   ' });

    expect(res.status).toBe(422);
  });

  it('cuts the text and submits it to tos-to-odrl', async () => {
    const realFetch = globalThis.fetch;
    fetchMock.mockResolvedValue({ ok: true, status: 202, json: async () => ({ job_id: 'job-9' }) });
    vi.stubGlobal('fetch', (url: string, init?: any) =>
      String(url).startsWith('http://tos-to-odrl.test') ? fetchMock(url, init) : realFetch(url, init)
    );

    try {
      const res = await request(app)
        .post(`${baseUrl}/analysis/ontology-analysis`)
        .send({ text: 'You accept these terms. We may change them.', provider: 'Acme', title: 'ToS', date: '2024-01-01' });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ jobId: 'job-9' });
      const contract = JSON.parse(await (fetchMock.mock.calls[0][1].body.get('file') as File).text());
      expect(Object.keys(contract.USE_CASE_DESCRIPTIONS)).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
