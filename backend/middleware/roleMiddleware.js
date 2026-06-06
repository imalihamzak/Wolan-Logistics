const AppError = require('../utils/AppError');

const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Not authorized', 401));
  }

  const roles = Array.isArray(allowedRoles[0]) ? allowedRoles[0] : allowedRoles;

  if (!roles.includes(req.user.role)) {
    return next(new AppError('Forbidden', 403));
  }

  return next();
};

module.exports = authorizeRoles;