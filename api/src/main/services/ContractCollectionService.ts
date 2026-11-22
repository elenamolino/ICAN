import container from '../config/container';
import ContractCollectionRepository from '../repositories/mongoose/ContractCollectionRepository';
import ContractRepository from '../repositories/mongoose/ContractRepository';
import ServiceRepository from '../repositories/mongoose/ServiceRepository';
import { CollectionIndexQueryParams } from '../types/services/ContractCollection';
import { LeanUser } from '../types/models/User';
import { PermissionEngine } from '../policies/PermissionEngine';
import { generateSlug } from '../repositories/mongoose/models/ContractCollectionMongoose';
import { OrgRole } from '../types/models/Organization';
import UserService from './UserService';
import PermissionService from './PermissionService';
import OrganizationService from './OrganizationService';
import { Organization } from '../types/database/Organization';
import { buildServicePage, groupContractsByService, ServicePageQuery } from '../utils/collectionServicePage';
import { pickDefined } from '../utils/pickDefined';

class ContractCollectionService {
  private readonly contractCollectionRepository: ContractCollectionRepository;
  private readonly contractRepository: ContractRepository;
  private readonly serviceRepository: ServiceRepository;
  private readonly permissionEngine: PermissionEngine;
  private readonly permissionService: PermissionService;
  private readonly userService: UserService;
  private readonly organizationService: OrganizationService;

  constructor() {
    this.contractCollectionRepository = container.resolve('contractCollectionRepository');
    this.contractRepository = container.resolve('contractRepository');
    this.serviceRepository = container.resolve('serviceRepository');
    this.permissionEngine = new PermissionEngine();
    this.permissionService = container.resolve('permissionService');
    this.userService = container.resolve('userService');
    this.organizationService = container.resolve('organizationService');
  }

  async index(queryParams: CollectionIndexQueryParams, reqUser?: LeanUser) {
    // Anonymous callers only ever see public collections. For everyone else the real
    // permission context is needed, or their own private collections are filtered out.
    const permissions = reqUser
      ? await this.permissionService.buildUserPermissionsContext(reqUser)
      : {
          orgRole: null,
          contracts: [],
          collections: [],
          isGlobalAdmin: false,
          adminOrgIds: [],
        };

    return this.contractCollectionRepository.findAll(queryParams, permissions);
  }

  async indexByOrganizationId(
    organizationId: string,
    reqUser?: LeanUser,
    queryParams?: CollectionIndexQueryParams
  ) {
    const orgRole: OrgRole | null = await this.permissionService.resolveOrgRole(
      reqUser?.id ?? '',
      organizationId
    );

    if (!reqUser || (reqUser.role !== 'ADMIN' && !orgRole)) {
      return this.contractCollectionRepository.findByOrganizationId(
        organizationId,
        undefined,
        queryParams ?? { limit: 10, offset: 0 }
      );
    }

    const permissions = await this.permissionService.buildOrgUserPermissionsContext(
      reqUser,
      orgRole,
      organizationId
    );

    return this.contractCollectionRepository.findByOrganizationId(
      organizationId,
      permissions,
      queryParams ?? { limit: 10, offset: 0 }
    );
  }

  async indexByUser(username: string, reqUser: LeanUser, queryParams?: CollectionIndexQueryParams) {
    if (username !== reqUser.username && reqUser.role !== 'ADMIN') {
      throw new Error(
        'PERMISSION ERROR: You can only query your own collections. You can either provide your username or use "me" as username to query your collections.'
      );
    }

    const user = await this.userService.show(username);
    if (!user) {
      throw new Error('NOT FOUND: User not found');
    }

    const userOrganizations = await this.organizationService.indexByUser(user.id, {
      treeFormat: false,
      pagination: { limit: Number.MAX_SAFE_INTEGER, offset: 0 },
    });
    const userOrganizationsIds = userOrganizations.items.map((org: Organization) => org.id);
    const permissions = await this.permissionService.buildUserPermissionsContext(user);

    if (queryParams?.writableOnly) {
      permissions.collections = permissions.collectionsWritable ?? [];
    }

    const enhancedQueryParams = {
      ...queryParams,
      limit: queryParams?.limit ?? 10,
      offset: queryParams?.offset ?? 0,
      ...(permissions.isGlobalAdmin
        ? queryParams?.organizationIds
          ? { organizationIds: queryParams.organizationIds }
          : {}
        : {
            organizationIds: queryParams?.organizationIds
              ? queryParams.organizationIds.filter((id: string) => userOrganizationsIds.includes(id))
              : userOrganizationsIds,
          }),
    };

    return this.contractCollectionRepository.findAll(enhancedQueryParams, permissions);
  }

