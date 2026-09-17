import RepositoryBase from '../RepositoryBase';
import ContractMongoose from './models/ContractMongoose';
import { ContractIndexQueryParams } from '../../types/services/ContractService';
import mongoose from 'mongoose';
import { LeanContract } from '../../types/models/Contract';
import { OrgUserPermissionsContext } from '../../types/policies';
import { generateSlug } from '../../utils/slug-manager';
import { processFileUris } from '../../services/FileService';
import { escapeRegex } from '../../utils/regex';

class ContractRepository extends RepositoryBase {
  private _buildVisibilityFilter(
    organizationId: string | undefined,
    permissions?: OrgUserPermissionsContext
  ): Record<string, any> {
    const filter: Record<string, any> = {};
    if (organizationId) {
      filter._organizationId = new mongoose.Types.ObjectId(organizationId);
    }

    if (!permissions) {
      filter.private = false;
      return filter;
    }

    if (permissions.isGlobalAdmin || (permissions.orgRole === 'OWNER' || permissions.orgRole === 'ADMIN')) {
      return filter;
    }

    filter.$or = [
      ...(permissions.adminOrgIds.length > 0
        ? [{ _organizationId: { $in: permissions.adminOrgIds.map(id => new mongoose.Types.ObjectId(id)) } }]
        : []),
      { private: false },
      { slug: { $in: permissions.contracts } },
    ];

    return filter;
  }

  async findAll(queryParams: ContractIndexQueryParams, permissions: OrgUserPermissionsContext) {
    return this._find(undefined, permissions, queryParams);
  }

  async findByOrganizationId(
    organizationId: string,
    permissions: OrgUserPermissionsContext,
    queryParams: ContractIndexQueryParams
  ) {
    return this._find(organizationId, permissions, queryParams);
  }

  private async _find(
    organizationId: string | undefined,
    permissions: OrgUserPermissionsContext | undefined,
    queryParams: ContractIndexQueryParams
  ): Promise<{ contracts: any[]; total: number }> {
    const filter = this._buildVisibilityFilter(organizationId, permissions);

    if (queryParams.name) {
      filter.name = { $regex: escapeRegex(queryParams.name), $options: 'i' };
    }
    if (queryParams.collection) {
      const collection = await mongoose
        .model('ContractCollection')
        .findOne({ slug: queryParams.collection })
        .select('_id');
      filter._collectionId = collection ? String(collection._id) : '__none__';
    }
    if (queryParams.excludeContractsInCollection) {
      filter._collectionId = { $exists: false };
    }
    if (queryParams.selectedOrganizations) {
      filter._organizationId = { $in: queryParams.selectedOrganizations.map(id => new mongoose.Types.ObjectId(id)) };
    }

    const sortField = queryParams.sortBy === 'name' ? 'name' : 'createdAt';
    const sortOrder = queryParams.sort === 'asc' ? 1 : -1;

    const total = await ContractMongoose.countDocuments(filter);
    const query = ContractMongoose.find(filter)
      .populate('organization', 'name displayName avatar')
      .populate('collection', 'name slug')
      .populate('service', 'name slug')
      .sort({ [sortField]: sortOrder, _id: 1 });

    if (typeof queryParams.offset !== 'undefined') query.skip(queryParams.offset);
    if (typeof queryParams.limit !== 'undefined') query.limit(queryParams.limit);

    const contracts = (await query.exec()).map(c => c.toObject());
    contracts.forEach((c: any) => {
      if (c.organization) processFileUris(c.organization, ['avatar']);
    });

    return { contracts, total };
  }

