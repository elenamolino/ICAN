import mongoose from 'mongoose';
import RepositoryBase from '../RepositoryBase';
import ServiceMongoose from './models/ServiceMongoose';

class ServiceRepository extends RepositoryBase {
  async findByCollectionAndSlug(collectionId: string, slug: string) {
    const service = await ServiceMongoose.findOne({ slug, _collectionId: String(collectionId) });
    if (!service) return null;
    return service.toObject();
  }

  async findByCollectionId(collectionId: string) {
    const services = await ServiceMongoose.find({ _collectionId: String(collectionId) }).sort({ name: 1 });
    return services.map(s => s.toObject());
  }

  async findById(id: string) {
    const service = await ServiceMongoose.findById(id);
    if (!service) return null;
    return service.toObject();
  }

  async create(data: Record<string, any>) {
    if (data._collectionId) data._collectionId = String(data._collectionId);
    if (data._organizationId) data._organizationId = new mongoose.Types.ObjectId(data._organizationId);

    const service = await ServiceMongoose.create(data);
    return service.toObject();
  }

  async deleteById(id: string) {
    const result = await ServiceMongoose.deleteOne({ _id: id });
    return result?.deletedCount === 1;
  }
}

export default ServiceRepository;
