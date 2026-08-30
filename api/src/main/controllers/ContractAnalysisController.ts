import container from '../config/container';
import AnalysisSaveService from '../services/AnalysisSaveService';
import { handleError } from '../utils/users/helpers';

class ContractAnalysisController {
  private analysisSaveService: AnalysisSaveService;

  constructor() {
    this.analysisSaveService = container.resolve('analysisSaveService');
    this.save = this.save.bind(this);
  }

  async save(req: any, res: any) {
    try {
      const result = await this.analysisSaveService.saveAiClassifyResult(
        req.params.organizationId,
        req.user,
        req.body
      );
      res.status(201).json(result);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }
}

export default ContractAnalysisController;
