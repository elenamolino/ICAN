import container from '../config/container';
import { ContractIndexQueryParams } from '../types/services/ContractService';
import ContractCollectionService from './ContractCollectionService';
import ContractRepository from '../repositories/mongoose/ContractRepository';
import ContractVersionRepository from '../repositories/mongoose/ContractVersionRepository';
import { LeanUser } from '../types/models/User';
import { PermissionEngine } from '../policies/PermissionEngine';
import { generateSlug, deduplicateSlug } from '../utils/slug-manager';
import { OrgRole } from '../types/models/Organization';
import OrganizationService from './OrganizationService';
import { Organization } from '../types/database/Organization';
import UserService from './UserService';
import PermissionService from './PermissionService';

class ContractService {
  private contractRepository: ContractRepository;
  private contractVersionRepository: ContractVersionRepository;
  private contractCollectionService: ContractCollectionService;
  private permissionEngine: PermissionEngine;
  private permissionService: PermissionService;
  private organizationService: OrganizationService;
  private userService: UserService;

  constructor() {
    this.contractRepository = container.resolve('contractRepository');
    this.contractVersionRepository = container.resolve('contractVersionRepository');
    this.contractCollectionService = container.resolve('contractCollectionService');
    this.permissionEngine = new PermissionEngine();
    this.permissionService = container.resolve('permissionService');
    this.organizationService = container.resolve('organizationService');
    this.userService = container.resolve('userService');
  }

  async index(queryParams: ContractIndexQueryParams, reqUser?: LeanUser) {
    const isAdmin = reqUser && reqUser.role === 'ADMIN';

    return this.contractRepository.findAll(queryParams, {
      orgRole: null,
      contracts: [],
      collections: [],
      isGlobalAdmin: isAdmin ?? false,
      adminOrgIds: [],
    });
  }

  async indexByOrganizationId(
    organizationId: string,
    reqUser?: LeanUser,
    queryParams?: ContractIndexQueryParams
  ) {
    const orgRole: OrgRole | null = await this.permissionService.resolveOrgRole(
      reqUser?.id ?? '',
      organizationId
    );

    if (!reqUser || (reqUser.role !== 'ADMIN' && !orgRole)) {
      return this.contractRepository.findByOrganizationId(
        organizationId,
        { orgRole: null, contracts: [], collections: [], isGlobalAdmin: false, adminOrgIds: [] },
        queryParams ?? { limit: 10, offset: 0 }
      );
    }

    const permissions = await this.permissionService.buildOrgUserPermissionsContext(
      reqUser,
      orgRole,
      organizationId
    );

    return this.contractRepository.findByOrganizationId(
      organizationId,
      permissions,
      queryParams ?? { limit: 10, offset: 0 }
    );
  }

  async indexByUser(username: string, reqUser: LeanUser, queryParams?: ContractIndexQueryParams) {
    if (username !== reqUser.username && reqUser.role !== 'ADMIN') {
      throw new Error(
        'PERMISSION ERROR: You can only query your own contracts. You can either provide your username or use "me" as username to query your contracts.'
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
    const enhancedQueryParams = {
      ...queryParams,
      limit: queryParams?.limit ?? 10,
      offset: queryParams?.offset ?? 0,
      ...(permissions.isGlobalAdmin ? {} : { selectedOrganizations: userOrganizationsIds }),
    };

    return this.contractRepository.findAll(enhancedQueryParams, permissions);
  }

  async indexByCollection(collectionId: string) {
    return this.contractRepository.findByCollection(collectionId);
  }

  async show(
    slug: string,
    organizationId: string,
    reqUser?: LeanUser,
    queryParams: { collectionSlug?: string; includePrivate: boolean } = { includePrivate: false }
  ) {
    if (reqUser) {
      const role = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
      queryParams.includePrivate = reqUser.role === 'ADMIN' || role !== null;
    }

    const contract = await this.contractRepository.findOne(slug, organizationId, queryParams);
    if (!contract) {
      throw new Error('NOT FOUND: Contract not found');
    }

    return contract;
  }

  async create(
    data: { name: string; url?: string; content?: string; version?: string; serviceId?: string },
    organizationId: string,
    isPrivate: boolean,
    reqUser: LeanUser,
    collectionId?: string
  ) {
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
      entityType: 'contract',
      action: 'CREATE',
      userOrgRole: orgRole,
      isGlobalAdmin: reqUser.role === 'ADMIN',
      orgPermissions: batchCtx.orgPermissions.get('contract'),
    });
    if (!createResult.allowed) {
      throw new Error(`PERMISSION ERROR: ${createResult.reason}`);
    }

    const baseSlug = generateSlug(data.name);
    const slug = await deduplicateSlug(baseSlug, slugToCheck =>
      this.contractRepository.findExistingSlug(slugToCheck, organizationId)
    );

    const contract = await this.contractRepository.create({
      name: data.name,
      slug,
      version: data.version,
      _collectionId: collectionId,
      _serviceId: data.serviceId,
      _organizationId: organizationId,
      private: isPrivate,
      createdAt: new Date(),
      url: data.url ?? '',
      content: data.content ?? '',
    });

    if (orgRole === 'MEMBER') {
      try {
        await this.permissionService.grantEntityPermission(
          reqUser.id,
          organizationId,
          'contract',
          slug,
          { GET: true, PUT: true, DELETE: true, CREATE: true }
        );
      } catch {
        // Permission grant failure should not block contract creation
      }
    }

    return contract;
  }

