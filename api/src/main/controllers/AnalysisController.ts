import container from '../config/container';
import AnalysisService from '../services/AnalysisService';
import { handleError } from '../utils/users/helpers';

class AnalysisController {
  private analysisService: AnalysisService;

  constructor() {
    this.analysisService = container.resolve('analysisService');
    this.classify = this.classify.bind(this);
  }

  async classify(req: any, res: any) {
    try {
      const result = await this.analysisService.classify(req.body.text);
      res.json(result);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }
}

export default AnalysisController;
