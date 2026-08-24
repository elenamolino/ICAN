import { Types } from 'mongoose';
import { AnalysisSummary, ClauseAnalysis } from '../services/AnalysisService';

export type ContractVersionLabel = 'first' | 'intermediate' | 'last';

export interface LeanContractVersion {
  _id?: Types.ObjectId | string;
  _contractId: Types.ObjectId | string;
  commitHash: string;
  capturedAt: Date;
  label: ContractVersionLabel;
  content: string;
  insertions?: number | null;
  deletions?: number | null;
  summary?: AnalysisSummary | null;
  clauses?: ClauseAnalysis[] | null;
  analysisSkipped: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
