import express from 'express';
import ContractAnalysisController from '../controllers/ContractAnalysisController';
import * as ContractAnalysisValidator from '../controllers/validation/ContractAnalysisValidation';
import { handleValidation } from '../middlewares/ValidationHandlingMiddleware';

const loadContractAnalysisRoutes = function (app: express.Application) {
  const contractAnalysisController = new ContractAnalysisController();

  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  app
    .route(baseUrl + '/contracts/:organizationId/ai-classify/save')
    .post(ContractAnalysisValidator.save, handleValidation, contractAnalysisController.save);
};

export default loadContractAnalysisRoutes;
