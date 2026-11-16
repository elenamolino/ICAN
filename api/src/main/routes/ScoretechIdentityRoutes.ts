import type express from 'express';
import ScoretechIdentityController from '../controllers/ScoretechIdentityController';

const loadScoretechIdentityRoutes = function (app: express.Application) {
  const controller = new ScoretechIdentityController();
  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1/auth';

  app.get(baseUrl + '/config', controller.config);
  app.get(baseUrl + '/identity/login', controller.login);
  app.get(baseUrl + '/identity/callback', controller.callback);
  app.post(baseUrl + '/identity/session', controller.session);
  app.post(baseUrl + '/identity/logout', controller.logout);
  app.post(baseUrl + '/identity/link', controller.link);
};

export default loadScoretechIdentityRoutes;