  async findOne(
    slug: string,
    organizationId: string,
    queryParams: { collectionId?: string; includePrivate?: boolean } = { includePrivate: false }
  ) {
    const filter: Record<string, any> = {
      slug,
      _organizationId: new mongoose.Types.ObjectId(organizationId),
    };
    if (!queryParams.includePrivate) {
      filter.private = false;
    }
    if (queryParams.collectionId) {
      filter._collectionId = queryParams.collectionId;
    }

    const contract = await ContractMongoose.findOne(filter)
      .populate('organization', 'name displayName avatar')
      .populate('collection', 'name slug')
      .populate('service', 'name slug');

    if (!contract) return null;

    const result = contract.toObject();
    if ((result as any).organization) processFileUris((result as any).organization, ['avatar']);
    return result;
  }

  async findByCollection(collectionId: string) {
    try {
      return await ContractMongoose.find({ _collectionId: collectionId });
    } catch {
      return [];
    }
  }

  async findById(id: string): Promise<LeanContract | null> {
    const contract = await ContractMongoose.findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!contract) return null;
    return contract.toObject<LeanContract>();
  }

  async findExistingSlug(slug: string, organizationId: string): Promise<boolean> {
    const existing = await ContractMongoose.findOne({
      slug,
      _organizationId: new mongoose.Types.ObjectId(organizationId),
    }).lean();
    return existing !== null;
  }

  async findBySlugAndOrganization(slug: string, organizationId: string): Promise<LeanContract | null> {
    const contract = await ContractMongoose.findOne({
      slug,
      _organizationId: new mongoose.Types.ObjectId(organizationId),
    });
    if (!contract) return null;
    return contract.toObject<LeanContract>();
  }

  async create(data: Record<string, any>) {
    if (data._collectionId) data._collectionId = String(data._collectionId);
    if (data._serviceId) data._serviceId = String(data._serviceId);
    if (data._organizationId) data._organizationId = new mongoose.Types.ObjectId(data._organizationId);
    if (!data.slug && data.name) data.slug = generateSlug(data.name);

    const contract = await ContractMongoose.create(data);
    return contract.toObject();
  }

  async update(id: string, data: Record<string, any>) {
    const contract = await ContractMongoose.findOne({ _id: id });
    if (!contract) return null;

    contract.set(data);
    await contract.save();

    return contract.toObject();
  }

  async addContractToCollection(contractSlug: string, organizationId: string, collectionId: string) {
    return ContractMongoose.updateMany(
      { slug: contractSlug, _organizationId: new mongoose.Types.ObjectId(organizationId) },
      { $set: { _collectionId: collectionId } }
    );
  }

  async removeContractFromCollection(contractSlug: string, organizationId: string) {
    return ContractMongoose.updateMany(
      { slug: contractSlug, _organizationId: new mongoose.Types.ObjectId(organizationId) },
      { $unset: { _collectionId: 1 } }
    );
  }

  async removeContractsFromCollection(collectionId: string) {
    return ContractMongoose.updateMany({ _collectionId: collectionId }, { $unset: { _collectionId: 1 } });
  }

  async setPrivacyForCollection(collectionId: string, isPrivate: boolean) {
    return ContractMongoose.updateMany({ _collectionId: collectionId }, { $set: { private: isPrivate } });
  }

  async setPrivacyBySlugAndOrganization(slug: string, organizationId: string, isPrivate: boolean) {
    return ContractMongoose.updateOne(
      { slug, _organizationId: new mongoose.Types.ObjectId(organizationId) },
      { $set: { private: isPrivate } }
    );
  }

  async removeContractsFromService(serviceId: string) {
    return ContractMongoose.updateMany({ _serviceId: String(serviceId) }, { $unset: { _serviceId: 1 } });
  }

  async destroyBySlugAndOrganization(slug: string, organizationId: string) {
    const result = await ContractMongoose.deleteOne({
      slug,
      _organizationId: new mongoose.Types.ObjectId(organizationId),
    });
    return result.deletedCount === 1;
  }

  async destroy(id: string) {
    const result = await ContractMongoose.deleteOne({ _id: id });
    return result?.deletedCount === 1;
  }
}

export default ContractRepository;
