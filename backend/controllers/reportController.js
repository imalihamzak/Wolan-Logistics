const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const { getReportData } = require('../services/reportService');

const getActorContext = (req) => ({
  id: req.user.id,
  role: req.user.role,
  hub_id: req.user.hub_id,
  assigned_hub_ids: req.user.assigned_hub_ids || [],
});

const getAdminReports = asyncHandler(async (req, res) => {
  const reports = await getReportData({
    actor: getActorContext(req),
    query: req.query,
  });

  return successResponse(res, 'Admin reports fetched successfully', { reports });
});

module.exports = {
  getAdminReports,
};
