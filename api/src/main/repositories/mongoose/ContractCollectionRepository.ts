import mongoose from 'mongoose';
import RepositoryBase from '../RepositoryBase';
import ContractCollectionMongoose from './models/ContractCollectionMongoose';
import ContractMongoose from './models/ContractMongoose';
import { RetrievedContractCollection } from '../../types/database/ContractCollection';
import { CollectionIndexQueryParams } from '../../types/services/ContractCollection';
import { OrgUserPermissionsContext } from '../../types/policies';
import { processFileUris } from '../../services/FileService';
import { escapeRegex } from '../../utils/regex';

class ContractCollectionRepository extends RepositoryBase {
  private _buildVisibilityFilter(
    organizationId: string | undefined,
    permissions?: OrgUserPermissionsContext,
    writableOnly?: boolean
  ): Record<string, any> {
    const filter: Record<string, any> = {};
    if (organizationId) {
      filter._organizationId = new mongoose.Types.ObjectId(organizationId);
    }

    if (!permissions) {
      filter.private = false;
      return filter;
    }

    if (permissions.isGlobalAdmin) return filter;

    filter.$or = [
      ...(permissions.adminOrgIds.length > 0
        ? [{ _organizationId: { $in: permissions.adminOrgIds.map(id => new mongoose.Types.ObjectId(id)) } }]
        : []),
      { private: false },
      { slug: { $in: writableOnly ? permissions.collectionsWritable ?? [] : permissions.collections } },
    ];

    return filter;
  }

  async findAll(
    queryParams: CollectionIndexQueryParams,
    permissions: OrgUserPermissionsContext
  ): Promise<{ collections: any[]; total: number }> {
    return this._find(undefined, permissions, queryParams);
  }

  async findByOrganizationId(
    organizationId: string,
    permissions: OrgUserPermissionsContext | undefined,
    queryParams: CollectionIndexQueryParams = { limit: 10, offset: 0 }
  ) {
    return this._find(organizationId, permissions, queryParams);
  }

  private async _find(
    organizationId: string | undefined,
    permissions: OrgUserPermissionsContext | undefined,
    queryParams: CollectionIndexQueryParams
  ): Promise<{ collections: any[]; total: number }> {
    const filter = this._buildVisibilityFilter(organizationId, permissions, queryParams.writableOnly);

    if (queryParams.name) {
      filter.name = { $regex: escapeRegex(queryParams.name), $options: 'i' };
    }
    if (queryParams.organizationIds) {
      filter._organizationId = { $in: queryParams.organizationIds.map(id => new mongoose.Types.ObjectId(id)) };
    }

    const sortField = queryParams.sortBy === 'name' ? 'name' : 'createdAt';
    const sortOrder = queryParams.sort === 'asc' ? 1 : -1;

    const total = await ContractCollectionMongoose.countDocuments(filter);
    const query = ContractCollectionMongoose.find(filter)
      .populate('organization', 'name displayName avatar')
      .sort({ [sortField]: sortOrder, _id: 1 });

    if (typeof queryParams.offset !== 'undefined') query.skip(queryParams.offset);
    if (typeof queryParams.limit !== 'undefined') query.limit(queryParams.limit);

    const collections = (await query.exec()).map(c => ({ ...c.toObject(), id: String(c._id) }));
    collections.forEach((c: any) => {
      if (c.organization) processFileUris(c.organization, ['avatar']);
    });

    return { collections, total };
  }

  async findById(id: string): Promise<RetrievedContractCollection | null> {
    try {
      const collection = await ContractCollectionMongoose.findById(id)
        .populate('organization', { name: 1, displayName: 1, avatar: 1, id: 1 })
        .exec();
      if (!collection) return null;
      return collection.toObject<RetrievedContractCollection>();
    } catch {
      return null;
    }
  }

  async findByOrganizationAndSlug(organizationId: string, slug: string): Promise<any> {
    try {
      const collection = await ContractCollectionMongoose.findOne({
        slug,
        _organizationId: new mongoose.Types.ObjectId(organizationId),
      }).populate('organization', { name: 1, displayName: 1, avatar: 1, id: 1 });

      if (!collection) return null;

      const contracts = await ContractMongoose.find({ _collectionId: String(collection._id) });

      return {
        ...collection.toObject(),
        id: String(collection._id),
        contracts,
      };
    } catch {
      return null;
    }
  }

  async findCollectionContractsByOrganization(slug: string, organizationId: string) {
    const collection = await ContractCollectionMongoose.findOne({
      slug,
      _organizationId: new mongoose.Types.ObjectId(organizationId),
    });
    if (!collection) return null;

    const contracts = await ContractMongoose.find({ _collectionId: String(collection._id) });
    return { _id: collection._id, contracts };
  }

  async create(data: Record<string, any>) {
    const collection = new ContractCollectionMongoose(data);
    await collection.save();

    const populated = await collection.populate('organization', {
      name: 1,
      displayName: 1,
      avatar: 1,
      id: 1,
    });

    return populated.toObject<RetrievedContractCollection>();
  }

  async update(collectionId: string, data: Record<string, any>) {
    const collection = await ContractCollectionMongoose.findById(collectionId);
    if (!collection) {
      throw new Error('Collection not found in database');
    }

    collection.set(data);
    await collection.save();

    return collection.toObject();
  }

  async destroy(id: string) {
    const result = await ContractCollectionMongoose.deleteOne({ _id: id });
    return result?.deletedCount === 1;
  }

  async destroyWithContracts(id: string) {
    await ContractMongoose.deleteMany({ _collectionId: id });
    const result = await ContractCollectionMongoose.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    return result?.deletedCount === 1;
  }
}

export default ContractCollectionRepository;
