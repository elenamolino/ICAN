import { check } from 'express-validator';

const submit = [
  check('text')
    .exists({ checkNull: true })
    .withMessage('The text field is required')
    .isString()
    .withMessage('The text field must be a string')
    .custom((value: string) => value.trim().length > 0)
    .withMessage('The text field must not be empty'),
  check('provider')
    .optional()
    .isString()
    .withMessage('The provider field must be a string')
    .isLength({ max: 255 })
    .trim(),
  check('title')
    .optional()
    .isString()
    .withMessage('The title field must be a string')
    .isLength({ max: 255 })
    .trim(),
  check('date')
    .optional()
    .isString()
    .withMessage('The date field must be a string')
    .isLength({ max: 64 })
    .trim(),
  check('model')
    .optional()
    .isString()
    .withMessage('The model field must be a string')
    .isLength({ max: 255 })
    .trim(),
  check('baseUrl')
    .optional()
    .isString()
    .withMessage('The baseUrl field must be a string')
    .isLength({ max: 255 })
    .trim(),
  check('runEvaluation')
    .optional()
    .isBoolean()
    .withMessage('The runEvaluation field must be boolean'),
];

export { submit };
