import { TestCollection } from '../../types/Collections';
import ContractCollectionMongoose, { generateSlug } from '../../../main/repositories/mongoose/models/ContractCollectionMongoose';
import testContainer from '../config/testContainer';
import { createTestUser } from '../users/userTestUtils';

export type TestCollectionData = Partial<TestCollection>;

export const createTestCollection = async (params: TestCollectionData): Promise<TestCollection> => {
  const organizationId = params._organizationId || (await createTestUser('USER')).organizationId;

  const collectionName = params.name || 'Test_Collection_' + Math.random().toString(36).substring(2, 15);
  const collectionData: Omit<TestCollection, 'id'> = {
    name: collectionName,
    slug: params.slug || generateSlug(collectionName),
    description: params.description || 'This is a test collection',
    _organizationId: organizationId,
    private: params.private || false,
  };

  const collection = new ContractCollectionMongoose(collectionData);
  return collection.save().then(savedCollection => {
    testContainer.resolve('collectionIdsToDelete').add((savedCollection._id as any).toString());

    return {
      id: (savedCollection._id as any).toString(),
      ...collectionData,
    };
  });
};
