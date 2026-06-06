const mongoose = require('mongoose');

const Hub = require('../models/Hub');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const {
  getHubDeliveryStats,
  getHubPerformanceMetrics,
  getHubRiderStats,
  getHubMerchantStats,
  getHubRevenueBreakdown,
  getHubZonePerformance,
  getHQDashboardSummary,
  getMultiHubComparison,
  getTimeSeriesAnalytics,
  getOrderFunnel,
} = require('../services/hubAnalyticsService');
const {
  canAccessAllHubs,
  buildHubDocumentFilter,
  assertHubAccess,
  HUB_DASHBOARD_ROLES,
} = require('../utils/hubAccess');

/**
 * Get hub context from request
 */
const getHubContext = (req) => ({
  userId: req.user?.id,
  userRole: req.user?.role,
  hubId: req.user?.hub_id,
  assignedHubIds: req.user?.assigned_hub_ids || [],
});

/**
 * Create a new hub
 */
const createHub = asyncHandler(async (req, res) => {
  const { name, code, address, city, state, country, zone, manager_id, contact_phone, contact_email, operating_hours, coordinates } = req.body;

  // Check if code already exists
  const existingHub = await Hub.findOne({ code: code.toUpperCase() });
  if (existingHub) {
    throw new AppError('Hub code already exists', 400);
  }

  // Validate manager_id if provided
  if (manager_id) {
    const manager = await User.findOne({ _id: manager_id, role: 'hub_manager' });
    if (!manager) {
      throw new AppError('Invalid manager ID or user is not a hub manager', 400);
    }
    // Check if manager already assigned to another hub
    if (manager.hub_id) {
      throw new AppError('Manager already assigned to another hub', 400);
    }
  }

  const hub = new Hub({
    name,
    code: code.toUpperCase(),
    address,
    city,
    state,
    country: country || 'Uganda',
    zone,
    manager_id,
    contact_phone,
    contact_email,
    operating_hours,
    coordinates,
  });

  await hub.save();

  // Assign manager to hub if provided
  if (manager_id) {
    await User.findByIdAndUpdate(manager_id, { hub_id: hub._id });
  }

  return successResponse(res, 'Hub created successfully', { hub }, 201);
});

/**
 * List all hubs
 */
const listHubs = asyncHandler(async (req, res) => {
  const context = getHubContext(req);
  const { page = 1, limit = 20, search, is_active, city, state, hub_id: requestedHubId } = req.query;

  const filter = {};

  Object.assign(filter, buildHubDocumentFilter(req.user, { hub_id: requestedHubId }, {
    actionName: 'Hub list',
  }));

  if (is_active !== undefined) {
    filter.is_active = is_active === 'true';
  }

  if (city) filter.city = new RegExp(city, 'i');
  if (state) filter.state = new RegExp(state, 'i');
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { code: new RegExp(search, 'i') },
      { city: new RegExp(search, 'i') },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [hubs, total] = await Promise.all([
    Hub.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('manager_id', 'full_name email phone'),
    Hub.countDocuments(filter),
  ]);

  return successResponse(res, 'Hubs fetched successfully', {
    hubs,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

/**
 * Get hub by ID
 */
const getHubById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const context = getHubContext(req);

  const hub = await Hub.findById(id).populate('manager_id', 'full_name email phone profile_image');

  if (!hub) {
    throw new AppError('Hub not found', 404);
  }

  assertHubAccess(req.user, hub._id, 'Hub detail access');

  return successResponse(res, 'Hub fetched successfully', { hub });
});

/**
 * Update hub
 */
const updateHub = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const context = getHubContext(req);
  const { name, code, address, city, state, zone, contact_phone, contact_email, operating_hours, coordinates } = req.body;

  const hub = await Hub.findById(id);

  if (!hub) {
    throw new AppError('Hub not found', 404);
  }

  assertHubAccess(req.user, hub._id, 'Hub update');

  // Update fields
  if (name) hub.name = name;
  if (code) hub.code = code.toUpperCase();
  if (address) hub.address = address;
  if (city) hub.city = city;
  if (state) hub.state = state;
  if (zone) hub.zone = zone;
  if (contact_phone) hub.contact_phone = contact_phone;
  if (contact_email) hub.contact_email = contact_email;
  if (operating_hours) hub.operating_hours = operating_hours;
  if (coordinates) hub.coordinates = coordinates;

  await hub.save();

  return successResponse(res, 'Hub updated successfully', { hub });
});

/**
 * Suspend/Activate hub
 */
const suspendHub = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_active, reason } = req.body;
  const context = getHubContext(req);

  const hub = await Hub.findById(id);

  if (!hub) {
    throw new AppError('Hub not found', 404);
  }

  assertHubAccess(req.user, hub._id, 'Hub suspension');

  hub.is_active = is_active;
  await hub.save();

  // Deactivate all users in this hub if suspending
  if (is_active === false) {
    await User.updateMany(
      { hub_id: hub._id, role: { $in: HUB_DASHBOARD_ROLES } },
      { is_active: false }
    );
  }

  const message = is_active ? 'Hub activated successfully' : 'Hub suspended successfully';

  return successResponse(res, message, { hub });
});

/**
 * Assign manager to hub
 */
