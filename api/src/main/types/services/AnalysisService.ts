export type ClauseAnalysis = {
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
};

export type AnalysisSummary = {
  totalClauses: number;
  unfairClauses: number;
  totalWords: number;
  sectionCount: number | null;
};

export type AnalyzeResponse = {
  summary: AnalysisSummary;
  clauses: ClauseAnalysis[];
};
