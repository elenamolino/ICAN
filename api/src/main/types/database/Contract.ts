export interface Contract {
  id: string;
  name: string;
  _collectionId?: string;
  _organizationId?: string;
  createdAt: Date;
  url?: string;
  content?: string;
}
