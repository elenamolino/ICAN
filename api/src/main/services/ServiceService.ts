import container from '../config/container';
import ServiceRepository from '../repositories/mongoose/ServiceRepository';
import { generateSlug } from '../utils/slug-manager';

class ServiceService {
  private serviceRepository: ServiceRepository;

  constructor() {
    this.serviceRepository = container.resolve('serviceRepository');
  }

  async listByCollection(collectionId: string) {
    return this.serviceRepository.findByCollectionId(collectionId);
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
}

export default ServiceService;
