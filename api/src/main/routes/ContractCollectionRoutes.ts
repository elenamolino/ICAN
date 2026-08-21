import express from 'express';
import ContractCollectionController from '../controllers/ContractCollectionController';
import { handleValidation } from '../middlewares/ValidationHandlingMiddleware';
import * as ContractCollectionValidator from '../controllers/validation/ContractCollectionValidation';

const loadFileRoutes = function (app: express.Application) {
  const contractCollectionController = new ContractCollectionController();

  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  app.route(baseUrl + '/contractCollections').get(contractCollectionController.index);

  app
    .route(baseUrl + '/contractCollections/:organizationId')
    .get(contractCollectionController.indexByOrganizationId)
    .post(ContractCollectionValidator.create, handleValidation, contractCollectionController.create);

  app
    .route(baseUrl + '/contractCollections/:organizationId/:collectionSlug')
    .get(contractCollectionController.show)
    .post(contractCollectionController.addContractToCollection)
    .put(ContractCollectionValidator.update, handleValidation, contractCollectionController.update)
    .delete(contractCollectionController.destroy);

  app
    .route(baseUrl + '/contractCollections/:organizationId/:collectionSlug/contracts/:contractSlug')
    .delete(contractCollectionController.removeContractFromCollection);
};

export default loadFileRoutes;
