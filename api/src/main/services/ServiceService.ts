import container from '../config/container';
import ServiceRepository from '../repositories/mongoose/ServiceRepository';
import ContractRepository from '../repositories/mongoose/ContractRepository';
import PermissionService from './PermissionService';
import { generateSlug } from '../utils/slug-manager';
import { LeanUser } from '../types/models/User';

class ServiceService {
  private serviceRepository: ServiceRepository;
  private contractRepository: ContractRepository;
  private permissionService: PermissionService;

  constructor() {
    this.serviceRepository = container.resolve('serviceRepository');
    this.contractRepository = container.resolve('contractRepository');
    this.permissionService = container.resolve('permissionService');
  }

  async findOrCreate(collectionId: string, organizationId: string, name: string) {
    const slug = generateSlug(name);
    const existing = await this.serviceRepository.findByCollectionAndSlug(collectionId, slug);
    if (existing) return existing;

    return this.serviceRepository.create({
      name,
      slug,
      _collectionId: collectionId,
      _organizationId: organizationId,
    });
  }

  /** Sets where the service's pricing is. Like deleting, only for owners and admins of its organization. */
  async update(serviceId: string, data: { pricingUrl?: string | null }, reqUser: LeanUser, apiKeyScopes?: { organizationId: string }[]) {
    const service: any = await this.serviceRepository.findById(serviceId);
    if (!service) throw new Error('NOT FOUND: Service not found');
    const organizationId = String(service._organizationId);
    // An API key only reaches the organizations of its scope.
    if (apiKeyScopes && !apiKeyScopes.some(scope => String(scope.organizationId) === organizationId)) {
      throw new Error('PERMISSION ERROR: The API key has no access to this organization');
    }
    const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
    if (reqUser.role !== 'ADMIN' && orgRole !== 'OWNER' && orgRole !== 'ADMIN') {
      throw new Error('PERMISSION ERROR: Only organization owners/admins can change a service');
    }
    const updated = await this.serviceRepository.update(serviceId, { pricingUrl: data.pricingUrl ?? null });
    return { id: String(updated._id), name: updated.name, slug: updated.slug, pricingUrl: updated.pricingUrl ?? null };
  }

  // Services have no per-entity permission grants of their own (unlike
  // Contract/ContractCollection), so only org OWNER/ADMIN (or a global ADMIN)
  // can delete one — there's no MEMBER-with-explicit-grant path here.
  async destroy(serviceId: string, reqUser: LeanUser) {
    const service: any = await this.serviceRepository.findById(serviceId);
    if (!service) {
      throw new Error('NOT FOUND: Service not found');
    }

    const organizationId = String(service._organizationId);
    const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
    const isAllowed = reqUser.role === 'ADMIN' || orgRole === 'OWNER' || orgRole === 'ADMIN';
    if (!isAllowed) {
      throw new Error('PERMISSION ERROR: Only organization owners/admins can delete a service');
    }

    await this.contractRepository.removeContractsFromService(serviceId);
    return this.serviceRepository.deleteById(serviceId);
  }
}

export default ServiceService;
