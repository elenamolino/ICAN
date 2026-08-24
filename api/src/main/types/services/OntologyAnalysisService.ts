export type ModelPreset = {
  id: string;
  label: string;
  model: string;
  base_url: string;
};

export type JobStepInfo = {
  status: 'pending' | 'running' | 'done' | 'error';
  done: number;
  total: number;
  error: string | null;
};

export type JobStatus = {
  job_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  created: string;
  finished: string | null;
  error: string | null;
  steps: Record<string, JobStepInfo>;
};

export type DeonticEntry = {
  id: string;
  actions: string[];
  targets: string[];
  assignee: string | null;
  assigner: string | null;
  description: string | null;
};

export type ClauseReportItem = {
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
};

export type AggregateStats = {
  total_clauses: number;
  conforming: number;
  permissions: number;
  prohibitions: number;
  duties: number;
  unfair_count: number;
  mean_semantic_sim: number | null;
};

export type JobReport = {
  job_id: string;
  provider: string;
  title: string;
  date: string;
  aggregate: AggregateStats;
  clauses: ClauseReportItem[];
};

export type SubmitJobMeta = {
  provider?: string;
  title?: string;
  date?: string;
  model?: string;
  baseUrl?: string;
  runEvaluation?: boolean;
};

export type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};
