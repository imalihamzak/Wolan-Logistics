const mongoose = require('mongoose');
const { MulterError } = require('multer');

const { errorResponse } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.isOperational ? err.message : 'Internal server error';
  let errors = err.errors || null;

  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((validationError) => validationError.message);
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}`;
  } else if (err?.code === 11000) {
    statusCode = 409;
    message = 'Duplicate key error';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err instanceof MulterError) {
    statusCode = 400;
    message = err.message;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  return errorResponse(res, message, statusCode, errors);
};

module.exports = errorHandler;