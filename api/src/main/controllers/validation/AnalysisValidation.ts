import { check } from 'express-validator';

const classify = [
  check('text')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('The text field is required')
    .isString()
    .withMessage('The text field must be a string')
    .isLength({ min: 1, max: 200000 })
    .withMessage('The text must have between 1 and 200000 characters long')
    .trim(),
];

export { classify };
