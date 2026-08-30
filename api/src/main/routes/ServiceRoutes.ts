import express from 'express';
import ServiceController from '../controllers/ServiceController';

const loadServiceRoutes = function (app: express.Application) {
  const serviceController = new ServiceController();

  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  app.route(baseUrl + '/services').get(serviceController.index);
};

export default loadServiceRoutes;