  async show(organizationId: string, collectionSlug: string, reqUser?: LeanUser) {
    const collection = await this.contractCollectionRepository.findByOrganizationAndSlug(
      organizationId,
      collectionSlug
    );
    if (!collection) {
      throw new Error('NOT FOUND: Contract collection not found');
    }

    const isPrivate = Boolean((collection as any).private);

    if (isPrivate && !reqUser) {
      throw new Error('PERMISSION ERROR: You are not a member of this organization');
    }

    const contractCount = await this.contractCollectionRepository.countContracts(collection.id);

    // Anonymous callers only ever reach public collections, and can never change them.
    if (!reqUser) {
      return { ...collection, contractCount, canEdit: false, canDelete: false, canMove: false };
    }

    const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
    const batchCtx = await this.permissionService.buildBatchContext(
      reqUser.id,
      organizationId,
      orgRole,
      reqUser.role === 'ADMIN'
    );
    const entityPerms = batchCtx.entityPermissions.get(`contractCollection:${(collection as any).slug}`);
    const evaluationContext = {
      userId: reqUser.id,
      organizationId,
      entityType: 'contractCollection' as const,
      entitySlug: (collection as any).slug,
      isPrivate,
      userOrgRole: orgRole,
      isGlobalAdmin: reqUser.role === 'ADMIN',
      entityPermissions: entityPerms,
    };

    if (isPrivate) {
      const evalResult = this.permissionEngine.evaluate({ ...evaluationContext, action: 'GET' });
      if (!evalResult.allowed) {
        throw new Error(`PERMISSION ERROR: ${evalResult.reason}`);
      }
    }

    // Exposed so the UI can hide affordances it would only get a 403 from.
    const canEdit = this.permissionEngine.evaluate({ ...evaluationContext, action: 'PUT' }).allowed;
    const canDelete = this.permissionEngine.evaluate({ ...evaluationContext, action: 'DELETE' }).allowed;

    const canMove = this.canManageOrganization(orgRole, reqUser);

    return { ...collection, contractCount, canEdit, canDelete, canMove };
  }

  private canManageOrganization(orgRole: OrgRole | null, reqUser: LeanUser) {
    return reqUser.role === 'ADMIN' || orgRole === 'OWNER' || orgRole === 'ADMIN';
  }

  async assertBelongsTo(collectionId: string, organizationId: string) {
    const collection: any = await this.contractCollectionRepository.findById(collectionId);
    if (!collection || String(collection.organization?.id) !== String(organizationId)) {
      throw new Error('NOT FOUND: Collection not found in this organization');
    }
  }

  /** Moves a collection, with its contracts, between organizations the user manages. */
  async transfer(sourceId: string, collectionSlug: string, targetId: string, reqUser: LeanUser) {
    const [sourceRole, targetRole] = await Promise.all([
      this.permissionService.resolveOrgRole(reqUser.id, sourceId),
      this.permissionService.resolveOrgRole(reqUser.id, targetId),
    ]);
    if (!this.canManageOrganization(sourceRole, reqUser) || !this.canManageOrganization(targetRole, reqUser)) {
      throw new Error('PERMISSION ERROR: You must be an owner or admin of both organizations');
    }

    const collection: any = await this.contractCollectionRepository.findByOrganizationAndSlug(sourceId, collectionSlug);
    if (!collection) {
      throw new Error('NOT FOUND: Collection not found in this organization');
    }
    if (sourceId === targetId) {
      throw new Error('INVALID DATA: The collection already belongs to that organization');
    }
    // A global ADMIN needs no role there, so the target may not even exist.
    await this.organizationService.show(targetId);

    const conflict = await this.contractCollectionRepository.findMoveConflict(collection.id, targetId);
    if (conflict) {
      throw new Error(
        `CONFLICT: That organization already has a ${conflict} with the same name. Rename it before moving`
      );
    }

    if (!(await this.contractCollectionRepository.moveToOrganization(collection.id, sourceId, targetId))) {
      throw new Error('CONFLICT: The collection was moved meanwhile. Reload the page');
    }
    return this.contractCollectionRepository.findById(collection.id);
  }

