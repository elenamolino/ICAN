import container from '../config/container';
import ContractVersionService from '../services/ContractVersionService';
import { handleError } from '../utils/users/helpers';

class ContractVersionController {
  private contractVersionService: ContractVersionService;

  constructor() {
    this.contractVersionService = container.resolve('contractVersionService');
    this.index = this.index.bind(this);
    this.show = this.show.bind(this);
  }

  async index(req: any, res: any) {
    try {
      const contract: any = await this.contractVersionService.resolveContractOrThrow(
        req.params.organizationId,
        req.params.contractSlug,
        req.user
      );
      const versions = await this.contractVersionService.listByContract(contract.id ?? contract._id?.toString());
      res.json({ versions });
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async show(req: any, res: any) {
    try {
      const contract: any = await this.contractVersionService.resolveContractOrThrow(
        req.params.organizationId,
        req.params.contractSlug,
        req.user
      );
      const version = await this.contractVersionService.getById(
        contract.id ?? contract._id?.toString(),
        req.params.versionId
      );
      res.json(version);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }
}

export default ContractVersionController;
