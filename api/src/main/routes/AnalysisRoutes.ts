import express from 'express';
import AnalysisController from '../controllers/AnalysisController';
import * as AnalysisValidator from '../controllers/validation/AnalysisValidation';
import { handleValidation } from '../middlewares/ValidationHandlingMiddleware';

const loadAnalysisRoutes = function (app: express.Application) {
  const analysisController = new AnalysisController();

  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  app
    .route(baseUrl + '/analysis/ai-classify')
    .post(AnalysisValidator.classify, handleValidation, analysisController.classify);
};

export default loadAnalysisRoutes;
