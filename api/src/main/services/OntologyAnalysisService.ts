import dotenv from 'dotenv';
import { splitIntoClauses } from '../utils/splitClauses';
import {
  ModelPreset,
  JobStatus,
  JobReport,
  SubmitJobMeta,
} from '../types/services/OntologyAnalysisService';

dotenv.config();

function getBaseUrl(): string {
  const url = process.env.TOS_TO_ODRL_SERVICE_URL;
  if (!url) {
    throw new Error('ERROR: TOS_TO_ODRL_SERVICE_URL is not configured');
  }
  return url;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('ERROR: Ontology-analysis service unavailable');
  }

  if (response.status === 404) {
    throw new Error('NOT FOUND: Ontology-analysis job not found');
  }

  if (!response.ok) {
    throw new Error(`ERROR: Ontology-analysis service responded with status ${response.status}`);
  }

  return (await response.json()) as T;
}

class OntologyAnalysisService {
  async listModels(): Promise<ModelPreset[]> {
    return requestJson<ModelPreset[]>(`${getBaseUrl()}/api/models`);
  }

  // The text is cut into clauses here, with the same splitter AI Classify uses, and sent to
  // tos-to-odrl as an already-structured contract so it skips its own (LLM) clause splitting.
  async submitJob(text: string, meta: SubmitJobMeta): Promise<{ jobId: string }> {
    const useCases: Record<string, { description: string }> = {};
    splitIntoClauses(text)
      .map((clause) => clause.trim())
      .filter(Boolean)
      .forEach((clause, index) => {
        useCases[`use_case_${index + 1}`] = { description: clause };
      });

    const contract = {
      PROVIDER: meta.provider || 'Unknown',
      SOURCE: 'Unknown',
      TITLE: meta.title || '',
      DATE: meta.date || 'Unknown',
      DESCRIPTION: '',
      USE_CASE_DESCRIPTIONS: useCases,
    };

    const form = new FormData();
    form.append('file', new Blob([JSON.stringify(contract)], { type: 'application/json' }), 'contract.json');
    if (meta.model) form.append('model', meta.model);
    // Always send base_url explicitly (even empty) so an OpenAI preset
    // (base_url="") isn't silently replaced by the pipeline's own default.
    form.append('base_url', meta.baseUrl ?? '');
    if (meta.runEvaluation !== undefined) {
      form.append('run_evaluation', String(meta.runEvaluation));
    }

    const result = await requestJson<{ job_id: string }>(`${getBaseUrl()}/api/jobs`, {
      method: 'POST',
      body: form,
    });
    return { jobId: result.job_id };
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    return requestJson<JobStatus>(`${getBaseUrl()}/api/jobs/${jobId}`);
  }

  async getJobReport(jobId: string): Promise<JobReport> {
    return requestJson<JobReport>(`${getBaseUrl()}/api/jobs/${jobId}/report`);
  }
}

export default OntologyAnalysisService;
