import { check } from 'express-validator';

const save = [
  check('collectionId')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('The collectionId field is required')
    .isString()
    .withMessage('The collectionId field must be a string')
    .trim(),
  check('serviceId')
    .optional()
    .isString()
    .withMessage('The serviceId field must be a string')
    .trim(),
  check('serviceName')
    .optional()
    .isString()
    .withMessage('The serviceName field must be a string')
    .trim(),
  check('contractId')
    .optional()
    .isString()
    .withMessage('The contractId field must be a string')
    .trim(),
  check('contractName')
    .optional()
    .isString()
    .withMessage('The contractName field must be a string')
    .trim(),
  check('provider')
    .optional()
    .isString()
    .withMessage('The provider field must be a string')
    .trim(),
  check('title')
    .optional()
    .isString()
    .withMessage('The title field must be a string')
    .trim(),
  check('date')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('The date field is required')
    .isISO8601()
    .withMessage('The date field must be a valid ISO8601 date'),
  check('text')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('The text field is required')
    .isString()
    .withMessage('The text field must be a string'),
  check('summary')
    .exists({ checkNull: true })
    .withMessage('The summary field is required')
    .isObject()
    .withMessage('The summary field must be an object'),
  check('clauses')
    .exists({ checkNull: true })
    .withMessage('The clauses field is required')
    .isArray()
    .withMessage('The clauses field must be an array'),
  check('collectionId').custom((value, { req }) => {
    const body = req.body ?? {};
    if (!body.serviceId && !body.serviceName) {
      throw new Error('Either serviceId or serviceName is required');
    }
    if (!body.contractId && !body.contractName) {
      throw new Error('Either contractId or contractName is required');
    }
    if (!body.contractId && (!body.provider || !body.title)) {
      throw new Error('provider and title are required when creating a new contract');
    }
    return true;
  }),
];

export { save };
