import { DOCUMENT_TYPES } from '../../utils/documentTypes';
import { check } from 'express-validator';

const documentType = () =>
  check('documentType')
    .optional({ values: 'null' })
    .isIn(DOCUMENT_TYPES)
    .withMessage(`The documentType field must be one of: ${DOCUMENT_TYPES.join(', ')}`);

// Who provides the service; null clears it.
const company = () =>
  check('company')
    .optional({ values: 'null' })
    .isString()
    .withMessage('The company field must be a string')
    .isLength({ max: 255 })
    .withMessage('The company must have at most 255 characters')
    .trim();

const create = [
  check('name')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('The name field is required')
    .isString()
    .withMessage('The name field must be a string')
    .isLength({ min: 1, max: 255 })
    .withMessage('The name must have between 1 and 255 characters long')
    .trim(),
  check('private')
    .exists({ checkNull: true })
    .isBoolean()
    .withMessage('The private field is required and must be boolean'),
  check('collectionId')
    .optional()
    .isString()
    .withMessage('The collectionId field must be a string')
    .trim(),
  check('url')
    .optional()
    .isURL()
    .withMessage('The url field must be a valid URL')
    .trim(),
  check('content')
    .optional()
    .isString()
    .withMessage('The content field must be a string'),
  check('version')
    .optional()
    .isString()
    .withMessage('The version field must be a string')
    .trim(),
  documentType(),
  company(),
];

const update = [
  check('name')
    .optional()
    .isString()
    .withMessage('The name field must be a string')
    .isLength({ min: 1, max: 255 })
    .withMessage('The name must have between 1 and 255 characters long')
    .trim(),
  check('private')
    .optional()
    .isBoolean()
    .withMessage('The private field must be boolean'),
  check('url')
    .optional()
    .isURL()
    .withMessage('The url field must be a valid URL')
    .trim(),
  check('content')
    .optional()
    .isString()
    .withMessage('The content field must be a string'),
  check('version')
    .optional()
    .isString()
    .withMessage('The version field must be a string')
    .trim(),
  documentType(),
  company(),
];

export { create, update };
