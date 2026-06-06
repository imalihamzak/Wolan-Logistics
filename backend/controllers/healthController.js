const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');

const buildApiInfo = () => ({
  service: 'wolan-logistics-backend',
  status: 'running',
  environment: process.env.NODE_ENV || 'development',
  api_base: '/api/v1',
  health_url: '/api/v1/health',
  timestamp: new Date().toISOString(),
});

const welcome = asyncHandler(async (req, res) => successResponse(
  res,
  'Welcome to Wolan Logistics API',
  buildApiInfo(),
  200
));

const healthCheck = asyncHandler(async (req, res) => successResponse(
  res,
  'API is healthy',
  buildApiInfo(),
  200
));

module.exports = {
  welcome,
  healthCheck,
};
