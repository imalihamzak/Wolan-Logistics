const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const { lookupOpenRouteServiceAddresses } = require('../services/mapProviderService');

const lookupAddresses = asyncHandler(async (req, res) => {
  const results = await lookupOpenRouteServiceAddresses({
    query: req.query.query || req.query.q,
    limit: req.query.limit,
  });

  return successResponse(res, 'Address lookup completed successfully', {
    results,
    provider: 'openrouteservice',
  });
});

module.exports = {
  lookupAddresses,
};
