import container from '../config/container';
import ServiceService from '../services/ServiceService';
import { handleError } from '../utils/users/helpers';

class ServiceController {
  private serviceService: ServiceService;

  constructor() {
    this.serviceService = container.resolve('serviceService');
    this.index = this.index.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  async index(req: any, res: any) {
    try {
      const { collectionId } = req.query;
      if (!collectionId) {
        return res.status(400).send({ error: 'INVALID DATA: The collectionId query param is required' });
      }
      const services = await this.serviceService.listByCollection(collectionId as string);
      res.json({ services });
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async destroy(req: any, res: any) {
    try {
      const result = await this.serviceService.destroy(req.params.id, req.user);
      if (!result) {
        return res.status(404).send({ error: 'NOT FOUND: Service not found' });
      }
      res.status(200).json({ message: 'Service deleted successfully' });
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }
}

export default ServiceController;
