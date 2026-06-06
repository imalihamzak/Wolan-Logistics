const crypto = require('crypto');

const mongoose = require('mongoose');
const QRCode = require('qrcode');

const Order = require('../models/Order');
const Merchant = require('../models/Merchant');
const User = require('../models/User');
const Hub = require('../models/Hub');
const Rider = require('../models/Rider');
const Upload = require('../models/Upload');
const AppError = require('../utils/AppError');
const {
  emitToHub,
  emitToUser,
  emitToMerchant,
  emitToAdmin,
  emitToOrder,
} = require('./realtimeService');
const { DEFAULT_PACKAGE_SIZE, isVehicleCompatibleWithPackage } = require('../constants/dispatchConstants');
const { isKycVerified, isRiderKycComplete, isAccountLocked } = require('../utils/accountSecurity');
const { getRiderRestrictionSnapshot } = require('../utils/riderRestrictions');
const {
  assertRiderBelowCodLimit,
  assertRiderWithinCodCapacity,
  calculateRiderPayoutForOrder,
} = require('./settlementService');
const { calculateDeliveryPricing } = require('./pricingService');
const {
  getMissingRequiredAcceptedPolicyKeys,
  hasAcceptedRequiredPolicies,
} = require('../constants/policyConstants');
const {
  refreshRiderDispatchPerformance,
  scoreDispatchCandidates,
} = require('./dispatchPerformanceService');
const {
  ADMIN_ROLES,
  canAccessAllHubs,
  isAdminRole,
  buildHubScopedMatch,
  assertHubAccess,
  getAssignedHubIds,
} = require('../utils/hubAccess');

const ORDER_STATUSES = ['pending', 'picked_up', 'at_hub', 'out_for_delivery', 'delivered', 'failed', 'returned'];
const ASSIGNABLE_RIDER_STATUSES = ['available'];
const RIDER_FINANCE_OUTCOME_STATUSES = ['delivered', 'failed', 'returned'];
const OTP_OVERRIDE_ROLES = ['super_admin', 'director', 'general_manager', 'hub_manager'];
const MANAGER_ROLES = [...ADMIN_ROLES, 'merchant'];
const ASSIGNMENT_RESPONSE_WINDOW_MINUTES = Number(process.env.ASSIGNMENT_RESPONSE_WINDOW_MINUTES || 5);
const RETURN_FEE_MODE = String(process.env.RETURN_FEE_MODE || 'same_as_delivery').trim().toLowerCase();
const parsedReturnFeeFlatAmount = Number(process.env.RETURN_FEE_FLAT_AMOUNT || 0);
const RETURN_FEE_FLAT_AMOUNT = Number.isFinite(parsedReturnFeeFlatAmount) ? Math.max(parsedReturnFeeFlatAmount, 0) : 0;

const readIdValue = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return String(value._id || value.id || value.toString?.() || value);
  }

  return String(value);
};

const buildAuthContext = (actor = {}) => ({
  id: actor.id ? String(actor.id) : null,
  role: actor.role || 'system',
  hub_id: readIdValue(actor.hub_id),
  assigned_hub_ids: Array.isArray(actor.assigned_hub_ids)
    ? actor.assigned_hub_ids.map(readIdValue).filter(Boolean)
    : [],
});

const assertActorCanUseHub = (context, hubId, actionName = 'Hub operation') => {
  if (!isAdminRole(context.role)) {
    return;
  }

  assertHubAccess(context, hubId, actionName);
};

const resolveIdValue = readIdValue;

const normalizePagination = (query = {}) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const randomToken = (length = 6) => crypto.randomBytes(length).toString('hex').toUpperCase();

const isValidCoordinatePair = ({ latitude, longitude } = {}) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
  && !(latitude === 0 && longitude === 0)
);

const readCoordinatePair = (value = null) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value.coordinates)) {
    const [longitude, latitude] = value.coordinates.map(Number);
    if (isValidCoordinatePair({ latitude, longitude })) {
      return { latitude, longitude };
    }
  }

  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng ?? value.lon);
  if (!isValidCoordinatePair({ latitude, longitude })) {
    return null;
  }

  return { latitude, longitude };
};

const toOrderGeoPoint = (value = null) => {
  const coordinates = readCoordinatePair(value);
  if (!coordinates) {
    return null;
  }

  return {
    type: 'Point',
    coordinates: [coordinates.longitude, coordinates.latitude],
  };
};

const getOrderDispatchTargetCoordinates = (orderOrPayload = {}) => (
  readCoordinatePair(orderOrPayload.pickup_coordinates || orderOrPayload.pickup_location)
  || readCoordinatePair(orderOrPayload.dropoff_coordinates || orderOrPayload.delivery_coordinates || orderOrPayload.customer_coordinates)
);

