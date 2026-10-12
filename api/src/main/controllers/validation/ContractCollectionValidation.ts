import { check, query } from 'express-validator';
import { CAPTURE_AGES, DOCUMENT_FILTERS, POLICY_TYPES, REVIEW_STATES } from '../../utils/collectionServicePage';

const create = [
  check('name')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('The name field is required')
    .isString()
    .withMessage('The name field must be a string')
    .isLength({ min: 1, max: 255 })
    .withMessage('The name must have between 1 and 255 characters long')
    .trim(),
  check('description')
    .optional()
    .isString()
    .withMessage('The description field must be a string')
    .trim(),
  check('private')
    .optional()
    .isBoolean()
    .withMessage('The private field must be boolean'),
];

const update = [
  check('name')
    .optional()
    .isString()
    .withMessage('The name field must be a string')
    .isLength({ min: 1, max: 255 })
    .withMessage('The name must have between 1 and 255 characters long')
    .trim(),
  check('description')
    .optional()
    .isString()
    .withMessage('The description field must be a string')
    .trim(),
  check('private')
    .optional()
    .isBoolean()
    .withMessage('The private field must be boolean'),
];

function csvOf(field: string, allowed: readonly string[]) {
  return query(field)
    .optional()
    .isString()
    .custom((value: string) => value.split(',').every(item => allowed.includes(item)))
    .withMessage(`The ${field} query param must be a comma-separated list of: ${allowed.join(', ')}`);
}

const indexServices = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('The limit query param must be an integer between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('The offset query param must be a non-negative integer'),
  query('name').optional().isString().withMessage('The name query param must be a string'),
  csvOf('documents', DOCUMENT_FILTERS),
  csvOf('policyTypes', POLICY_TYPES),
  csvOf('review', REVIEW_STATES),
  csvOf('captured', CAPTURE_AGES),
];

export { create, update, indexServices };
