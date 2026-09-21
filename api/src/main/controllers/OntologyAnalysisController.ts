import container from '../config/container';
import OntologyAnalysisService from '../services/OntologyAnalysisService';
import { handleError } from '../utils/users/helpers';

class OntologyAnalysisController {
  private ontologyAnalysisService: OntologyAnalysisService;

  constructor() {
    this.ontologyAnalysisService = container.resolve('ontologyAnalysisService');
    this.models = this.models.bind(this);
    this.submit = this.submit.bind(this);
    this.status = this.status.bind(this);
    this.report = this.report.bind(this);
  }

  async models(_req: any, res: any) {
    try {
      const presets = await this.ontologyAnalysisService.listModels();
      res.json(presets);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async submit(req: any, res: any) {
    try {
      const { jobId } = await this.ontologyAnalysisService.submitJob(
        req.body.text,
        {
          provider: req.body.provider,
          title: req.body.title,
          date: req.body.date,
          model: req.body.model,
          baseUrl: req.body.baseUrl,
          runEvaluation:
            req.body.runEvaluation === undefined
              ? undefined
              : req.body.runEvaluation === true || req.body.runEvaluation === 'true',
        }
      );
      res.status(202).json({ jobId });
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async status(req: any, res: any) {
    try {
      const jobStatus = await this.ontologyAnalysisService.getJobStatus(req.params.jobId);
      res.json(jobStatus);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async report(req: any, res: any) {
    try {
      const report = await this.ontologyAnalysisService.getJobReport(req.params.jobId);
      res.json(report);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }
}

export default OntologyAnalysisController;
