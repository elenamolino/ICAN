import mongoose from 'mongoose';
import { LeanOrganization } from '../../types/models/Organization';
import RepositoryBase from '../RepositoryBase';
import OrganizationMongoose from './models/OrganizationMongoose';
import ContractCollectionMongoose from './models/ContractCollectionMongoose';
import ContractMongoose from './models/ContractMongoose';

class OrganizationRepository extends RepositoryBase {
  async findAll(queryParams: any) {
    try {
      const orgs = await OrganizationMongoose.find().sort({ createdAt: -1 });
      return orgs.map(org => org.toObject());
    } catch {
      return [];
    }
  }
  
  async findOne(filter: any) {
    try {
      const org = await OrganizationMongoose.findOne(filter).exec();
      return org ? org.toObject() : null;
    } catch {
      return null;
    }
  }

  async findById(id: string) {
    try {
      const org = await OrganizationMongoose.findById(id).populate('subOrganizations');
      return org ? org.toObject() : null;
    } catch {
      return null;
    }
  }

  async create(data: any): Promise<LeanOrganization> {
    const org = await new OrganizationMongoose(data).save();
    return org.toObject<LeanOrganization>();
  }

  async update(id: string, data: any) {
    const org = await OrganizationMongoose.findOneAndUpdate({ _id: id }, data, { new: true });
    return org ? org.toObject() : null;
  }

  async destroy(id: string) {
    const result = await OrganizationMongoose.deleteOne({ _id: id });
    return result?.deletedCount === 1;
  }

  async findExistingSlug(name: string): Promise<boolean> {
    const existing = await OrganizationMongoose.findOne({ name }).collation({ locale: 'en', strength: 2 }).lean();
    return existing !== null;
  }

  /** Whether any collection or contract belongs to the organization. */
  async hasContent(organizationId: string): Promise<boolean> {
    const filter = { _organizationId: new mongoose.Types.ObjectId(organizationId) };
    const [collection, contract] = await Promise.all([
      ContractCollectionMongoose.exists(filter),
      ContractMongoose.exists(filter),
    ]);
    return Boolean(collection || contract);
  }

  async findChildOrganizationIds(parentId: string): Promise<string[]> {
    const children = await OrganizationMongoose.find({ _parentId: new mongoose.Types.ObjectId(parentId) })
      .select('_id')
      .lean();
    return children.map((c: any) => c._id.toString());
  }
}

export default OrganizationRepository;
