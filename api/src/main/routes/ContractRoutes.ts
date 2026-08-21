import express from 'express';
import ContractController from '../controllers/ContractController';
import * as ContractValidator from '../controllers/validation/ContractValidation';
import { handleValidation } from '../middlewares/ValidationHandlingMiddleware';

const loadFileRoutes = function (app: express.Application) {
  const contractController = new ContractController();

  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  app.route(baseUrl + '/contracts').get(contractController.index);

  app
    .route(baseUrl + '/contracts/:organizationId')
    .get(contractController.indexByOrganization)
    .post(ContractValidator.create, handleValidation, contractController.create);

  app
    .route(baseUrl + '/contracts/:organizationId/:contractSlug')
    .get(contractController.show)
    .put(ContractValidator.update, handleValidation, contractController.update)
    .delete(contractController.destroy);
};

export default loadFileRoutes;
