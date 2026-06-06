const Shipment = require('../models/Shipment');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const { emitToHub } = require('../services/realtimeService');
const {
  isAdminRole,
  canAccessAllHubs,
  assertHubAccess,
  buildHubScopedMatch,
} = require('../utils/hubAccess');

const readId = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return String(value._id || value.id || value);
  }
  return String(value);
};

const assertShipmentAccess = (shipment, user, actionName = 'Shipment access') => {
  if (canAccessAllHubs(user)) {
    return;
  }

  if (isAdminRole(user.role)) {
    assertHubAccess(user, shipment.hub_id, actionName);
    return;
  }

  if (user.role === 'merchant' && readId(shipment.merchant_id) !== String(user.id)) {
    throw new AppError('Forbidden', 403);
  }

  if (user.role === 'rider' && readId(shipment.rider_id) !== String(user.id)) {
    throw new AppError('Forbidden', 403);
  }
};

const getScopedHubId = (req) => {
  if (canAccessAllHubs(req.user)) {
    const hubId = req.body.hub_id || req.query.hub_id;
    if (!hubId) {
      throw new AppError('hub_id is required', 400);
    }
    return hubId;
  }

  const scopedMatch = buildHubScopedMatch(req.user, { hub_id: req.body.hub_id || req.query.hub_id }, {
    actionName: 'Shipment creation',
  });
  if (scopedMatch.hub_id?.$in) {
    throw new AppError('hub_id is required when creating a shipment from a regional account', 400);
  }

  return scopedMatch.hub_id;
};

const createShipment = asyncHandler(async (req, res) => {
  const hubId = getScopedHubId(req);
  const shipment = await Shipment.create({
    ...req.body,
    hub_id: hubId,
    merchant_id: req.user.role === 'merchant' ? req.user.id : (req.body.merchant_id || req.user.id),
  });

  emitToHub(shipment.hub_id, 'shipment:created', shipment);

  return successResponse(res, 'Shipment created successfully', { shipment }, 201);
});

const listShipments = asyncHandler(async (req, res) => {
  const filter = {};

  if (isAdminRole(req.user.role)) {
    Object.assign(filter, buildHubScopedMatch(req.user, req.query, {
      actionName: 'Shipment list',
    }));
  }

  if (req.user.role === 'merchant') {
    filter.merchant_id = req.user.id;
  }

  if (req.user.role === 'rider') {
    filter.rider_id = req.user.id;
  }

  const shipments = await Shipment.find(filter)
    .sort({ createdAt: -1 })
    .populate('hub_id', 'name code')
    .populate('merchant_id', 'full_name email role profile_image')
    .populate('rider_id', 'full_name email role profile_image');

  return successResponse(res, 'Shipments fetched successfully', { shipments });
});

const getShipmentById = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findById(req.params.id)
    .populate('hub_id', 'name code')
    .populate('merchant_id', 'full_name email role profile_image')
    .populate('rider_id', 'full_name email role profile_image');

  if (!shipment) {
    throw new AppError('Shipment not found', 404);
  }

  assertShipmentAccess(shipment, req.user);

  return successResponse(res, 'Shipment fetched successfully', { shipment });
});

const updateShipmentStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  const shipment = await Shipment.findById(req.params.id);

  if (!shipment) {
    throw new AppError('Shipment not found', 404);
  }

  assertShipmentAccess(shipment, req.user, 'Shipment status update');

  shipment.status = status;
  shipment.status_history.push({
    status,
    note,
    updated_by: req.user.id,
  });

  await shipment.save();

  emitToHub(shipment.hub_id, 'shipment:updated', shipment);

  return successResponse(res, 'Shipment status updated successfully', { shipment });
});

module.exports = {
  createShipment,
  listShipments,
  getShipmentById,
  updateShipmentStatus,
};
