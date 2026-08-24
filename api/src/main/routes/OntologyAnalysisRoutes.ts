import express from 'express';
import OntologyAnalysisController from '../controllers/OntologyAnalysisController';
import * as OntologyAnalysisValidator from '../controllers/validation/OntologyAnalysisValidation';
import { handleValidation } from '../middlewares/ValidationHandlingMiddleware';

const loadOntologyAnalysisRoutes = function (app: express.Application) {
  const ontologyAnalysisController = new OntologyAnalysisController();

  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  app.route(baseUrl + '/analysis/ontology-analysis/models').get(ontologyAnalysisController.models);

  app
    .route(baseUrl + '/analysis/ontology-analysis')
    .post(
      ontologyAnalysisController.uploadMiddleware,
      OntologyAnalysisValidator.submit,
      handleValidation,
      ontologyAnalysisController.submit
    );

  app.route(baseUrl + '/analysis/ontology-analysis/:jobId').get(ontologyAnalysisController.status);

  app
    .route(baseUrl + '/analysis/ontology-analysis/:jobId/report')
    .get(ontologyAnalysisController.report);
};

export default loadOntologyAnalysisRoutes;
