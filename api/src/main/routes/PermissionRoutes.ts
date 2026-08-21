import express from 'express';
import PermissionController from '../controllers/PermissionController';
import { handleValidation } from '../middlewares/ValidationHandlingMiddleware';
import * as PermissionValidator from '../controllers/validation/PermissionValidation';

const loadPermissionRoutes = function (app: express.Application) {
  const permissionController = new PermissionController();
  const baseUrl = (process.env.BASE_URL_PATH ?? '') + '/api/v1';

  // Organization permission management (OWNER/ADMIN only)
  app
    .route(baseUrl + '/orgs/:orgId/permissions')
    .get(permissionController.getOrgPermissions)
    .post(
      PermissionValidator.setPermission,
      handleValidation,
      permissionController.setPermission
    );

  app
    .route(baseUrl + '/orgs/:orgId/permissions/:permissionId')
    .delete(
      PermissionValidator.removePermission,
      handleValidation,
      permissionController.removePermission
    );

  // Current user's permissions on a specific contract/collection
  app
    .route(baseUrl + '/contracts/:organizationId/:contractSlug/permissions')
    .get(permissionController.getContractPermissions);

  app
    .route(baseUrl + '/contractCollections/:organizationId/:collectionSlug/permissions')
    .get(permissionController.getContractCollectionPermissions);
};

export default loadPermissionRoutes;
