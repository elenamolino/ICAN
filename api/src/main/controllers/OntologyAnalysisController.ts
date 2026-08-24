import multer from 'multer';
import container from '../config/container';
import OntologyAnalysisService from '../services/OntologyAnalysisService';
import { handleError } from '../utils/users/helpers';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/json', 'text/plain', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only .json, .txt and .pdf files are allowed'));
  },
});

class OntologyAnalysisController {
  private ontologyAnalysisService: OntologyAnalysisService;
  public uploadMiddleware: any;

  constructor() {
    this.ontologyAnalysisService = container.resolve('ontologyAnalysisService');
    this.uploadMiddleware = upload.single('file');
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
      if (!req.file) {
        res.status(422).send({ errors: [{ msg: 'The file field is required', path: 'file' }] });
        return;
      }

      const { jobId } = await this.ontologyAnalysisService.submitJob(
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
        },
        {
          provider: req.body.provider,
          title: req.body.title,
          date: req.body.date,
          model: req.body.model,
          baseUrl: req.body.baseUrl,
          runEvaluation:
            req.body.runEvaluation === undefined ? undefined : req.body.runEvaluation === 'true',
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
