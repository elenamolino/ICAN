import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalysisService from '../../main/services/AnalysisService';

describe('AnalysisService', () => {
  const service = new AnalysisService();
  const originalAnalyzerUrl = process.env.ANALYZER_SERVICE_URL;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.ANALYZER_SERVICE_URL = 'http://localhost:3000';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    process.env.ANALYZER_SERVICE_URL = originalAnalyzerUrl;
    vi.unstubAllGlobals();
  });

  it('forwards the text to the analyzer and returns its response', async () => {
    const analyzerResponse = {
      summary: { totalClauses: 1, unfairClauses: 1, totalWords: 11, sectionCount: 0 },
      clauses: [
        {
          term: 'We may terminate your account at any time without notice.',
          isUnfair: true,
          wordCount: 11,
          ltd: 0.12,
          ter: 0.91,
          ch: 0.08,
          cr: 0.03,
          use: 0.05,
          law: 0.01,
          j: 0.02,
          a: 0.01,
        },
      ],
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => analyzerResponse,
    });

    const result = await service.classify('We may terminate your account at any time without notice.');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/v1/analyze',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'We may terminate your account at any time without notice.' }),
      })
    );
    expect(result).toEqual(analyzerResponse);
  });

  it('throws when the analyzer service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.classify('some text')).rejects.toThrow('Analyzer service unavailable');
  });

  it('throws when the analyzer service responds with an error status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(service.classify('some text')).rejects.toThrow('Analyzer service responded with status 500');
  });

  it('throws when ANALYZER_SERVICE_URL is not configured', async () => {
    process.env.ANALYZER_SERVICE_URL = '';

    await expect(service.classify('some text')).rejects.toThrow('ANALYZER_SERVICE_URL is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