const assignManager = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { manager_id } = req.body;
  const context = getHubContext(req);

  const hub = await Hub.findById(id);

  if (!hub) {
    throw new AppError('Hub not found', 404);
  }

  assertHubAccess(req.user, hub._id, 'Hub manager assignment');

  // Validate new manager
  if (!manager_id) {
    // Unassign current manager
    if (hub.manager_id) {
      await User.findByIdAndUpdate(hub.manager_id, { hub_id: null });
    }
    hub.manager_id = null;
    await hub.save();
    return successResponse(res, 'Manager unassigned successfully', { hub });
  }

  const newManager = await User.findOne({ _id: manager_id, role: 'hub_manager' });
  if (!newManager) {
    throw new AppError('Invalid manager ID or user is not a hub manager', 400);
  }

  // Unassign previous manager if any
  if (hub.manager_id) {
    await User.findByIdAndUpdate(hub.manager_id, { hub_id: null });
  }

  // Check if new manager already has a hub
  if (newManager.hub_id && String(newManager.hub_id) !== String(id)) {
    throw new AppError('Manager already assigned to another hub', 400);
  }

  hub.manager_id = manager_id;
  await hub.save();

  // Update manager's hub_id
  await User.findByIdAndUpdate(manager_id, { hub_id: hub._id });

  return successResponse(res, 'Manager assigned successfully', { hub });
});

/**
 * Get hub dashboard/analytics
 */
const getHubAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { period = 30 } = req.query;
  const context = getHubContext(req);

  const hub = await Hub.findById(id);

  if (!hub) {
    throw new AppError('Hub not found', 404);
  }

  assertHubAccess(req.user, hub._id, 'Hub analytics');

  const user = { ...req.user, hub_id: id };

  // Get all analytics in parallel
  const [deliveryStats, performanceMetrics, riderStats, merchantStats, revenue, zonePerformance, funnel] = await Promise.all([
    getHubDeliveryStats(user, id),
    getHubPerformanceMetrics(user, id, Number(period)),
    getHubRiderStats(user, id),
    getHubMerchantStats(user, id),
    getHubRevenueBreakdown(user, id),
    getHubZonePerformance(user, id),
    getOrderFunnel(user, id),
  ]);

  return successResponse(res, 'Hub analytics fetched successfully', {
    hub: {
      id: hub._id,
      name: hub.name,
      code: hub.code,
      city: hub.city,
    },
    delivery_stats: deliveryStats,
    performance: performanceMetrics,
    rider_stats: riderStats,
    merchant_stats: merchantStats,
    revenue,
    zone_performance: zonePerformance,
    order_funnel: funnel,
  });
});

/**
 * Get HQ dashboard (all hubs)
 */
const getHQDashboard = asyncHandler(async (req, res) => {
  // Only HQ roles can access cross-hub HQ data.
  if (!canAccessAllHubs(req.user)) {
    throw new AppError('HQ dashboard access requires HQ permission', 403);
  }

  const summary = await getHQDashboardSummary();
  const comparison = await getMultiHubComparison();

  return successResponse(res, 'HQ dashboard fetched successfully', {
    summary,
    hub_comparison: comparison,
  });
});

const listAvailableHubManagers = asyncHandler(async (req, res) => {
  const { hub_id } = req.query;
  const match = {
    role: 'hub_manager',
    is_active: true,
    $or: hub_id
      ? [{ hub_id: null }, { hub_id }]
      : [{ hub_id: null }, { hub_id: { $exists: false } }],
  };

  const managers = await User.find(match)
    .sort({ full_name: 1 })
    .select('full_name email phone hub_id');

  return successResponse(res, 'Hub managers fetched successfully', { managers });
});

/**
 * Get hub delivery report
 */
const getHubDeliveryReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { from, to, period = 30 } = req.query;
  const context = getHubContext(req);

  const hub = await Hub.findById(id);
  if (!hub) {
    throw new AppError('Hub not found', 404);
  }

  assertHubAccess(req.user, hub._id, 'Hub delivery report');

  const user = { ...req.user, hub_id: id };
  const dateRange = { from, to };

  const [deliveryStats, performanceMetrics] = await Promise.all([
    getHubDeliveryStats(user, id, dateRange),
    getHubPerformanceMetrics(user, id, Number(period)),
  ]);

  return successResponse(res, 'Delivery report fetched successfully', {
    delivery_stats: deliveryStats,
    performance: performanceMetrics,
  });
});

/**
 * Get hub riders report
 */
const getHubRiderReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const context = getHubContext(req);

  const hub = await Hub.findById(id);
  if (!hub) {
    throw new AppError('Hub not found', 404);
  }

  assertHubAccess(req.user, hub._id, 'Hub rider report');

  const riderStats = await getHubRiderStats({ ...req.user, hub_id: id }, id);

  return successResponse(res, 'Rider report fetched successfully', riderStats);
});

/**
 * Get time series data
 */
const getHubTimeSeries = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { from, to, granularity = 'day' } = req.query;
  const context = getHubContext(req);

  const hub = await Hub.findById(id);
  if (!hub) {
    throw new AppError('Hub not found', 404);
  }

  assertHubAccess(req.user, hub._id, 'Hub time series');

  const user = { ...req.user, hub_id: id };
  const timeSeries = await getTimeSeriesAnalytics(user, id, from, to, granularity);

  return successResponse(res, 'Time series data fetched successfully', { data: timeSeries });
});

module.exports = {
  createHub,
  listHubs,
  getHubById,
  updateHub,
  suspendHub,
  assignManager,
  getHubAnalytics,
  getHQDashboard,
  listAvailableHubManagers,
  getHubDeliveryReport,
  getHubRiderReport,
  getHubTimeSeries,
};
