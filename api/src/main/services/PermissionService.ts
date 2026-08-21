import container from '../config/container';
import EntityPermissionRepository from '../repositories/mongoose/EntityPermissionRepository';
import OrganizationMembershipRepository from '../repositories/mongoose/OrganizationMembershipRepository';
import ContractRepository from '../repositories/mongoose/ContractRepository';
import ContractCollectionRepository from '../repositories/mongoose/ContractCollectionRepository';
import { EntityType, EntityPermissions, LeanEntityPermission, PermissionType } from '../types/models/EntityPermission';
import { OrgRole } from '../types/models/Organization';
import { LeanUser } from '../types/models/User';
import { ContractIndexQueryParams } from '../types/services/ContractService';
import { CollectionIndexQueryParams } from '../types/services/ContractCollection';
import { PermissionQueries } from '../policies/queries/PermissionQueries';
import { BatchEvaluationContext, OrgUserPermissionsContext } from '../types/policies';

const FULL_PERMISSIONS: EntityPermissions = { GET: true, PUT: true, DELETE: true, CREATE: true };
const NO_PERMISSIONS: EntityPermissions = { GET: false, PUT: false, DELETE: false, CREATE: false };

class PermissionService {
  private entityPermissionRepository: EntityPermissionRepository;
  private organizationMembershipRepository: OrganizationMembershipRepository;
  private contractRepository: ContractRepository;
  private contractCollectionRepository: ContractCollectionRepository;
  private permissionQueries: PermissionQueries;

  constructor() {
    this.entityPermissionRepository = container.resolve('entityPermissionRepository');
    this.organizationMembershipRepository = container.resolve('organizationMembershipRepository');
    this.contractRepository = container.resolve('contractRepository');
    this.contractCollectionRepository = container.resolve('contractCollectionRepository');
    this.permissionQueries = new PermissionQueries();
  }

  async resolveOrgRole(userId: string, organizationId: string): Promise<OrgRole | null> {
    return this.permissionQueries.resolveOrgRole(userId, organizationId);
  }

  async buildBatchContext(
    userId: string,
    organizationId: string,
    userOrgRole?: OrgRole | null,
    isGlobalAdmin?: boolean
  ): Promise<BatchEvaluationContext> {
    return this.permissionQueries.buildBatchContext(userId, organizationId, userOrgRole, isGlobalAdmin);
  }

  async buildAllOrgsBatchContext(
    userId: string,
    isGlobalAdmin?: boolean
  ): Promise<Map<string, BatchEvaluationContext>> {
    return this.permissionQueries.buildAllOrgsBatchContext(userId, isGlobalAdmin);
  }

  async buildOrgUserPermissionsContext(
    reqUser: LeanUser,
    orgRole: OrgRole | null,
    organizationId: string
  ): Promise<OrgUserPermissionsContext> {
    const orgPermissions: BatchEvaluationContext = await this.buildBatchContext(
      reqUser.id,
      organizationId,
      orgRole,
      reqUser.role === 'ADMIN'
    );

    const entriesWithGetPermissions = Array.from(orgPermissions.entityPermissions.entries())
      .filter(([_, permissions]) => permissions.GET === true)
      .map(([key]) => key);

    const contractsWithGetPermissions = entriesWithGetPermissions
      .filter(key => key.startsWith('contract:'))
      .map(key => key.split(':')[1]);
    const collectionsWithGetPermissions = entriesWithGetPermissions
      .filter(key => key.startsWith('contractCollection:'))
      .map(key => key.split(':')[1]);

    return {
      orgRole: orgPermissions.isGlobalAdmin ? 'OWNER' : orgRole,
      contracts: contractsWithGetPermissions,
      collections: collectionsWithGetPermissions,
      isGlobalAdmin: orgPermissions.isGlobalAdmin ?? false,
      adminOrgIds: (orgRole === 'OWNER' || orgRole === 'ADMIN' || orgPermissions.isGlobalAdmin)
        ? [organizationId]
        : [],
    };
  }

