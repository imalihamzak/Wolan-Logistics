const AppError = require('../utils/AppError');

const validateRequest = (validator) => (req, res, next) => {
  const { value, errors } = validator(req);

  if (errors.length > 0) {
    const error = new AppError('Validation failed', 400);
    error.errors = errors;
    return next(error);
  }

  req.validatedBody = value;
  return next();
};

module.exports = validateRequest;