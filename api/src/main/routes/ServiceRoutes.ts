import { check } from 'express-validator';
import { handleValidation } from '../middlewares/ValidationHandlingMiddleware';
import express from 'express';
import ServiceController from '../controllers/ServiceController';

const loadServiceRoutes = function (app: express.Application) {
  const serviceController = new ServiceController();

  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  app.route(baseUrl + '/services').get(serviceController.index);
  app
    .route(baseUrl + '/services/:id')
    .put(
      check('pricingUrl')
        .optional({ values: 'null' })
        .isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('The pricingUrl field must be a web address'),
      check('pricingSourceUrl')
        .optional({ values: 'null' })
        .isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('The pricingSourceUrl field must be a web address'),
      handleValidation,
      serviceController.update
    )
    .delete(serviceController.destroy);
};

export default loadServiceRoutes;
