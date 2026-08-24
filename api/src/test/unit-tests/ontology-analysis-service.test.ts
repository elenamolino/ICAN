import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OntologyAnalysisService from '../../main/services/OntologyAnalysisService';

describe('OntologyAnalysisService', () => {
  const service = new OntologyAnalysisService();
  const originalUrl = process.env.TOS_TO_ODRL_SERVICE_URL;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.TOS_TO_ODRL_SERVICE_URL = 'http://localhost:8000';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    process.env.TOS_TO_ODRL_SERVICE_URL = originalUrl;
    vi.unstubAllGlobals();
  });

  it('lists model presets', async () => {
    const presets = [{ id: 'gpt-4.1-mini', label: 'GPT-4.1 mini (OpenAI)', model: 'gpt-4.1-mini', base_url: '' }];
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => presets });

    const result = await service.listModels();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/models', undefined);
    expect(result).toEqual(presets);
  });

  it('submits a job with the uploaded file and metadata', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 202, json: async () => ({ job_id: 'job-123' }) });

    const result = await service.submitJob(
      { buffer: Buffer.from('hello'), originalname: 'contract.txt', mimetype: 'text/plain' },
      { provider: 'Acme', model: 'gpt-4.1-mini', baseUrl: '', runEvaluation: true }
    );

    expect(result).toEqual({ jobId: 'job-123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/jobs');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws a NOT FOUND error when the job status request 404s', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(service.getJobStatus('missing-job')).rejects.toThrow('Ontology-analysis job not found');
  });

  it('throws when the report request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 425 });

    await expect(service.getJobReport('job-123')).rejects.toThrow(
      'Ontology-analysis service responded with status 425'
    );
  });

  it('throws when the service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.listModels()).rejects.toThrow('Ontology-analysis service unavailable');
  });
});