  // One page of the collection's services, each with its documents (without
  // their text), for the collection detail page.
  async listServices(
    organizationId: string,
    collectionSlug: string,
    query: ServicePageQuery,
    reqUser?: LeanUser
  ) {
    const collection = await this.show(organizationId, collectionSlug, reqUser);

    const { services, contracts } = await this.visibleContent(organizationId, collection, reqUser);

    const serviceRefs = services.map((service: any) => ({
      id: String(service._id),
      name: service.name,
      slug: service.slug,
    }));
    const servicesById = new Map(serviceRefs.map(service => [service.id, service]));

    const contractSummaries = contracts.map((contract: any) => {
      const serviceId = contract._serviceId ? String(contract._serviceId) : null;
      return {
        id: String(contract._id),
        name: contract.name,
        slug: contract.slug,
        version: contract.version,
        createdAt: contract.createdAt,
        url: contract.url,
        private: contract.private,
        organization: { id: String(contract._organizationId) },
        service: (serviceId && servicesById.get(serviceId)) || null,
        latestVersionSummary: contract.latestVersionSummary,
        serviceId,
      };
    });

    const page = buildServicePage(groupContractsByService(serviceRefs, contractSummaries), query);
    // serviceId only served to group the contracts; the response carries `service`.
    page.services.forEach(service => {
      service.contracts = service.contracts.map(({ serviceId: _serviceId, ...contract }) => contract) as any;
    });
    return page;
  }

  /** The services of a collection, for whoever may open it. */
  async listVisibleServices(collectionId: string, reqUser?: LeanUser) {
    const found: any = await this.contractCollectionRepository.findById(collectionId);
    if (!found?.organization) throw new Error('NOT FOUND: Collection not found');
    const organizationId = String(found.organization.id);
    const collection = await this.show(organizationId, found.slug, reqUser);
    return (await this.visibleContent(organizationId, collection, reqUser)).services;
  }

  /**
   * A public collection may hold private contracts. Those are left out, and so is a
   * service with nothing else in it: its name is the provider's.
   */
  private async visibleContent(organizationId: string, collection: any, reqUser?: LeanUser) {
    const [services, contracts] = await Promise.all([
      this.serviceRepository.findByCollectionId(collection.id),
      this.contractRepository.findSummariesByCollection(collection.id),
    ]);
    if (!contracts.some((contract: any) => contract.private)) return { services, contracts };

    const orgRole = reqUser ? await this.permissionService.resolveOrgRole(reqUser.id, organizationId) : null;
    const batch = reqUser
      ? await this.permissionService.buildBatchContext(reqUser.id, organizationId, orgRole, reqUser.role === 'ADMIN')
      : null;

    const visible = contracts.filter((contract: any) => {
      if (!contract.private) return true;
      if (!reqUser || !batch) return false;
      return this.permissionEngine.evaluate({
        userId: reqUser.id,
        organizationId,
        entityType: 'contract',
        entitySlug: contract.slug,
        action: 'GET',
        isPrivate: true,
        userOrgRole: orgRole,
        isGlobalAdmin: reqUser.role === 'ADMIN',
        entityPermissions: batch.entityPermissions.get(`contract:${contract.slug}`),
        collectionSlug: collection.slug,
        collectionPermissions: batch.entityPermissions.get(`contractCollection:${collection.slug}`),
      }).allowed;
    });

    const used = new Set(contracts.map((contract: any) => String(contract._serviceId)));
    const shown = new Set(visible.map((contract: any) => String(contract._serviceId)));
    return {
      contracts: visible,
      services: services.filter((service: any) => {
        const id = String(service._id ?? service.id);
        return !used.has(id) || shown.has(id);
      }),
    };
  }

  async create(newCollection: Record<string, any>, organizationId: string, reqUser: LeanUser) {
    const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
    const batchCtx = await this.permissionService.buildBatchContext(
      reqUser.id,
      organizationId,
      orgRole,
      reqUser.role === 'ADMIN'
    );
    const createResult = this.permissionEngine.evaluate({
      userId: reqUser.id,
      organizationId,
      entityType: 'contractCollection',
      action: 'CREATE',
      userOrgRole: orgRole,
      isGlobalAdmin: reqUser.role === 'ADMIN',
      orgPermissions: batchCtx.orgPermissions.get('contractCollection'),
    });
    if (!createResult.allowed) {
      throw new Error(`PERMISSION ERROR: ${createResult.reason}`);
    }

    newCollection._organizationId = organizationId;
    if (!newCollection.slug && newCollection.name) {
      newCollection.slug = generateSlug(newCollection.name);
    }

    const collection = await this.contractCollectionRepository.create(newCollection);

    if (orgRole === 'MEMBER') {
      try {
        await this.permissionService.grantEntityPermission(
          reqUser.id,
          organizationId,
          'contractCollection',
          newCollection.slug,
          { GET: true, PUT: true, DELETE: true, CREATE: true }
        );
      } catch {
        // Permission grant failure should not block collection creation
      }
    }

    return this.contractCollectionRepository.findByOrganizationAndSlug(organizationId, newCollection.slug);
  }

