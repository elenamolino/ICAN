import { check } from 'express-validator';

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

export { create, update };
