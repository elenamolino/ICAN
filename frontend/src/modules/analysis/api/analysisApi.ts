import { useAuth } from '../../auth/hooks/useAuth';

const BASE_PATH = import.meta.env.VITE_API_URL;

export interface ClauseAnalysis {
  term: string;
  isUnfair: boolean;
  wordCount: number;
  ltd: number;
  ter: number;
  ch: number;
  cr: number;
  use: number;
  law: number;
  j: number;
  a: number;
}

export interface AnalysisSummary {
  totalClauses: number;
  unfairClauses: number;
  totalWords: number;
  sectionCount: number | null;
}

export interface AnalyzeResponse {
  summary: AnalysisSummary;
  clauses: ClauseAnalysis[];
}

export function useAnalysisApi() {
  const { fetchWithInterceptor } = useAuth();

  async function classify(text: string): Promise<AnalyzeResponse> {
    const res = await fetchWithInterceptor(`${BASE_PATH}/analysis/ai-classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to analyze contract');
    }
    return res.json();
  }

  return { classify };
}