const generateIdentifier = async (prefix, fieldName) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomToken(2)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Order.exists({ [fieldName]: candidate });
    if (!exists) {
      return candidate;
    }
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomToken(4)}`;
};

const generateOrderId = () => generateIdentifier('ORD', 'order_id');
const generatePackageTrackingId = () => generateIdentifier('PKG', 'package_tracking_id');
const generateRiderTrackingId = () => generateIdentifier('RDR', 'rider_tracking_id');
const generateBatchId = () => `${Date.now().toString(36).toUpperCase()}-${randomToken(3)}`;
const generateOtpCode = () => String(crypto.randomInt(1000, 10000)).padStart(4, '0');

const getAssignmentResponseDueAt = () => new Date(Date.now() + ASSIGNMENT_RESPONSE_WINDOW_MINUTES * 60 * 1000);

const calculateReturnFee = (order) => {
  if (RETURN_FEE_MODE === 'none') {
    return { amount: 0, rule: 'no_return_fee' };
  }

  if (RETURN_FEE_MODE === 'flat') {
    return { amount: RETURN_FEE_FLAT_AMOUNT, rule: `flat_${RETURN_FEE_FLAT_AMOUNT}` };
  }

  return {
    amount: Math.max(Number(order.delivery_fee || 0), 0),
    rule: 'same_as_delivery_fee',
  };
};

const buildQrPayload = (order) => ({
  order_id: order.order_id,
  package_tracking_id: order.package_tracking_id,
  rider_tracking_id: order.rider_tracking_id,
  merchant_id: String(order.merchant_id),
  hub_id: String(order.hub_id),
  delivery_zone: order.delivery_zone,
  order_status: order.order_status,
});

const parseScannedPayload = (scannedCode) => {
  const normalized = String(scannedCode || '').trim();
  let parsedPayload = null;

  try {
    parsedPayload = JSON.parse(normalized);
  } catch (error) {
    parsedPayload = null;
  }

  return { normalized, parsedPayload };
};

const scannedCodeMatchesOrder = (order, scannedCode) => {
  const { normalized, parsedPayload } = parseScannedPayload(scannedCode);

  const matchesKnownCode = [
    order.order_id,
    order.package_tracking_id,
    order.rider_tracking_id,
  ].includes(normalized.toUpperCase());

  const matchesPayload = parsedPayload
    && String(parsedPayload.package_tracking_id || '').toUpperCase() === String(order.package_tracking_id || '').toUpperCase()
    && String(parsedPayload.order_id || '').toUpperCase() === String(order.order_id || '').toUpperCase();

  return { normalized, matches: Boolean(matchesKnownCode || matchesPayload) };
};

const generateQrCode = async (order) => QRCode.toDataURL(JSON.stringify(buildQrPayload(order)), {
  errorCorrectionLevel: 'M',
  margin: 1,
  scale: 8,
});

const addHistoryEntry = (order, status, note, actor, metadata = {}) => {
  const context = buildAuthContext(actor);

  order.status_history.push({
    status,
    note: note || null,
    updated_by: context.id,
    updated_by_role: context.role,
    metadata,
    updated_at: new Date(),
  });
};

const addActivityLog = (order, action, note, actor, metadata = {}) => {
  const context = buildAuthContext(actor);

  order.activity_logs.push({
    action,
    note: note || null,
    actor_id: context.id,
    actor_role: context.role,
    metadata,
    created_at: new Date(),
  });
};

const expireOverdueAssignments = async ({ hubId = null } = {}) => {
  const now = new Date();
  const filter = {
    order_status: 'pending',
    assignment_response_status: 'pending',
    assignment_response_due_at: { $lt: now },
  };

  if (hubId) {
    filter.hub_id = new mongoose.Types.ObjectId(hubId);
  }

  const overdueOrders = await Order.find(filter);

  await Promise.all(overdueOrders.map(async (order) => {
    const expiredRiderId = order.rider_id ? String(order.rider_id) : null;
    order.rider_id = null;
    order.assignment_response_status = 'expired';
    order.assignment_response_due_at = null;
    order.accepted_at = null;

    addHistoryEntry(order, 'pending', 'Rider assignment expired', { role: 'system' }, {
      assignment_action: 'expired',
      expired_rider_id: expiredRiderId,
    });
    addActivityLog(order, 'assignment_expired', 'Rider assignment expired', { role: 'system' }, {
      assignment_action: 'expired',
      expired_rider_id: expiredRiderId,
    });

    await order.save();
    if (expiredRiderId) {
      await refreshRiderDispatchPerformance({ riderUserId: expiredRiderId, hubId: order.hub_id });
    }
  }));
};

const expireAssignedOrderIfOverdue = async ({ order, actor, session }) => {
  const isOverdue = order.order_status === 'pending'
    && order.assignment_response_status === 'pending'
    && order.assignment_response_due_at
    && order.assignment_response_due_at < new Date();

  if (!isOverdue) {
    return false;
  }

  const expiredRiderId = order.rider_id ? String(order.rider_id) : null;
  order.rider_id = null;
  order.assignment_response_status = 'expired';
  order.assignment_response_due_at = null;
  order.accepted_at = null;

  addHistoryEntry(order, 'pending', 'Rider assignment expired', actor || { role: 'system' }, {
    assignment_action: 'expired',
    expired_rider_id: expiredRiderId,
  });
  addActivityLog(order, 'assignment_expired', 'Rider assignment expired', actor || { role: 'system' }, {
    assignment_action: 'expired',
    expired_rider_id: expiredRiderId,
  });

  await order.save({ session });
  if (expiredRiderId) {
    await refreshRiderDispatchPerformance({ riderUserId: expiredRiderId, hubId: order.hub_id, session });
  }
  return true;
};

const assertUploadBelongsToOrder = async ({ uploadId, order, session }) => {
  if (!mongoose.Types.ObjectId.isValid(uploadId)) {
    throw new AppError('proof_upload_id is invalid', 400);
  }

  const upload = await Upload.findById(uploadId).session(session);

  if (!upload) {
    throw new AppError('Proof upload not found', 404);
  }

  if (upload.related_model !== 'Order' || String(upload.related_id) !== String(order._id)) {
    throw new AppError('Proof upload does not belong to this order', 400);
  }

  if (String(upload.hub_id) !== resolveIdValue(order.hub_id)) {
    throw new AppError('Proof upload belongs to a different hub', 400);
  }

  return upload;
};

const assertAssignedRiderAction = (order, actor, actionName) => {
  const context = buildAuthContext(actor);
  const assignedRiderId = resolveIdValue(order.rider_id);

  if (context.role !== 'rider' || !context.id || assignedRiderId !== context.id) {
    throw new AppError(`${actionName} must be performed by the assigned rider`, 403);
  }
};

const assertRiderOperationalForAction = async (actor, session, actionName, options = {}) => {
  const context = buildAuthContext(actor);

  if (context.role !== 'rider') {
    return;
  }

  const [user, riderProfile] = await Promise.all([
    User.findById(context.id).session(session),
    Rider.findOne({ user_id: context.id }).session(session),
  ]);

  if (!user || !user.is_active || isAccountLocked(user)) {
    throw new AppError(`${actionName} is blocked because the rider account is inactive or locked`, 403);
  }

  if (!riderProfile || !riderProfile.is_active) {
    const restriction = riderProfile ? getRiderRestrictionSnapshot(riderProfile) : null;
    const detail = restriction?.reason
      ? `${restriction.label}: ${restriction.reason}. ${restriction.reinstatement_label}`
      : 'the rider profile is restricted';
    throw new AppError(`${actionName} is blocked because ${detail}`, 403);
  }

  if (!isKycVerified(user) || !isRiderKycComplete(riderProfile)) {
    throw new AppError(`${actionName} is blocked until rider KYC documents, stage chairman contact, and admin approval are complete`, 403);
  }

  if (!hasAcceptedRequiredPolicies('rider', riderProfile.policy_acceptances)) {
    const missingPolicies = getMissingRequiredAcceptedPolicyKeys('rider', riderProfile.policy_acceptances);
    throw new AppError(`${actionName} is blocked until rider legal agreements are accepted: ${missingPolicies.join(', ')}`, 403);
  }

  if (options.enforceCodBalance) {
    assertRiderBelowCodLimit(riderProfile, actionName);
  }
};

const recordRiderFinanceForOutcome = async ({ order, nextStatus, session }) => {
  if (!RIDER_FINANCE_OUTCOME_STATUSES.includes(nextStatus)) {
    return;
  }

  if (order.rider_finance_recorded_at) {
    if (nextStatus === 'returned' && order.rider_finance_recorded_status === 'failed' && order.rider_id) {
      const riderProfile = await Rider.findOne({ user_id: order.rider_id }).session(session);
      if (riderProfile) {
        riderProfile.returned_orders += 1;
        order.rider_finance_recorded_status = 'returned';
        await riderProfile.save({ session, validateBeforeSave: false });
      }
    }
    return;
  }

  if (!order.rider_id) {
    return;
  }

  const riderProfile = await Rider.findOne({ user_id: order.rider_id }).session(session);
  if (!riderProfile) {
    throw new AppError('Rider profile is required before recording delivery settlement', 400);
  }

  let payoutAmount = 0;
  let codAmount = 0;

  if (nextStatus === 'delivered') {
    payoutAmount = calculateRiderPayoutForOrder(order);
    codAmount = Number(order.cod_amount || 0);
    riderProfile.total_deliveries += 1;
    riderProfile.successful_deliveries += 1;
    riderProfile.earnings += payoutAmount;
    riderProfile.pending_payout += payoutAmount;
    riderProfile.current_cod += codAmount;
    riderProfile.last_delivery_at = new Date();
  } else if (nextStatus === 'failed') {
    riderProfile.failed_deliveries += 1;
  } else if (nextStatus === 'returned') {
    riderProfile.returned_orders += 1;
  }

  order.rider_finance_recorded_at = new Date();
  order.rider_finance_recorded_status = nextStatus;
  order.rider_finance_payout_amount = payoutAmount;
  order.rider_finance_cod_amount = codAmount;

  await riderProfile.save({ session, validateBeforeSave: false });
};

const assertManualOtpOverrideAllowed = (order, actor) => {
  const context = buildAuthContext(actor);

  if (!OTP_OVERRIDE_ROLES.includes(context.role)) {
    throw new AppError('Manual OTP override requires super admin or hub manager permission', 403);
  }

  assertActorCanUseHub(context, order.hub_id, 'Manual OTP override');
};

const canViewPickupKey = (actor = {}) => {
  const context = buildAuthContext(actor);
  return [...ADMIN_ROLES, 'merchant'].includes(context.role);
};

const stripPickupKeyFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map(stripPickupKeyFromPayload);
  }

  const sanitized = { ...payload };
  delete sanitized.pickup_key;

  if (sanitized.order) {
    sanitized.order = stripPickupKeyFromPayload(sanitized.order);
  }

  if (Array.isArray(sanitized.orders)) {
    sanitized.orders = sanitized.orders.map(stripPickupKeyFromPayload);
  }

  return sanitized;
};

const serializeOrderForActor = (order, actor = {}) => {
  const payload = order.toPublicJSON();
  return canViewPickupKey(actor) ? payload : stripPickupKeyFromPayload(payload);
};

const emitOrderEvent = (order, eventName, payload = null) => {
  const publicPayload = payload || order.toPublicJSON();
  const restrictedPayload = stripPickupKeyFromPayload(publicPayload);
  const orderId = resolveIdValue(order._id || order.id);

  emitToAdmin(eventName, publicPayload);
  emitToOrder(orderId, eventName, restrictedPayload);
  emitToHub(resolveIdValue(order.hub_id), eventName, publicPayload);

  if (order.merchant_id) {
    const merchantId = resolveIdValue(order.merchant_id);
    emitToUser(merchantId, eventName, publicPayload);
    emitToMerchant(merchantId, eventName, publicPayload);
  }

  if (order.rider_id) {
    emitToUser(resolveIdValue(order.rider_id), eventName, restrictedPayload);
  }

  if (eventName !== 'merchant:order-status-updated') {
    emitToAdmin('merchant:order-status-updated', publicPayload);
    emitToOrder(orderId, 'merchant:order-status-updated', restrictedPayload);
    emitToHub(resolveIdValue(order.hub_id), 'merchant:order-status-updated', publicPayload);
    if (order.merchant_id) {
      const merchantId = resolveIdValue(order.merchant_id);
      emitToUser(merchantId, 'merchant:order-status-updated', publicPayload);
      emitToMerchant(merchantId, 'merchant:order-status-updated', publicPayload);
    }
  }
};

const buildOrderMatch = ({ search, status, merchant_id, rider_id, hub_id, delivery_zone, batch_id, from, to }, actor = {}) => {
  const match = {};
  const context = buildAuthContext(actor);

  if (context.role === 'merchant' && context.id) {
    match.merchant_id = new mongoose.Types.ObjectId(context.id);
  } else if (merchant_id) {
    match.merchant_id = new mongoose.Types.ObjectId(merchant_id);
  }

  if (context.role === 'rider' && context.id) {
    match.rider_id = new mongoose.Types.ObjectId(context.id);
  } else if (rider_id) {
    match.rider_id = new mongoose.Types.ObjectId(rider_id);
  }

  if (isAdminRole(context.role)) {
    Object.assign(match, buildHubScopedMatch(context, { hub_id }, {
      actionName: 'Order list',
    }));
  } else if (context.hub_id) {
    match.hub_id = new mongoose.Types.ObjectId(context.hub_id);
  } else if (hub_id && context.role === 'system') {
    match.hub_id = new mongoose.Types.ObjectId(hub_id);
  }

  if (status) match.order_status = status;
  if (delivery_zone) match.delivery_zone = delivery_zone;
  if (batch_id) match.batch_id = batch_id;

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }

  if (search) {
    match.$or = [
      { order_id: { $regex: search, $options: 'i' } },
      { package_tracking_id: { $regex: search, $options: 'i' } },
      { rider_tracking_id: { $regex: search, $options: 'i' } },
      { customer_name: { $regex: search, $options: 'i' } },
      { customer_phone: { $regex: search, $options: 'i' } },
      { delivery_address: { $regex: search, $options: 'i' } },
      { item_description: { $regex: search, $options: 'i' } },
      { delivery_zone: { $regex: search, $options: 'i' } },
    ];
  }

  return match;
};

const scoreRiders = async ({ hubId, deliveryZone, packageSize = DEFAULT_PACKAGE_SIZE, codAmount = 0, targetCoordinates = null, session = null }) => scoreDispatchCandidates({
  hubId,
  deliveryZone,
  packageSize,
  codAmount,
  targetCoordinates,
  session,
});

const findNearestRider = async ({ hubId, deliveryZone, packageSize = DEFAULT_PACKAGE_SIZE, codAmount = 0, targetCoordinates = null, session = null }) => {
  const scoredRiders = await scoreRiders({ hubId, deliveryZone, packageSize, codAmount, targetCoordinates, session });
  return scoredRiders[0] || null;
};

const getAssignableRider = async ({ riderId, hubId, session, packageSize = DEFAULT_PACKAGE_SIZE, codAmount = 0 }) => {
  const rider = await User.findOne({ _id: riderId, role: 'rider', is_active: true, hub_id: hubId }).session(session);

  if (!rider) {
    throw new AppError('rider_id is invalid or unavailable', 400);
  }

  if (isAccountLocked(rider)) {
    throw new AppError('Selected rider account is locked and cannot receive assignments', 400);
  }

  if (!isKycVerified(rider)) {
    throw new AppError('Selected rider user KYC must be verified before assignment', 400);
  }

  const riderProfile = await Rider.findOne({
    user_id: rider._id,
    hub_id: hubId,
    is_active: true,
    kyc_status: 'verified',
    all_documents_verified: true,
    stage_chairman_phone: { $nin: [null, ''] },
  }).session(session);

  if (!riderProfile) {
    throw new AppError('Rider profile is missing, inactive, or KYC documents/stage chairman/admin approval are incomplete', 400);
  }

  if (!hasAcceptedRequiredPolicies('rider', riderProfile.policy_acceptances)) {
    const missingPolicies = getMissingRequiredAcceptedPolicyKeys('rider', riderProfile.policy_acceptances);
    throw new AppError(`Selected rider must accept required legal agreements before assignment: ${missingPolicies.join(', ')}`, 400);
  }

  if (!ASSIGNABLE_RIDER_STATUSES.includes(riderProfile.current_status)) {
    throw new AppError('Rider must be available before assignment', 400);
  }

  assertRiderWithinCodCapacity(riderProfile, codAmount, 'Rider assignment');

  if (!isVehicleCompatibleWithPackage(riderProfile.vehicle_type, packageSize)) {
    throw new AppError(`Selected rider vehicle (${riderProfile.vehicle_type || 'missing'}) cannot carry a ${packageSize} package`, 400);
  }

  return { rider, riderProfile };
};

const ensureMerchantAndHub = async ({ merchantId, hubId }) => {
  const merchant = await Merchant.findById(merchantId);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  if (merchant.status !== 'active') {
    throw new AppError('Merchant account must be active before creating orders', 403);
  }

  if (!isKycVerified(merchant)) {
    throw new AppError('Merchant KYC must be verified before creating orders', 403);
  }

  if (!hasAcceptedRequiredPolicies('merchant', merchant.policy_acceptances)) {
    const missingPolicies = getMissingRequiredAcceptedPolicyKeys('merchant', merchant.policy_acceptances);
    throw new AppError(`Merchant legal agreements must be accepted before creating orders: ${missingPolicies.join(', ')}`, 403);
  }

  const requestedHubId = resolveIdValue(hubId);
  const merchantHubId = resolveIdValue(merchant.hub_id);

  if (requestedHubId && merchantHubId && requestedHubId !== merchantHubId) {
    throw new AppError('Selected merchant belongs to a different hub. Use the merchant assigned hub or choose a merchant from your assigned hub.', 403);
  }

  const effectiveHubId = requestedHubId || merchantHubId;

  if (!effectiveHubId) {
    throw new AppError('Selected merchant is not assigned to a hub. Assign the merchant to a hub before creating orders.', 400);
  }

  if (!mongoose.Types.ObjectId.isValid(effectiveHubId)) {
    throw new AppError('hub_id is invalid', 400);
  }

  const hub = await Hub.findById(effectiveHubId).select('_id status is_active');
  if (!hub) {
    throw new AppError('hub_id is invalid', 400);
  }

  if (hub.status && hub.status !== 'active') {
    throw new AppError('Selected hub is not active for order creation', 403);
  }

  if (hub.is_active === false) {
    throw new AppError('Selected hub is suspended for order creation', 403);
  }

  return { merchant, hubId: hub._id };
};

const createOrderRecord = async ({ payload, actor, session, batchId = null, reservedPickupKeys = null }) => {
  const context = buildAuthContext(actor);
  const merchantId = context.role === 'merchant' ? context.id : payload.merchant_id;
  const resolvedBatchId = batchId || (payload.batch_id ? String(payload.batch_id).trim() : null);

  if (!merchantId) {
    throw new AppError('merchant_id is required', 400);
  }

  const { merchant, hubId } = await ensureMerchantAndHub({ merchantId, hubId: payload.hub_id });
  assertActorCanUseHub(context, hubId, 'Order creation');

  if (context.role === 'merchant' && context.hub_id && resolveIdValue(hubId) !== context.hub_id) {
    throw new AppError('Merchant orders must use the merchant assigned hub', 403);
  }

  const packageSize = payload.package_size || DEFAULT_PACKAGE_SIZE;
  const pickupCoordinates = toOrderGeoPoint(payload.pickup_coordinates || payload.pickup_location);
  const dropoffCoordinates = toOrderGeoPoint(payload.dropoff_coordinates || payload.delivery_coordinates || payload.customer_coordinates);
  const pickupAddress = String(
    payload.pickup_address
    || payload.pickup_location?.address
    || payload.pickup_location?.label
    || merchant.address
    || ''
  ).trim();
  const dropoffAddress = String(
    payload.dropoff_address
    || payload.dropoff_location?.address
    || payload.dropoff_location?.label
    || payload.delivery_address
    || ''
  ).trim();
  const pricing = await calculateDeliveryPricing({
    pickupCoordinates,
    dropoffCoordinates,
    pickupAddress,
    dropoffAddress,
    serviceLevel: payload.service_level,
  });
  const resolvedPickupCoordinates = toOrderGeoPoint(pricing.pickup_coordinates || pickupCoordinates);
  const resolvedDropoffCoordinates = toOrderGeoPoint(pricing.dropoff_coordinates || dropoffCoordinates);
  const dispatchTargetCoordinates = getOrderDispatchTargetCoordinates({
    pickup_coordinates: resolvedPickupCoordinates,
    dropoff_coordinates: resolvedDropoffCoordinates,
  });
  const pickupKey = await Order.generatePickupKey({ reservedKeys: reservedPickupKeys });
  if (reservedPickupKeys) {
    reservedPickupKeys.add(pickupKey);
  }

  let rider = null;
  if (payload.rider_id) {
    ({ rider } = await getAssignableRider({
      riderId: payload.rider_id,
      hubId,
      session,
      packageSize,
      codAmount: payload.cod_amount || 0,
    }));
  } else if (payload.auto_assign) {
    rider = await findNearestRider({
      hubId,
      deliveryZone: payload.delivery_zone,
      packageSize,
      codAmount: payload.cod_amount || 0,
      targetCoordinates: dispatchTargetCoordinates,
      session,
    });
    if (!rider) {
      throw new AppError('No active compatible rider found for auto assignment', 404);
    }
  }

  const order = new Order({
    order_id: await generateOrderId(),
    merchant_id: merchant._id,
    rider_id: rider ? rider._id : null,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone,
    delivery_address: dropoffAddress,
    pickup_address: pickupAddress,
    dropoff_address: dropoffAddress,
    pickup_coordinates: resolvedPickupCoordinates,
    dropoff_coordinates: resolvedDropoffCoordinates,
    item_description: payload.item_description,
    declared_value: payload.declared_value || 0,
    package_size: packageSize,
    order_status: 'pending',
    otp_code: generateOtpCode(),
    pickup_key: pickupKey,
    package_tracking_id: await generatePackageTrackingId(),
    rider_tracking_id: await generateRiderTrackingId(),
    qr_code: null,
    hub_id: hubId,
    delivery_zone: payload.delivery_zone,
    delivery_fee: pricing.delivery_fee,
    pricing_currency: pricing.pricing_currency,
    pricing_distance_km: pricing.pricing_distance_km,
    pricing_distance_meters: pricing.pricing_distance_meters,
    pricing_duration_seconds: pricing.pricing_duration_seconds,
    pricing_source: pricing.pricing_source,
    pricing_tier_label: pricing.pricing_tier_label,
    pricing_calculated_at: pricing.pricing_calculated_at,
    route_geometry: pricing.route_geometry,
    service_level: pricing.service_level,
    express_requested: pricing.express_requested,
    cod_amount: payload.cod_amount || 0,
    batch_id: resolvedBatchId,
    assigned_at: rider ? new Date() : null,
    assignment_response_status: rider ? 'pending' : null,
    assignment_response_due_at: rider ? getAssignmentResponseDueAt() : null,
    accepted_at: null,
    rejected_at: null,
    rejected_reason: null,
    status_history: [],
    activity_logs: [],
  });

  order.qr_code = await generateQrCode(order);
  addHistoryEntry(order, 'pending', 'Order created', actor, { batch_id: resolvedBatchId });
  addActivityLog(order, 'order_created', 'Order created successfully', actor, {
    merchant_id: String(merchant._id),
    hub_id: String(hubId),
    rider_id: rider ? String(rider._id) : null,
    batch_id: resolvedBatchId,
    delivery_fee: pricing.delivery_fee,
    pricing_distance_km: pricing.pricing_distance_km,
    pricing_duration_seconds: pricing.pricing_duration_seconds,
    pricing_source: pricing.pricing_source,
    service_level: pricing.service_level,
  });

  if (rider) {
    addHistoryEntry(order, 'pending', `Auto assigned to rider ${rider.full_name}`, actor, {
      rider_id: String(rider._id),
      auto_assigned: true,
      dispatch_priority_score: rider.dispatch_priority_score || null,
      dispatch_performance_score: rider.performance_score || null,
      dispatch_distance_km: rider.distance_km || null,
    });
    addActivityLog(order, 'rider_assigned', 'Rider assigned during order creation', actor, {
      rider_id: String(rider._id),
      auto_assigned: true,
      dispatch_priority_score: rider.dispatch_priority_score || null,
      dispatch_performance_score: rider.performance_score || null,
      dispatch_distance_km: rider.distance_km || null,
    });
  }

  await order.save({ session });
  if (rider) {
    await refreshRiderDispatchPerformance({ riderUserId: rider._id, hubId, session });
  }
  return order;
};

const createOrderBatch = async ({ orders, actor, session }) => {
  const batchId = generateBatchId();
  const createdOrders = [];
  const reservedPickupKeys = new Set();

  for (const payload of orders) {
    // eslint-disable-next-line no-await-in-loop
    const order = await createOrderRecord({ payload, actor, session, batchId, reservedPickupKeys });
    createdOrders.push(order);
  }

  return { batchId, createdOrders };
};

const listOrders = async ({ query, actor }) => {
  const { page, limit, skip } = normalizePagination(query);
  const context = buildAuthContext(actor);

  const assignedHubIds = getAssignedHubIds(context);
  if (isAdminRole(context.role) && !canAccessAllHubs(context) && assignedHubIds.length === 0) {
    throw new AppError('Hub access is required for this account', 403);
  }

  if (canAccessAllHubs(context)) {
    await expireOverdueAssignments({ hubId: null });
  } else if (assignedHubIds.length > 0) {
    await Promise.all(assignedHubIds.map((hubId) => expireOverdueAssignments({ hubId })));
  }

  const match = buildOrderMatch(query, actor);
  const sortMode = String(query.sort || '').toLowerCase();

  const sort = sortMode === 'zone'
    ? { delivery_zone: 1, createdAt: -1 }
    : { createdAt: -1 };

  const [items, total] = await Promise.all([
    Order.find(match)
      .select('+otp_code')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('merchant_id', 'merchant_name shop_name email phone referral_code hub_id status')
      .populate('rider_id', 'full_name email phone profile_image role hub_id')
      .populate('hub_id', 'name code city state'),
    Order.countDocuments(match),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const findOrderById = async (orderId) => Order.findById(orderId)
  .select('+otp_code')
  .populate('merchant_id', 'merchant_name shop_name email phone referral_code hub_id status')
  .populate('rider_id', 'full_name email phone profile_image role hub_id')
  .populate('hub_id', 'name code city state');

const findOrderByPackageTrackingId = async (trackingId) => Order.findOne({ package_tracking_id: trackingId })
  .select('+otp_code')
  .populate('merchant_id', 'merchant_name shop_name email phone referral_code hub_id status')
  .populate('rider_id', 'full_name email phone profile_image role hub_id')
  .populate('hub_id', 'name code city state');

const findOrderByRiderTrackingId = async (trackingId) => Order.findOne({ rider_tracking_id: trackingId })
  .select('+otp_code')
  .populate('merchant_id', 'merchant_name shop_name email phone referral_code hub_id status')
  .populate('rider_id', 'full_name email phone profile_image role hub_id')
  .populate('hub_id', 'name code city state');

const assertOrderAccess = (order, actor) => {
  const context = buildAuthContext(actor);
  const merchantId = resolveIdValue(order.merchant_id);
  const riderId = resolveIdValue(order.rider_id);
  const hubId = resolveIdValue(order.hub_id);

  if (canAccessAllHubs(context)) {
    return true;
  }

  if (context.role === 'merchant' && merchantId === context.id) {
    return true;
  }

  if (context.role === 'rider' && riderId === context.id) {
    return true;
  }

  if (ADMIN_ROLES.includes(context.role) && assertHubAccess(context, hubId, 'Order access')) {
    return true;
  }

  throw new AppError('You do not have access to this order or hub', 403);
};

const ensureValidTransition = (order, nextStatus, metadata = {}) => {
  const allowedTransitions = {
    pending: ['picked_up', 'failed', 'returned'],
    picked_up: ['at_hub', 'failed', 'returned'],
    at_hub: ['out_for_delivery', 'returned', 'failed'],
    out_for_delivery: ['delivered', 'failed', 'returned'],
    failed: ['returned'],
    returned: [],
    delivered: [],
  };

  const allowed = allowedTransitions[order.order_status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(`Cannot move order from ${order.order_status} to ${nextStatus}`, 400);
  }

  if (['picked_up', 'at_hub', 'out_for_delivery', 'delivered'].includes(nextStatus) && !order.handover_verified) {
    throw new AppError('Merchant pickup key must be verified before the order can move forward', 400);
  }

  if (nextStatus === 'picked_up' && !metadata.custody_confirmed) {
    throw new AppError('Use package custody confirmation before marking the order picked up', 400);
  }

  if (nextStatus === 'at_hub' && !metadata.hub_scan_in_verified) {
    throw new AppError('Use hub scan-in confirmation before marking the order at hub', 400);
  }

  if (nextStatus === 'at_hub' && !order.custody_confirmed_at) {
    throw new AppError('Package custody must be confirmed before hub scan-in', 400);
  }

  if (['out_for_delivery', 'delivered'].includes(nextStatus) && !order.hub_scan_in) {
    throw new AppError('Hub scan-in is required before driver delivery phase', 400);
  }
};

const transitionOrderStatus = async ({ order, nextStatus, actor, note, session, metadata = {}, otpVerified = false }) => {
  const context = buildAuthContext(actor);
  const enforceCodBalance = context.role === 'rider' && ['picked_up', 'out_for_delivery'].includes(nextStatus);
  await assertRiderOperationalForAction(actor, session, 'Order status update', { enforceCodBalance });
  ensureValidTransition(order, nextStatus, metadata);

  if (nextStatus === 'delivered' && !otpVerified) {
    throw new AppError('OTP verification is required before marking an order as delivered', 400);
  }

  order.order_status = nextStatus;

  const transitionedAt = new Date();

  if (nextStatus === 'picked_up') {
    order.picked_up_at = transitionedAt;
  } else if (nextStatus === 'at_hub') {
    order.at_hub_at = transitionedAt;
    if (metadata.hub_scan_in_verified) {
      order.hub_scan_in = order.hub_scan_in || transitionedAt;
    }
  } else if (nextStatus === 'out_for_delivery') {
    order.out_for_delivery_at = transitionedAt;
  } else if (nextStatus === 'delivered') {
    order.delivered_at = transitionedAt;
    order.otp_verified_at = transitionedAt;
    order.otp_code = null;
  } else if (nextStatus === 'failed') {
    order.failed_at = transitionedAt;
    order.delivery_attempts += 1;
  } else if (nextStatus === 'returned') {
    order.returned_at = transitionedAt;
  }

  addHistoryEntry(order, nextStatus, note || `Order moved to ${nextStatus}`, actor, metadata);
  addActivityLog(order, `status_${nextStatus}`, note || `Order moved to ${nextStatus}`, actor, metadata);
  await recordRiderFinanceForOutcome({ order, nextStatus, session });
  await order.save({ session });
  if (order.rider_id) {
    await refreshRiderDispatchPerformance({ riderUserId: order.rider_id, hubId: order.hub_id, session });
  }

  return order;
};

const submitOrderRating = async ({ order, rating, note, actor, session }) => {
  if (order.order_status !== 'delivered') {
    throw new AppError('Only delivered orders can receive a customer rating', 400);
  }

  if (!order.rider_id) {
    throw new AppError('Order has no rider to rate', 400);
  }

  const riderProfile = await Rider.findOne({ user_id: order.rider_id }).session(session);
  if (!riderProfile) {
    throw new AppError('Rider profile not found for this order', 404);
  }

  const previousRating = Number(order.customer_rating || 0);
  const hasPreviousRating = Number.isFinite(previousRating) && previousRating >= 1 && previousRating <= 5;
  const currentTotalRatings = Math.max(Number(riderProfile.total_ratings || 0), hasPreviousRating ? 1 : 0);
  let totalRatingPoints = Number(riderProfile.rating || 0) * currentTotalRatings;
  let nextTotalRatings = currentTotalRatings;

  if (hasPreviousRating && totalRatingPoints < previousRating) {
    totalRatingPoints = previousRating;
  }

  if (hasPreviousRating) {
    totalRatingPoints -= previousRating;
  } else {
    nextTotalRatings += 1;
  }

  totalRatingPoints += rating;
  riderProfile.rating = Math.round((totalRatingPoints / nextTotalRatings) * 100) / 100;
  riderProfile.total_ratings = nextTotalRatings;

  order.customer_rating = rating;
  order.customer_rating_note = note || null;
  order.customer_rating_at = new Date();

  addActivityLog(order, 'customer_rating_recorded', 'Customer rating recorded for rider performance scoring', actor, {
    rider_id: String(order.rider_id),
    rating,
    previous_rating: hasPreviousRating ? previousRating : null,
  });

  await riderProfile.save({ session });
  await order.save({ session });
  await refreshRiderDispatchPerformance({ riderUserId: order.rider_id, hubId: order.hub_id, session });

  return order;
};

const assignRiderToOrder = async ({ order, riderId, actor, session, autoAssigned = false }) => {
  if (order.order_status !== 'pending') {
    throw new AppError('Only pending orders can be assigned to a rider', 400);
  }

  const { rider, riderProfile } = await getAssignableRider({
    riderId,
    hubId: order.hub_id,
    session,
    packageSize: order.package_size || DEFAULT_PACKAGE_SIZE,
    codAmount: order.cod_amount || 0,
  });

  order.rider_id = rider._id;
  order.assigned_at = new Date();
  order.assignment_response_status = 'pending';
  order.assignment_response_due_at = getAssignmentResponseDueAt();
  order.accepted_at = null;
  order.rejected_at = null;
  order.rejected_reason = null;
  addHistoryEntry(order, 'pending', autoAssigned ? 'Auto rider assigned' : 'Rider assigned', actor, {
    rider_id: String(rider._id),
    rider_vehicle_type: riderProfile.vehicle_type,
    package_size: order.package_size || DEFAULT_PACKAGE_SIZE,
    auto_assigned: autoAssigned,
    dispatch_priority_score: rider.dispatch_priority_score || riderProfile.dispatch_metrics?.priority_score || null,
    dispatch_performance_score: rider.performance_score || riderProfile.performance_score || null,
  });
  addActivityLog(order, 'rider_assigned', autoAssigned ? 'Auto rider assigned' : 'Rider assigned', actor, {
    rider_id: String(rider._id),
    rider_vehicle_type: riderProfile.vehicle_type,
    package_size: order.package_size || DEFAULT_PACKAGE_SIZE,
    auto_assigned: autoAssigned,
    dispatch_priority_score: rider.dispatch_priority_score || riderProfile.dispatch_metrics?.priority_score || null,
    dispatch_performance_score: rider.performance_score || riderProfile.performance_score || null,
  });

  await order.save({ session });
  await refreshRiderDispatchPerformance({ riderUserId: rider._id, hubId: order.hub_id, session });
  return { order, rider };
};

const confirmMerchantHandover = async ({ order, pickupKey, actor, session }) => {
  if (order.order_status !== 'pending') {
    throw new AppError('Merchant handover can only be confirmed before rider pickup', 400);
  }

  if (!order.rider_id || order.assignment_response_status !== 'accepted') {
    throw new AppError('Rider must accept the assignment before merchant handover confirmation', 400);
  }

  if (!order.pickup_key) {
    throw new AppError('Pickup key is missing for this order', 400);
  }

  if (String(order.pickup_key) !== String(pickupKey).trim()) {
    throw new AppError('Invalid pickup key', 400);
  }

  if (order.handover_verified) {
    return order;
  }

  order.handover_verified = true;
  addHistoryEntry(order, 'pending', 'Merchant handover verified with pickup key', actor, {
    handover_verified: true,
  });
  addActivityLog(order, 'merchant_handover_verified', 'Merchant handover verified with pickup key', actor, {
    handover_verified: true,
  });

  await order.save({ session });
  return order;
};

const respondToAssignedOrder = async ({ order, action, reason, actor, session }) => {
  assertAssignedRiderAction(order, actor, 'Assignment response');

  if (order.order_status !== 'pending') {
    throw new AppError('Only pending assigned orders can be responded to', 400);
  }

  if (!order.rider_id) {
    throw new AppError('Order is not currently assigned to a rider', 400);
  }

  const expired = await expireAssignedOrderIfOverdue({ order, actor, session });
  if (expired) {
    return order;
  }

  if (order.assignment_response_status !== 'pending') {
    throw new AppError(`Assignment has already been ${order.assignment_response_status}`, 400);
  }

  if (action === 'accept') {
    await assertRiderOperationalForAction(actor, session, 'Assignment acceptance');
    const acceptingRiderProfile = await Rider.findOne({ user_id: buildAuthContext(actor).id }).session(session);
    assertRiderWithinCodCapacity(acceptingRiderProfile, order.cod_amount || 0, 'Assignment acceptance');
    order.assignment_response_status = 'accepted';
    order.accepted_at = new Date();
    order.rejected_at = null;
    order.rejected_reason = null;

    addActivityLog(order, 'assignment_accepted', 'Rider accepted assignment', actor, {
      assignment_action: 'accept',
    });
    addHistoryEntry(order, 'pending', 'Rider accepted assignment', actor, {
      assignment_action: 'accept',
    });
    await order.save({ session });
    await refreshRiderDispatchPerformance({ riderUserId: order.rider_id, hubId: order.hub_id, session });
    return order;
  }

  const rejectedRiderId = order.rider_id ? String(order.rider_id) : null;
  order.assignment_response_status = 'rejected';
  order.rejected_at = new Date();
  order.rejected_reason = reason;

  addActivityLog(order, 'assignment_rejected', reason || 'Rider rejected assignment', actor, {
    assignment_action: 'reject',
  });
  addHistoryEntry(order, 'pending', reason || 'Rider rejected assignment', actor, {
    assignment_action: 'reject',
  });

  order.rider_id = null;
  order.assigned_at = null;
  order.assignment_response_due_at = null;
  order.accepted_at = null;
  await order.save({ session });
  if (rejectedRiderId) {
    await refreshRiderDispatchPerformance({ riderUserId: rejectedRiderId, hubId: order.hub_id, session });
  }
  return order;
};

const confirmOrderCustody = async ({ order, scannedCode, actor, session }) => {
  assertAssignedRiderAction(order, actor, 'Package custody confirmation');

  if (!order.rider_id) {
    throw new AppError('Order is not assigned to a rider', 400);
  }

  if (order.assignment_response_status !== 'accepted') {
    throw new AppError('Accept the order before confirming package custody', 400);
  }

  if (!order.handover_verified) {
    throw new AppError('Merchant pickup key must be verified before package custody can be confirmed', 400);
  }

  const { normalized, matches } = scannedCodeMatchesOrder(order, scannedCode);
  if (!matches) {
    throw new AppError('Scanned QR code does not match this package', 400);
  }

  order.custody_confirmed_at = new Date();
  order.custody_scan_payload = normalized;

  return transitionOrderStatus({
    order,
    nextStatus: 'picked_up',
    actor,
    note: 'Package custody confirmed by QR scan',
    session,
    metadata: {
      custody_confirmed: true,
    },
  });
};

const confirmHubScanIn = async ({ order, scannedCode, actor, session }) => {
  if (!order.handover_verified) {
    throw new AppError('Merchant pickup key must be verified before hub scan-in', 400);
  }

  if (order.order_status !== 'picked_up') {
    throw new AppError('Only picked-up orders can be scanned into the hub', 400);
  }

  const { normalized, matches } = scannedCodeMatchesOrder(order, scannedCode);
  if (!matches) {
    throw new AppError('Scanned package code does not match this order', 400);
  }

  const scannedAt = new Date();
  order.hub_scan_in = scannedAt;

  return transitionOrderStatus({
    order,
    nextStatus: 'at_hub',
    actor,
    note: 'Package scanned into hub',
    session,
    metadata: {
      hub_scan_in_verified: true,
      scanned_code: normalized,
      hub_scan_in_at: scannedAt,
    },
  });
};

const verifyOrderOtp = async ({ order, otpCode, proofUploadId, actor, session, note }) => {
  assertAssignedRiderAction(order, actor, 'Delivery OTP verification');

  if (!order.otp_code) {
    throw new AppError('OTP has not been generated for this order', 400);
  }

  if (String(order.otp_code) !== String(otpCode).trim()) {
    throw new AppError('Invalid OTP code', 400);
  }

  if (!proofUploadId) {
    throw new AppError('Photo proof of delivery is required before completion', 400);
  }

  await assertUploadBelongsToOrder({ uploadId: proofUploadId, order, session });

  order.delivery_proof_upload_id = proofUploadId;
  order.delivery_proof_uploaded_at = new Date();

  return transitionOrderStatus({
    order,
    nextStatus: 'delivered',
    actor,
    note: note || 'OTP verified successfully',
    session,
      metadata: { otp_verified: true, proof_upload_id: String(proofUploadId) },
    otpVerified: true,
  });
};

const manualOverrideOrderOtp = async ({ order, reason, proofUploadId = null, actor, session }) => {
  assertManualOtpOverrideAllowed(order, actor);

  const normalizedReason = String(reason || '').trim();
  if (normalizedReason.length < 5) {
    throw new AppError('A clear manual OTP override reason is required', 400);
  }

  if (order.order_status !== 'out_for_delivery') {
    throw new AppError('Manual OTP override is only allowed while the order is out for delivery', 400);
  }

  if (!order.rider_id || order.assignment_response_status !== 'accepted') {
    throw new AppError('Manual OTP override requires an accepted rider assignment', 400);
  }

  if (!order.handover_verified || !order.hub_scan_in) {
    throw new AppError('Manual OTP override requires verified handover and hub scan-in', 400);
  }

  if (!proofUploadId) {
    throw new AppError('Photo proof of delivery is required for manual OTP override', 400);
  }

  const metadata = {
    manual_otp_override: true,
    reason: normalizedReason,
  };

  await assertUploadBelongsToOrder({ uploadId: proofUploadId, order, session });
  order.delivery_proof_upload_id = proofUploadId;
  order.delivery_proof_uploaded_at = new Date();
  metadata.proof_upload_id = String(proofUploadId);

  order.manual_otp_override = true;
  order.manual_otp_override_reason = normalizedReason;
  order.manual_otp_override_at = new Date();
  order.manual_otp_override_by = buildAuthContext(actor).id;

  addActivityLog(order, 'manual_otp_override', normalizedReason, actor, metadata);

  return transitionOrderStatus({
    order,
    nextStatus: 'delivered',
    actor,
    note: `Manual OTP override: ${normalizedReason}`,
    session,
    metadata,
    otpVerified: true,
  });
};

const updateOrderDeliveryIssue = async ({ order, nextStatus, reason, proofUploadId, actor, session }) => {
  const context = buildAuthContext(actor);

  if (context.role === 'rider') {
    assertAssignedRiderAction(order, actor, nextStatus === 'failed' ? 'Failed delivery' : 'Return to merchant');

    if (order.assignment_response_status !== 'accepted') {
      throw new AppError('Accept the assignment before reporting a delivery issue', 400);
    }

    if (nextStatus === 'failed' && order.order_status !== 'out_for_delivery') {
      throw new AppError('Driver failed delivery is only allowed after delivery has started', 400);
    }

    if (nextStatus === 'returned' && !['picked_up', 'at_hub', 'out_for_delivery', 'failed'].includes(order.order_status)) {
      throw new AppError('Driver return is only allowed after pickup or a failed delivery attempt', 400);
    }
  }

  if (!proofUploadId) {
    throw new AppError('Photo proof is required', 400);
  }

  await assertUploadBelongsToOrder({ uploadId: proofUploadId, order, session });

  if (nextStatus === 'failed') {
    order.failed_reason = reason;
    order.delivery_proof_upload_id = proofUploadId;
    order.delivery_proof_uploaded_at = new Date();
  } else if (nextStatus === 'returned') {
    const returnFee = calculateReturnFee(order);
    order.return_reason = reason;
    order.return_proof_upload_id = proofUploadId;
    order.return_proof_uploaded_at = new Date();
    order.return_fee = returnFee.amount;
    order.return_fee_currency = order.pricing_currency || 'UGX';
    order.return_fee_rule = returnFee.rule;
    order.return_fee_recorded_at = new Date();
  }

  return transitionOrderStatus({
    order,
    nextStatus,
    actor,
    note: reason,
    session,
    metadata: {
      reason,
      proof_upload_id: String(proofUploadId),
      ...(nextStatus === 'returned' ? {
        return_fee: order.return_fee,
        return_fee_currency: order.return_fee_currency,
        return_fee_rule: order.return_fee_rule,
      } : {}),
    },
  });
};

const populateOrder = async (orderIdOrDoc) => {
  if (!orderIdOrDoc) {
    return null;
  }

  if (typeof orderIdOrDoc.populate === 'function') {
    return orderIdOrDoc
      .populate('merchant_id', 'merchant_name shop_name email phone referral_code hub_id status')
      .populate('rider_id', 'full_name email phone profile_image role hub_id')
      .populate('hub_id', 'name code city state');
  }

  return findOrderById(orderIdOrDoc);
};

module.exports = {
  ORDER_STATUSES,
  ADMIN_ROLES,
  MANAGER_ROLES,
  buildAuthContext,
  normalizePagination,
  generateOrderId,
  generatePackageTrackingId,
  generateRiderTrackingId,
  generateBatchId,
  generateOtpCode,
  generateQrCode,
  addHistoryEntry,
  addActivityLog,
  emitOrderEvent,
  serializeOrderForActor,
  stripPickupKeyFromPayload,
  buildOrderMatch,
  getOrderDispatchTargetCoordinates,
  scoreRiders,
  findNearestRider,
  ensureMerchantAndHub,
  createOrderRecord,
  createOrderBatch,
  listOrders,
  findOrderById,
  findOrderByPackageTrackingId,
  findOrderByRiderTrackingId,
  assertOrderAccess,
  transitionOrderStatus,
  submitOrderRating,
  assignRiderToOrder,
  confirmMerchantHandover,
  respondToAssignedOrder,
  confirmOrderCustody,
  confirmHubScanIn,
  verifyOrderOtp,
  manualOverrideOrderOtp,
  updateOrderDeliveryIssue,
  populateOrder,
};