  async addContractToCollection(
    contractSlug: string,
    organizationId: string,
    collectionSlug: string,
    reqUser?: LeanUser
  ) {
    const collection = await this.contractCollectionService.show(organizationId, collectionSlug, reqUser);

    if (reqUser) {
      const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
      const batchCtx = await this.permissionService.buildBatchContext(
        reqUser.id,
        organizationId,
        orgRole,
        reqUser.role === 'ADMIN'
      );
      const entityPerms = batchCtx.entityPermissions.get(`contractCollection:${collection.slug}`);
      const evalResult = this.permissionEngine.evaluate({
        userId: reqUser.id,
        organizationId,
        entityType: 'contractCollection',
        entitySlug: collection.slug,
        action: 'PUT',
        isPrivate: collection.private,
        userOrgRole: orgRole,
        isGlobalAdmin: reqUser.role === 'ADMIN',
        entityPermissions: entityPerms,
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
        "NOT FOUND: Contract not found. Please check that: 1) the contract is created, 2) that you're a member of the organization, and 3) that the collection slug you've specified is correct."
      );
    }

    await this.contractRepository.addContractToCollection(contractSlug, organizationId, collection.id);
    return true;
  }

  async update(
    contractSlug: string,
    organizationId: string,
    reqUser: LeanUser,
    data: Record<string, any>
  ) {
    const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);

    const contract = await this.contractRepository.findOne(contractSlug, organizationId, {
      includePrivate: true,
    });
    if (!contract) {
      throw new Error(
        'NOT FOUND: Either the contract does not exist or you are not a member of its organization'
      );
    }

    const batchCtx = await this.permissionService.buildBatchContext(
      reqUser.id,
      organizationId,
      orgRole,
      reqUser.role === 'ADMIN'
    );
    const entityPerms = batchCtx.entityPermissions.get(`contract:${contractSlug}`);

    const updateResult = this.permissionEngine.evaluate({
      userId: reqUser.id,
      organizationId,
      entityType: 'contract',
      entitySlug: contractSlug,
      action: 'PUT',
      isPrivate: (contract as any).private,
      userOrgRole: orgRole,
      isGlobalAdmin: reqUser.role === 'ADMIN',
      entityPermissions: entityPerms,
    });
    if (!updateResult.allowed) {
      throw new Error(`PERMISSION ERROR: ${updateResult.reason}`);
    }

    if (data.name) {
      data.slug = await deduplicateSlug(generateSlug(data.name), slugToCheck =>
        this.contractRepository.findExistingSlug(slugToCheck, organizationId)
      );
    }

    return this.contractRepository.update((contract as any).id, data);
  }

  async destroy(contractSlug: string, organizationId: string, reqUser: LeanUser) {
    const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);

    const contract = await this.contractRepository.findOne(contractSlug, organizationId, {
      includePrivate: true,
    });
    if (!contract) {
      throw new Error('NOT FOUND: Contract not found');
    }

    const batchCtx = await this.permissionService.buildBatchContext(
      reqUser.id,
      organizationId,
      orgRole,
      reqUser.role === 'ADMIN'
    );
    const entityPerms = batchCtx.entityPermissions.get(`contract:${contractSlug}`);

    const deleteResult = this.permissionEngine.evaluate({
      userId: reqUser.id,
      organizationId,
      entityType: 'contract',
      entitySlug: contractSlug,
      action: 'DELETE',
      isPrivate: (contract as any).private,
      userOrgRole: orgRole,
      isGlobalAdmin: reqUser.role === 'ADMIN',
      entityPermissions: entityPerms,
    });
    if (!deleteResult.allowed) {
      throw new Error(`PERMISSION ERROR: ${deleteResult.reason}`);
    }

    const result = await this.contractRepository.destroyBySlugAndOrganization(contractSlug, organizationId);
    if (!result) {
      throw new Error(
        'NOT FOUND: Either the contract does not exist or you are not a member of its organization'
      );
    }

    await this.contractVersionRepository.deleteByContractIds([(contract as any).id ?? (contract as any)._id]);

    return true;
  }
}

export default ContractService;
