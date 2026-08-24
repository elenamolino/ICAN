import { useCallback } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';

const BASE_PATH = import.meta.env.VITE_API_URL;

export interface ModelPreset {
  id: string;
  label: string;
  model: string;
  base_url: string;
}

export interface JobStepInfo {
  status: 'pending' | 'running' | 'done' | 'error';
  done: number;
  total: number;
  error: string | null;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  created: string;
  finished: string | null;
  error: string | null;
  steps: Record<string, JobStepInfo>;
}

export interface DeonticEntry {
  id: string;
  actions: string[];
  targets: string[];
  assignee: string | null;
  assigner: string | null;
  description: string | null;
}

export interface ClauseReportItem {
  clause_id: string;
  clause_text: string;
  type: string;
  party: string;
  action: string;
  asset: string;
  conforms: boolean;
  repair_rounds: number;
  permissions: DeonticEntry[];
  prohibitions: DeonticEntry[];
  duties: DeonticEntry[];
  unfair_terms: Record<string, unknown[]>;
  semantic_sim: number | null;
  back_translated: string | null;
  ttl: string;
}

export interface AggregateStats {
  total_clauses: number;
  conforming: number;
  permissions: number;
  prohibitions: number;
  duties: number;
  unfair_count: number;
  mean_semantic_sim: number | null;
}

export interface JobReport {
  job_id: string;
  provider: string;
  title: string;
  date: string;
  aggregate: AggregateStats;
  clauses: ClauseReportItem[];
}

export interface SubmitJobMeta {
  provider?: string;
  title?: string;
  date?: string;
  model?: string;
  baseUrl?: string;
  runEvaluation?: boolean;
}

export function useOntologyAnalysisApi() {
  const { fetchWithInterceptor } = useAuth();

  const listModels = useCallback(async (): Promise<ModelPreset[]> => {
    const res = await fetchWithInterceptor(`${BASE_PATH}/analysis/ontology-analysis/models`);
    if (!res.ok) throw new Error('Failed to load model presets');
    return res.json();
  }, [fetchWithInterceptor]);

  const submitJob = useCallback(async (file: File, meta: SubmitJobMeta): Promise<{ jobId: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (meta.provider) formData.append('provider', meta.provider);
    if (meta.title) formData.append('title', meta.title);
    if (meta.date) formData.append('date', meta.date);
    if (meta.model) formData.append('model', meta.model);
    formData.append('baseUrl', meta.baseUrl ?? '');
    if (meta.runEvaluation !== undefined) {
      formData.append('runEvaluation', String(meta.runEvaluation));
    }

    const res = await fetchWithInterceptor(`${BASE_PATH}/analysis/ontology-analysis`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to submit the document for analysis');
    }
    return res.json();
  }, [fetchWithInterceptor]);

  const getStatus = useCallback(async (jobId: string): Promise<JobStatus> => {
    const res = await fetchWithInterceptor(`${BASE_PATH}/analysis/ontology-analysis/${jobId}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to fetch job status');
    }
    return res.json();
  }, [fetchWithInterceptor]);

  const getReport = useCallback(async (jobId: string): Promise<JobReport> => {
    const res = await fetchWithInterceptor(`${BASE_PATH}/analysis/ontology-analysis/${jobId}/report`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to fetch the report');
    }
    return res.json();
  }, [fetchWithInterceptor]);

  return { listModels, submitJob, getStatus, getReport };
}
