import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OntologyAnalysisService from '../../main/services/OntologyAnalysisService';
import { splitIntoClauses } from '../../main/utils/splitClauses';

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

  it('submits a job with the text already cut into clauses and the metadata inside the contract', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 202, json: async () => ({ job_id: 'job-123' }) });
    const text = 'We may change these terms at any time. You agree to arbitration. Fees are non-refundable.';

    const result = await service.submitJob(text, {
      provider: 'Acme',
      title: 'Terms of Service',
      date: '2024-05-01',
      model: 'gpt-4.1-mini',
      baseUrl: '',
      runEvaluation: true,
    });

    expect(result).toEqual({ jobId: 'job-123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/jobs');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);

    const file = init.body.get('file') as File;
    expect(file.name).toBe('contract.json');
    const contract = JSON.parse(await file.text());
    expect(contract).toMatchObject({ PROVIDER: 'Acme', TITLE: 'Terms of Service', DATE: '2024-05-01' });
    // Same clauses AI Classify sees: one per sentence, in order.
    expect(Object.values(contract.USE_CASE_DESCRIPTIONS).map((c: any) => c.description)).toEqual(
      splitIntoClauses(text)
    );
    expect(Object.keys(contract.USE_CASE_DESCRIPTIONS)).toEqual(['use_case_1', 'use_case_2', 'use_case_3']);
    expect(init.body.get('model')).toBe('gpt-4.1-mini');
    expect(init.body.get('base_url')).toBe('');
    expect(init.body.get('run_evaluation')).toBe('true');
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
