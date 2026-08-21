import { Types } from 'mongoose';

export interface LeanContract {
  name: string;
  slug?: string;
  _organizationId?: Types.ObjectId | string;
  _collectionId?: Types.ObjectId | string;

  version?: string;
  createdAt: Date;

  url?: string;
  content?: string;

  private: boolean;

  // Virtual (when populate is used)
  collection?: ContractCollectionRef | string | null;
  organization?: ContractOrganization | null;
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
