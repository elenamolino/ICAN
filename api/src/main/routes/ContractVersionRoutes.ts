import express from 'express';
import ContractVersionController from '../controllers/ContractVersionController';

const loadContractVersionRoutes = function (app: express.Application) {
  const contractVersionController = new ContractVersionController();

  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  app.route(baseUrl + '/contracts/:organizationId/:contractSlug/versions').get(contractVersionController.index);

  app
    .route(baseUrl + '/contracts/:organizationId/:contractSlug/versions/:versionId')
    .get(contractVersionController.show)
    .delete(contractVersionController.destroy);
};

export default loadContractVersionRoutes;