  async buildUserPermissionsContext(reqUser: LeanUser): Promise<OrgUserPermissionsContext> {
    const permissions: Map<string, BatchEvaluationContext> = await this.buildAllOrgsBatchContext(
      reqUser.id,
      reqUser.role === 'ADMIN'
    );

    const contractsWithGetPermissions: string[] = [];
    const collectionsWithGetPermissions: string[] = [];
    const collectionsWithPutPermissions: string[] = [];
    const adminOrgIds: string[] = [];

    for (const [orgId, orgPermissions] of permissions) {
      if (orgPermissions.userOrgRole === 'OWNER' || orgPermissions.userOrgRole === 'ADMIN') {
        adminOrgIds.push(orgId);
        continue;
      }

      const entriesWithGetPermissions = Array.from(orgPermissions.entityPermissions.entries())
        .filter(([_, permissionEntry]) => permissionEntry.GET === true)
        .map(([key]) => key);

      const entriesWithPutPermissions = Array.from(orgPermissions.entityPermissions.entries())
        .filter(([_, permissionEntry]) => permissionEntry.GET === true && permissionEntry.PUT === true)
        .map(([key]) => key);

      contractsWithGetPermissions.push(
        ...entriesWithGetPermissions
          .filter(key => key.startsWith('contract:'))
          .map(key => key.split(':')[1])
      );

      collectionsWithGetPermissions.push(
        ...entriesWithGetPermissions
          .filter(key => key.startsWith('contractCollection:'))
          .map(key => key.split(':')[1])
      );

      collectionsWithPutPermissions.push(
        ...entriesWithPutPermissions
          .filter(key => key.startsWith('contractCollection:'))
          .map(key => key.split(':')[1])
      );
    }

    return {
      orgRole: null,
      contracts: contractsWithGetPermissions,
      collections: collectionsWithGetPermissions,
      collectionsWritable: collectionsWithPutPermissions,
      isGlobalAdmin: reqUser.role === 'ADMIN',
      adminOrgIds,
    };
  }

  /**
   * Returns effective permissions for a user on an entity.
   * OWNER/ADMIN always get full permissions.
   * For MEMBERs, looks up EntityPermission records.
   */
  private async getEffectivePermissions(
    userId: string,
    organizationId: string,
    entityType: EntityType,
    entitySlug: string,
    userOrgRole?: OrgRole | null
  ): Promise<EntityPermissions> {
    if (userOrgRole === 'OWNER' || userOrgRole === 'ADMIN') {
      return { ...FULL_PERMISSIONS };
    }

    const permission = await this.entityPermissionRepository.findByUserEntityAndOrganization(
      userId,
      organizationId,
      entityType,
      entitySlug
    );

    if (!permission) {
      return { ...NO_PERMISSIONS };
    }

    return { ...permission.permissions };
  }

  /**
   * Checks if a user has a specific permission on an entity.
   */
  async hasPermission(
    userId: string,
    organizationId: string,
    entityType: EntityType,
    entitySlug: string,
    permission: PermissionType,
    userOrgRole?: OrgRole | null
  ): Promise<boolean> {
    if (userOrgRole === 'OWNER' || userOrgRole === 'ADMIN') {
      return true;
    }

    const perms = await this.getEffectivePermissions(userId, organizationId, entityType, entitySlug, userOrgRole);
    return perms[permission] === true;
  }

  /**
   * Sets permissions for a user on an entity. Only OWNER/ADMIN can call this.
   * When entitySlug is null, sets org-scoped permissions (e.g., CREATE).
   */
  async setPermission(
    organizationId: string,
    userId: string,
    entityType: EntityType,
    entitySlug: string | null,
    permissions: EntityPermissions,
    grantedBy: string,
    granterOrgRole: OrgRole
  ): Promise<LeanEntityPermission> {
    if (granterOrgRole !== 'OWNER' && granterOrgRole !== 'ADMIN') {
      throw new Error('PERMISSION ERROR: Only OWNER and ADMIN users can manage entity permissions');
    }

    const result = await this.entityPermissionRepository.findOrCreate(
      userId,
      organizationId,
      entityType,
      entitySlug,
      permissions,
      grantedBy
    );

    return result;
  }

  /**
   * Grants entity permissions without role verification. Internal use only.
   * Used by services to auto-grant permissions (e.g., MEMBER creating a contract).
   */
  async grantEntityPermission(
    userId: string,
    organizationId: string,
    entityType: EntityType,
    entitySlug: string,
    permissions: EntityPermissions
  ): Promise<LeanEntityPermission> {
    return this.entityPermissionRepository.findOrCreate(
      userId,
      organizationId,
      entityType,
      entitySlug,
      permissions
    );
  }

