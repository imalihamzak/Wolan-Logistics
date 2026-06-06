const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const { getAdminDashboardData } = require('../services/dashboardService');
const { getLiveMapData } = require('../services/liveMapService');

const getActorContext = (req) => ({
  id: req.user.id,
  role: req.user.role,
  hub_id: req.user.hub_id,
  assigned_hub_ids: req.user.assigned_hub_ids || [],
});

const getDashboardByLevel = (level, message) => asyncHandler(async (req, res) => {
  const dashboard = await getAdminDashboardData({
    actor: getActorContext(req),
    query: req.query,
    level,
  });

  return successResponse(res, message, { dashboard });
});

const getAdminDashboard = getDashboardByLevel('auto', 'Admin dashboard fetched successfully');
const getHubDashboard = getDashboardByLevel('hub', 'Hub dashboard fetched successfully');
const getRegionalDashboard = getDashboardByLevel('regional', 'Regional dashboard fetched successfully');
const getHQDashboard = getDashboardByLevel('hq', 'HQ dashboard fetched successfully');

const getLiveMap = asyncHandler(async (req, res) => {
  const liveMap = await getLiveMapData({
    actor: getActorContext(req),
    query: req.query,
  });

  return successResponse(res, 'Live map data fetched successfully', { liveMap });
});

module.exports = {
  getAdminDashboard,
  getHubDashboard,
  getRegionalDashboard,
  getHQDashboard,
  getLiveMap,
};
