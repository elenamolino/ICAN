import container from '../config/container';
import ContractCollectionRepository from '../repositories/mongoose/ContractCollectionRepository';
import ContractRepository from '../repositories/mongoose/ContractRepository';
import { CollectionIndexQueryParams } from '../types/services/ContractCollection';
import { LeanUser } from '../types/models/User';
import { PermissionEngine } from '../policies/PermissionEngine';
import { generateSlug } from '../repositories/mongoose/models/ContractCollectionMongoose';
import { OrgRole } from '../types/models/Organization';
import UserService from './UserService';
import PermissionService from './PermissionService';
import OrganizationService from './OrganizationService';
import { Organization } from '../types/database/Organization';

class ContractCollectionService {
  private readonly contractCollectionRepository: ContractCollectionRepository;
  private readonly contractRepository: ContractRepository;
  private readonly permissionEngine: PermissionEngine;
  private readonly permissionService: PermissionService;
  private readonly userService: UserService;
  private readonly organizationService: OrganizationService;

  constructor() {
    this.contractCollectionRepository = container.resolve('contractCollectionRepository');
    this.contractRepository = container.resolve('contractRepository');
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

    // Anonymous callers only ever reach public collections, and can never change them.
    if (!reqUser) {
      return { ...collection, canEdit: false, canDelete: false };
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

    return { ...collection, canEdit, canDelete };
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

    await this.contractCollectionRepository.update((collection as any).id, data);

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