  /**
   * Removes a permission by ID. Only OWNER/ADMIN can call this.
   */
  async removePermission(permissionId: string, granterOrgRole: OrgRole): Promise<boolean> {
    if (granterOrgRole !== 'OWNER' && granterOrgRole !== 'ADMIN') {
      throw new Error('PERMISSION ERROR: Only OWNER and ADMIN users can manage entity permissions');
    }

    return this.entityPermissionRepository.destroy(permissionId);
  }

  /**
   * Gets all entity permissions for an organization.
   * OWNER/ADMIN users receive implicit full permissions for each entity type
   * (org-scoped, entitySlug=null) when no explicit record exists.
   */
  async getOrganizationPermissions(
    organizationId: string,
    entityType?: EntityType,
    userId?: string,
    isGlobalAdmin?: boolean
  ): Promise<LeanEntityPermission[]> {
    const permissions = await this.entityPermissionRepository.findByOrganization(organizationId, entityType);

    if (!userId) return permissions;

    const orgRole = await this.resolveOrgRole(userId, organizationId);

    if (isGlobalAdmin || orgRole === 'OWNER' || orgRole === 'ADMIN') {
      const types: EntityType[] = entityType ? [entityType] : ['contract', 'contractCollection'];
      for (const type of types) {
        const existing = permissions.find(
          p => p.entitySlug === null && p.entityType === type && p._userId?.toString() === userId
        );
        if (!existing) {
          permissions.push({
            _userId: userId,
            _organizationId: organizationId,
            entityType: type,
            entitySlug: null,
            permissions: { ...FULL_PERMISSIONS },
          } as LeanEntityPermission);
        }
      }
    }

    return permissions;
  }

  /**
   * Gets all contracts accessible to a user across all their organizations,
   * with effective permissions included.
   */
  async getUserAccessibleContracts(
    userId: string,
    queryParams: ContractIndexQueryParams,
    reqUser?: LeanUser
  ): Promise<{ contracts: any[]; total: number }> {
    const memberships = await this.organizationMembershipRepository.findByUserId(userId, true);
    const orgIds = memberships.map((m: any) => m._organizationId?.toString() ?? m._organizationId);

    if (orgIds.length === 0) {
      return { contracts: [], total: 0 };
    }

    const allContracts: any[] = [];

    for (const orgId of orgIds) {
      const membership = memberships.find((m: any) => (m._organizationId?.toString() ?? m._organizationId) === orgId);
      const orgRole = membership?.role as OrgRole | undefined;
      const isOwnerOrAdmin = reqUser?.role === 'ADMIN' || orgRole === 'OWNER' || orgRole === 'ADMIN';

      const orgQueryParams: ContractIndexQueryParams = {
        ...queryParams,
        selectedOrganizations: [orgId],
      };

      const orgPermissionsContext: OrgUserPermissionsContext = reqUser
        ? await this.buildOrgUserPermissionsContext(reqUser, orgRole ?? null, orgId)
        : {
            orgRole: null,
            contracts: [],
            collections: [],
            isGlobalAdmin: false,
            adminOrgIds: [],
          };

      const result = await this.contractRepository.findAll(orgQueryParams, orgPermissionsContext);

      if (result && result.contracts) {
        for (const contract of result.contracts) {
          const entitySlug = contract.slug;
          if (!entitySlug) continue;
          const permissions = await this.getEffectivePermissions(
            userId,
            orgId,
            'contract',
            entitySlug,
            orgRole
          );

          if (isOwnerOrAdmin || !contract.private || permissions.GET) {
            allContracts.push({
              ...contract,
              permissions,
              organization: { ...contract.organization, id: orgId, role: orgRole },
            });
          }
        }
      }
    }

    if (queryParams.name) {
      const nameFilter = queryParams.name.toLowerCase();
      const filtered = allContracts.filter((c: any) => c.name?.toLowerCase().includes(nameFilter));
      return { contracts: filtered, total: filtered.length };
    }

    const sortBy = queryParams.sortBy || 'name';
    const sortDir = queryParams.sort === 'asc' ? 1 : -1;
    allContracts.sort((a: any, b: any) => {
      const aVal = a[sortBy] ?? a.name ?? '';
      const bVal = b[sortBy] ?? b.name ?? '';
      if (typeof aVal === 'string') return aVal.localeCompare(bVal) * sortDir;
      return ((aVal as number) - (bVal as number)) * sortDir;
    });

    const offset = queryParams.offset || 0;
    const limit = queryParams.limit || 10;
    const paginated = allContracts.slice(offset, offset + limit);

    return { contracts: paginated, total: allContracts.length };
  }

