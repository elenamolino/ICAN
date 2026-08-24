import { Types } from 'mongoose';
import { AnalysisSummary } from '../services/AnalysisService';

export interface LeanContract {
  name: string;
  slug?: string;
  _organizationId?: Types.ObjectId | string;
  _collectionId?: Types.ObjectId | string;
  _serviceId?: Types.ObjectId | string;
  _latestVersionId?: Types.ObjectId | string;

  version?: string;
  createdAt: Date;

  url?: string;
  content?: string;

  private: boolean;

  latestVersionSummary?: AnalysisSummary;

  // Virtual (when populate is used)
  collection?: ContractCollectionRef | string | null;
  organization?: ContractOrganization | null;
  service?: ContractCollectionRef | string | null;
}

export interface ContractCollectionRef {
  _id: Types.ObjectId | string;
  name?: string;
  slug?: string;
}

export interface ContractOrganization {
  _id: Types.ObjectId | string;
  name: string;
  displayName: string;
  avatar: string;
}
