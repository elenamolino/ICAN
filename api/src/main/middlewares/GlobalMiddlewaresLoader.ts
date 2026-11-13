import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import { authenticationMiddleware } from './AuthenticationMiddleware';
import { authorizationMiddleware } from './AuthorizationMiddleware';
import { identityModePolicy } from '../controllers/ScoretechIdentityController';

const loadGlobalMiddlewares = (app: express.Application) => {
  // The SCORETech Identity endpoints rely on a cookie, so only the frontend may call them with credentials.
  app.use((request, response, next) => {
    if (request.path.startsWith((process.env.BASE_URL_PATH ?? '') + '/api/v1/auth/identity/')) {
      return cors({ origin: new URL(process.env.FRONTEND_URL || 'http://localhost:5173').origin, credentials: true })(request, response, next);
    }
    return cors()(request, response, next);
  });
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    })
  );
  app.use(express.static('public'));
  app.use(bodyParser.json({ limit: '2mb' }));
  app.use(bodyParser.urlencoded({ limit: '2mb', extended: true }));
  app.use(authenticationMiddleware);
  app.use(identityModePolicy);
  app.use(authorizationMiddleware);
};

export default loadGlobalMiddlewares;