  /**
   * Gets all collections accessible to a user across all their organizations,
   * with effective permissions included.
   */
  async getUserAccessibleCollections(
    userId: string,
    queryParams: CollectionIndexQueryParams,
    reqUser?: LeanUser
  ): Promise<{ collections: any[]; total: number }> {
    const memberships = await this.organizationMembershipRepository.findByUserId(userId, true);
    const orgIds = memberships.map((m: any) => m._organizationId?.toString() ?? m._organizationId);

    if (orgIds.length === 0) {
      return { collections: [], total: 0 };
    }

    const allCollections: any[] = [];

    for (const orgId of orgIds) {
      const membership = memberships.find((m: any) => (m._organizationId?.toString() ?? m._organizationId) === orgId);
      const orgRole = membership?.role as OrgRole | undefined;
      const isOwnerOrAdmin = reqUser?.role === 'ADMIN' || orgRole === 'OWNER' || orgRole === 'ADMIN';

      const orgQueryParams: CollectionIndexQueryParams = {
        ...queryParams,
        organizationIds: [orgId],
      };

      const orgPermissionsContext: OrgUserPermissionsContext = reqUser
        ? await this.buildOrgUserPermissionsContext(reqUser, orgRole ?? null, orgId)
        : {
            orgRole: null,
            contracts: [],
            collections: [],
            isGlobalAdmin: false,
            adminOrgIds: [],
          };

      const result = await this.contractCollectionRepository.findAll(orgQueryParams, orgPermissionsContext);

      if (result && result.collections) {
        for (const collection of result.collections) {
          const entitySlug = (collection as any).slug;
          if (!entitySlug) continue;
          const permissions = await this.getEffectivePermissions(
            userId,
            orgId,
            'contractCollection',
            entitySlug,
            orgRole
          );

          if (isOwnerOrAdmin || !(collection as any).private || permissions.GET) {
            allCollections.push({
              ...collection,
              permissions,
              organization: { ...(collection as any).organization, id: orgId, role: orgRole },
            });
          }
        }
      }
    }

    if (queryParams.name) {
      const nameFilter = queryParams.name.toLowerCase();
      const filtered = allCollections.filter((c: any) => c.name?.toLowerCase().includes(nameFilter));
      return { collections: filtered, total: filtered.length };
    }

    allCollections.sort((a: any, b: any) => {
      const aVal = a.name ?? '';
      const bVal = b.name ?? '';
      return aVal.localeCompare(bVal);
    });

    const offset = queryParams.offset || 0;
    const limit = queryParams.limit || 10;
    const paginated = allCollections.slice(offset, offset + limit);

    return { collections: paginated, total: allCollections.length };
  }

  /**
   * Gets effective permissions for the current user on a specific contract.
   */
  async getContractPermissions(
    userId: string,
    organizationId: string,
    contractSlug: string,
    userOrgRole?: OrgRole | null
  ): Promise<EntityPermissions> {
    const contract = await this.contractRepository.findBySlugAndOrganization(contractSlug, organizationId);
    if (!contract) {
      throw new Error('NOT FOUND: Contract not found');
    }

    const isOwnerOrAdmin = userOrgRole === 'OWNER' || userOrgRole === 'ADMIN';
    if (isOwnerOrAdmin) {
      return { ...FULL_PERMISSIONS };
    }
    const permissions = await this.getEffectivePermissions(
      userId,
      organizationId,
      'contract',
      contractSlug,
      userOrgRole
    );

    return permissions;
  }

  /**
   * Gets effective permissions for the current user on a specific collection.
   */
  async getContractCollectionPermissions(
    userId: string,
    organizationId: string,
    collectionSlug: string,
    userOrgRole?: OrgRole | null
  ): Promise<EntityPermissions> {
    const collection = await this.contractCollectionRepository.findByOrganizationAndSlug(
      organizationId,
      collectionSlug
    );
    if (!collection) {
      throw new Error('NOT FOUND: Collection not found');
    }

    const isOwnerOrAdmin = userOrgRole === 'OWNER' || userOrgRole === 'ADMIN';
    if (isOwnerOrAdmin) {
      return { ...FULL_PERMISSIONS };
    }
    const permissions = await this.getEffectivePermissions(
      userId,
      organizationId,
      'contractCollection',
      collectionSlug,
      userOrgRole
    );

    return permissions;
  }
}

export default PermissionService;
