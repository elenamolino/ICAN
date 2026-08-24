import { Types } from 'mongoose';

export interface LeanService {
  name: string;
  slug?: string;
  _collectionId: Types.ObjectId | string;
  _organizationId: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}