  async update(organizationId: string, collectionSlug: string, data: Record<string, any>, reqUser: LeanUser) {
    const collection = await this.contractCollectionRepository.findByOrganizationAndSlug(
      organizationId,
      collectionSlug
    );
    if (!collection) {
      throw new Error(
        'NOT FOUND: Either the collection does not exist or you are not a member of its organization'
      );
    }

    const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
    const batchCtx = await this.permissionService.buildBatchContext(
      reqUser.id,
      organizationId,
      orgRole,
      reqUser.role === 'ADMIN'
    );
    const entityPerms = batchCtx.entityPermissions.get(`contractCollection:${(collection as any).slug}`);

    const updateResult = this.permissionEngine.evaluate({
      userId: reqUser.id,
      organizationId,
      entityType: 'contractCollection',
      entitySlug: (collection as any).slug,
      action: 'PUT',
      isPrivate: (collection as any).private,
      userOrgRole: orgRole,
      isGlobalAdmin: reqUser.role === 'ADMIN',
      entityPermissions: entityPerms,
    });
    if (!updateResult.allowed) {
      throw new Error(`PERMISSION ERROR: ${updateResult.reason}`);
    }

    // Only these fields: the organization changes through transfer(), which checks both ends.
    await this.contractCollectionRepository.update(
      (collection as any).id,
      pickDefined(data, ['name', 'description', 'private'])
    );

    // Contract visibility is filtered by the contract's own flag, with no inheritance
    // at query time — so hiding a collection has to hide the contracts inside it too,
    // or they stay listed and readable through the public contract endpoints.
    if (typeof data.private === 'boolean' && data.private !== Boolean((collection as any).private)) {
      await this.contractRepository.setPrivacyForCollection((collection as any).id, data.private);
    }

    const updatedCollection = await this.contractCollectionRepository.findById((collection as any).id);
    if (!updatedCollection) {
      throw new Error('NOT FOUND: Collection not found after update');
    }

    return updatedCollection;
  }

  async destroy(
    organizationId: string,
    collectionSlug: string,
    deleteCascade: boolean,
    ignoreResult: boolean = false,
    reqUser?: LeanUser
  ) {
    if (!reqUser && !ignoreResult) {
      throw new Error(
        'INTERNAL ERROR: You have not provided "reqUser". Either set "ignoreResult" to true or provide the user performing the action as "reqUser".'
      );
    }

    const collection = await this.contractCollectionRepository.findByOrganizationAndSlug(
      organizationId,
      collectionSlug
    );
    if (!collection) {
      throw new Error(
        'NOT FOUND: Either the collection does not exist or you are not a member of its organization'
      );
    }

    if (reqUser && !ignoreResult) {
      const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
      const batchCtx = await this.permissionService.buildBatchContext(
        reqUser.id,
        organizationId,
        orgRole,
        reqUser.role === 'ADMIN'
      );
      const entityPerms = batchCtx.entityPermissions.get(`contractCollection:${(collection as any).slug}`);

      const deleteResult = this.permissionEngine.evaluate({
        userId: reqUser.id,
        organizationId,
        entityType: 'contractCollection',
        entitySlug: (collection as any).slug,
        action: 'DELETE',
        isPrivate: (collection as any).private,
        userOrgRole: orgRole,
        isGlobalAdmin: reqUser.role === 'ADMIN',
        entityPermissions: entityPerms,
      });
      if (!deleteResult.allowed) {
        throw new Error(`PERMISSION ERROR: ${deleteResult.reason}`);
      }
    }

    let result;
    if (deleteCascade) {
      result = await this.contractCollectionRepository.destroyWithContracts((collection as any).id);
    } else {
      await this.contractRepository.removeContractsFromCollection((collection as any).id);
      result = await this.contractCollectionRepository.destroy((collection as any).id);
    }

    if (!result && !ignoreResult) {
      throw new Error('NOT FOUND: Collection not found');
    }

    return true;
  }

  async removeContractFromCollection(
    contractSlug: string,
    organizationId: string,
    reqUser?: LeanUser
  ) {
    if (reqUser) {
      const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
      const evalResult = this.permissionEngine.evaluate({
        userId: reqUser.id,
        organizationId,
        entityType: 'contract',
        action: 'PUT',
        userOrgRole: orgRole,
        isGlobalAdmin: reqUser.role === 'ADMIN',
      });
      if (!evalResult.allowed) {
        throw new Error(`PERMISSION ERROR: ${evalResult.reason}`);
      }
    }

    const contract = await this.contractRepository.findOne(contractSlug, organizationId, {
      includePrivate: true,
    });
    if (!contract) {
      throw new Error(
        'NOT FOUND: Either the contract does not exist or you are not a member of its organization'
      );
    }

    await this.contractRepository.removeContractFromCollection(contractSlug, organizationId);
    return true;
  }
}

export default ContractCollectionService;
