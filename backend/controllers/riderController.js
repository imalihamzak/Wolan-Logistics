const mongoose = require('mongoose');
const crypto = require('crypto');

const Rider = require('../models/Rider');
const User = require('../models/User');
const Hub = require('../models/Hub');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const { isKycVerified, isRiderKycComplete } = require('../utils/accountSecurity');
const riderService = require('../services/riderService');
const { consumeRegistrationOtp, phoneCandidates } = require('../services/otpService');
const { signAccessToken, signRefreshToken, hashToken } = require('../utils/token');
const calculateDistance = require('../utils/calculateDistance');
const { getRiderRestrictionSnapshot } = require('../utils/riderRestrictions');
const {
  buildPolicyAcceptanceRecords,
  getMissingRequiredAcceptedPolicyKeys,
  hasAcceptedRequiredPolicies,
} = require('../constants/policyConstants');
const { canAccessAllHubs, assertHubAccess, isAdminRole } = require('../utils/hubAccess');

const {
  createRiderProfile,
  getRiderByUserId,
  getRiderById,
  listRiders,
  updateRiderStatus,
  updateRiderVehicleType,
  updateRiderOperationalProfile,
  updateRiderGpsLocation,
  updateRiderKyc,
  updateRiderOperationalState,
  uploadRiderDocument,
  verifyRiderDocument,
  registerBondPayment,
  updateRiderBond,
  updateRiderPerformance,
  addFine,
  payFine: payRiderFine,
  reportIncident,
  resolveIncident: resolveRiderIncident,
  getDailyEarnings,
  getEarningsSummary,
} = riderService;
const {
  createWithdrawalRequest,
  listSettlements,
  updateSettlementStatus,
  recordCodSettlementCompletion,
} = require('../services/settlementService');
const { unbindRiderDevice } = require('../services/deviceSecurityService');

const getRiderActorContext = (req) => ({
  id: req.user.id,
  role: req.user.role,
  hub_id: req.user.hub_id,
  assigned_hub_ids: req.user.assigned_hub_ids || [],
});

const assertRiderHubAccess = (rider, user, actionName = 'Rider access') => {
  if (!user || canAccessAllHubs(user) || user.role === 'rider') {
    return;
  }

  if (!isAdminRole(user.role)) {
    throw new AppError('Forbidden', 403);
  }

  assertHubAccess(user, rider.hub_id?._id || rider.hub_id, actionName);
};

const assertRiderOperational = (rider, actionName) => {
  const riderUser = rider?.user_id && typeof rider.user_id === 'object' ? rider.user_id : null;

  if (!rider?.is_active || (riderUser && riderUser.is_active === false)) {
    const restriction = getRiderRestrictionSnapshot(rider);
    const detail = restriction.reason
      ? `${restriction.label}: ${restriction.reason}. ${restriction.reinstatement_label}`
      : 'the rider account is restricted';
    throw new AppError(`${actionName} is blocked because ${detail}`, 403);
  }

  if (!isRiderKycComplete(rider) || (riderUser && !isKycVerified(riderUser))) {
    throw new AppError(`${actionName} is blocked until rider KYC documents, stage chairman contact, and admin approval are complete`, 403);
  }

  if (!hasAcceptedRequiredPolicies('rider', rider.policy_acceptances)) {
    const missingPolicies = getMissingRequiredAcceptedPolicyKeys('rider', rider.policy_acceptances);
    throw new AppError(`${actionName} is blocked until rider legal agreements are accepted: ${missingPolicies.join(', ')}`, 403);
  }
};

const TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
};

const ACCESS_TOKEN_COOKIE_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_COOKIE_PATH = '/api/v1';
const STAFF_REFRESH_COOKIE_PATH = '/api/v1/auth';
const MERCHANT_REFRESH_COOKIE_PATH = '/api/v1/auth/merchants';

const clearAccessCookieVariants = (res) => {
  res.clearCookie('accessToken', TOKEN_COOKIE_OPTIONS);
  res.clearCookie('accessToken', { ...TOKEN_COOKIE_OPTIONS, path: '/api/v1' });
  res.clearCookie('accessToken', { ...TOKEN_COOKIE_OPTIONS, path: STAFF_REFRESH_COOKIE_PATH });
  res.clearCookie('accessToken', { ...TOKEN_COOKIE_OPTIONS, path: MERCHANT_REFRESH_COOKIE_PATH });
};

const clearRefreshCookieVariants = (res) => {
  res.clearCookie('refreshToken', { ...TOKEN_COOKIE_OPTIONS, path: STAFF_REFRESH_COOKIE_PATH });
  res.clearCookie('refreshToken', { ...TOKEN_COOKIE_OPTIONS, path: MERCHANT_REFRESH_COOKIE_PATH });
};

const clearAuthCookies = (res) => {
  clearAccessCookieVariants(res);
  clearRefreshCookieVariants(res);
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  clearAuthCookies(res);

  res.cookie('accessToken', accessToken, {
    ...TOKEN_COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
    path: ACCESS_TOKEN_COOKIE_PATH,
  });

  res.cookie('refreshToken', refreshToken, {
    ...TOKEN_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
    path: STAFF_REFRESH_COOKIE_PATH,
  });
};

const createDriverTokens = (user) => {
  const payload = {
    id: user._id,
    role: user.role,
    hub_id: user.hub_id,
    email: user.email,
  };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
};

const resolveRegistrationHub = async (hubId) => {
  if (hubId) {
    const hub = await Hub.findById(hubId);
    if (!hub) {
      throw new AppError('hub_id is invalid', 400);
    }
    return hub;
  }

  const existingHub = await Hub.findOne({ is_active: true }).sort({ createdAt: 1 });
  if (existingHub) {
    return existingHub;
  }

  return Hub.create({
    name: 'Pioneer Mall Hub',
    code: 'KLA-01',
    address: 'Pioneer Mall, Kampala',
    city: 'Kampala',
    state: 'Central',
    country: 'Uganda',
    zone: 'Kampala Central',
    contact_phone: '256700000000',
    contact_email: 'hub.kla01@wolan.local',
  });
};

const publicRegisterRider = asyncHandler(async (req, res) => {
  const payload = req.validatedBody || req.body;
  const phone = String(payload.phone || '').replace(/[^0-9]/g, '');
  const candidates = phoneCandidates(phone);

  const existingUser = await User.findOne({
    $or: [
      { phone: { $in: candidates } },
      { email: `driver.${phone}@wolan.local` },
    ],
  });

  if (existingUser) {
    throw new AppError('A driver account already exists for this phone number', 409);
  }

  const existingRider = await Rider.findOne({ phone: { $in: candidates } });
  if (existingRider) {
    throw new AppError('A rider profile already exists for this phone number', 409);
  }

  if (payload.hub_id) {
    const hubExists = await Hub.exists({ _id: payload.hub_id });
    if (!hubExists) {
      throw new AppError('hub_id is invalid', 400);
    }
  }

  await consumeRegistrationOtp({
    phone,
    accountType: 'driver',
    verificationToken: payload.otp_verification_token,
  });

  const hub = await resolveRegistrationHub(payload.hub_id);
  const user = await User.create({
    full_name: payload.full_name,
    email: `driver.${phone}@wolan.local`,
    phone,
    password: crypto.randomBytes(24).toString('hex'),
    role: 'rider',
    hub_id: hub._id,
    is_active: true,
    kyc_status: 'pending',
  });

  const rider = await createRiderProfile({
    userId: user._id,
    payload: {
      ...payload,
      phone,
      hub_id: hub._id,
      policy_acceptances: buildPolicyAcceptanceRecords({
        audience: 'rider',
        acceptedKeys: payload.accepted_policy_keys,
        req,
      }),
    },
    actor: {
      id: user._id,
      role: 'rider',
      hub_id: hub._id,
    },
  });

  const { accessToken, refreshToken } = createDriverTokens(user);
  user.refresh_token_hash = hashToken(refreshToken);
  user.last_login = new Date();
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'Driver registered successfully', {
    accessToken,
    refreshToken,
    user: user.toPublicJSON(),
    rider: rider.toPublicJSON(),
  }, 201);
});

const registerRider = asyncHandler(async (req, res) => {
  const payload = req.validatedBody || req.body;

  const rider = await createRiderProfile({
    userId: req.user.id,
    payload,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Rider profile created successfully', { rider: rider.toPublicJSON() }, 201);
});

const getMyRiderProfile = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  return successResponse(res, 'Rider profile fetched successfully', { rider: rider.toPublicJSON() });
});

const getRiderByIdController = asyncHandler(async (req, res) => {
  const rider = await getRiderById(req.params.id);

  if (!rider) {
    throw new AppError('Rider not found', 404);
  }

  assertRiderHubAccess(rider, req.user);

  return successResponse(res, 'Rider fetched successfully', { rider: rider.toPublicJSON({ includeInternal: req.user.role !== 'rider' }) });
});

const listAllRiders = asyncHandler(async (req, res) => {
  const result = await listRiders({ query: req.query, actor: getRiderActorContext(req) });

  return successResponse(res, 'Riders fetched successfully', {
    riders: result.items.map((rider) => rider.toPublicJSON({ includeInternal: req.user.role !== 'rider' })),
  }, 200, result.pagination);
});

const updateStatus = asyncHandler(async (req, res) => {
  const rider = req.params.id && req.user.role !== 'rider'
    ? await getRiderById(req.params.id)
    : await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider status update');

  const payload = req.validatedBody || req.body;
  const updatedRider = await updateRiderStatus({
    rider,
    status: payload.current_status,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Rider status updated successfully', { rider: updatedRider.toPublicJSON() });
});

const updateVehicleType = asyncHandler(async (req, res) => {
  const rider = await getRiderById(req.params.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider vehicle update');

  const payload = req.validatedBody || req.body;
  const updatedRider = await updateRiderVehicleType({
    rider,
    vehicleType: payload.vehicle_type,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Rider vehicle type updated successfully', { rider: updatedRider.toPublicJSON({ includeInternal: req.user.role !== 'rider' }) });
});

const updateOperationalProfile = asyncHandler(async (req, res) => {
  const rider = await getRiderById(req.params.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider profile update');

  const payload = req.validatedBody || req.body;
  const updatedRider = await updateRiderOperationalProfile({
    rider,
    payload,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Rider operational profile updated successfully', { rider: updatedRider.toPublicJSON({ includeInternal: req.user.role !== 'rider' }) });
});

const updateKycStatus = asyncHandler(async (req, res) => {
  const rider = await getRiderById(req.params.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider KYC update');

  const payload = req.validatedBody || req.body;
  const updatedRider = await updateRiderKyc({
    rider,
    status: payload.kyc_status,
    reason: payload.reason,
    adminVerificationNotes: payload.admin_verification_notes,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Rider KYC updated successfully', { rider: updatedRider.toPublicJSON({ includeInternal: true }) });
});

const updateOperationalState = asyncHandler(async (req, res) => {
  const rider = await getRiderById(req.params.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider suspension update');

  const payload = req.validatedBody || req.body;
  const updatedRider = await updateRiderOperationalState({
    rider,
    isActive: payload.is_active,
    reason: payload.reason,
    restrictionType: payload.restriction_type,
    durationHours: payload.duration_hours,
    durationDays: payload.duration_days,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, updatedRider.is_active ? 'Rider reinstated successfully' : 'Rider restriction applied successfully', {
    rider: updatedRider.toPublicJSON({ includeInternal: req.user.role !== 'rider' }),
  });
});

const unbindDeviceBinding = asyncHandler(async (req, res) => {
  const rider = await getRiderById(req.params.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider device unbinding');

  const payload = req.validatedBody || req.body;
  const updatedRider = await unbindRiderDevice({
    rider,
    reason: payload.reason,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Rider device binding cleared successfully', {
    rider: updatedRider.toPublicJSON({ includeInternal: req.user.role !== 'rider' }),
  });
});

const updateGpsLocation = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  const payload = req.validatedBody || req.body;
  const updatedRider = await updateRiderGpsLocation({
    rider,
    latitude: payload.latitude,
    longitude: payload.longitude,
  });

  return successResponse(res, 'GPS location updated successfully', {
    gps_location: updatedRider.gps_location,
    last_location_update: updatedRider.last_location_update,
  });
});

const Order = require('../models/Order');
const { getIO } = require('../config/socket');
const { emitToHub } = require('../services/realtimeService');

const scanPackageTracker = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { tracker_id, scanned_code } = req.validatedBody || req.body;
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }
  assertRiderOperational(rider, 'Package tracker scan');

  const order = await Order.findOne({ 
    _id: orderId, 
    rider_id: req.user.id,
    assignment_response_status: 'accepted'
  });

  if (!order) {
    throw new AppError('Order not found or not assigned to you', 404);
  }

  if (!['pending', 'picked_up', 'at_hub'].includes(order.order_status)) {
    throw new AppError('Package tracker can only be scanned before leaving hub (pending/picked_up/at_hub)', 400);
  }

  const trackerId = (tracker_id || scanned_code)?.trim().toUpperCase();
  if (!trackerId || trackerId.length < 3) {
    throw new AppError('Valid tracker ID required', 400);
  }

  if (order.physical_tracker_id && order.physical_tracker_id !== trackerId) {
    throw new AppError(`Physical tracker ${order.physical_tracker_id} is already linked to this order`, 409);
  }

  const trackerInUse = await Order.findOne({
    _id: { $ne: order._id },
    physical_tracker_id: trackerId,
    order_status: { $in: ['pending', 'picked_up', 'at_hub', 'out_for_delivery'] },
  });

  if (trackerInUse) {
    throw new AppError(`Physical tracker ${trackerId} is already linked to active order ${trackerInUse.order_id}`, 409);
  }

  const alreadyLinked = order.physical_tracker_id === trackerId;

  if (!alreadyLinked) {
    order.physical_tracker_id = trackerId;
    order.physical_tracker_linked_at = new Date();
    order.custody_scan_payload = JSON.stringify({
      package_tracking_id: order.package_tracking_id,
      physical_tracker_id: trackerId,
      scanned_by: req.user.id,
      scanned_at: new Date(),
    });
    order.status_history.push({
      status: 'tracker_scanned',
      note: `Physical tracker ${trackerId} scanned by rider`,
      updated_by: req.user.id,
      updated_by_role: 'rider',
      metadata: {
        package_tracking_id: order.package_tracking_id,
        physical_tracker_id: trackerId,
      },
    });
    order.activity_logs.push({
      action: 'physical_tracker_linked',
      note: `Physical tracker ${trackerId} linked to package ${order.package_tracking_id}`,
      actor_id: req.user.id,
      actor_role: 'rider',
      metadata: {
        package_tracking_id: order.package_tracking_id,
        physical_tracker_id: trackerId,
      },
    });
    await order.save();
  }

  const io = getIO();
  if (io) {
    io.to(`hub:${rider.hub_id}`).emit('package-tracker-scanned', {
      order_db_id: order._id,
      order_id: order.order_id,
      rider_id: rider._id,
      package_tracking_id: order.package_tracking_id,
      physical_tracker_id: trackerId,
      hub_id: rider.hub_id,
      timestamp: new Date(),
    });
    io.to('admin').emit('package-tracker-scanned', {
      order_db_id: order._id,
      order_id: order.order_id,
      rider_name: rider.full_name,
      package_tracking_id: order.package_tracking_id,
      physical_tracker_id: trackerId,
      hub_id: rider.hub_id,
    });
  }

  emitToHub(rider.hub_id || order.hub_id, 'rider-scanned-package-tracker', {
    rider_id: rider._id,
    order_db_id: order._id,
    order_id: order.order_id,
    package_tracking_id: order.package_tracking_id,
    physical_tracker_id: trackerId,
  });

  return successResponse(res, alreadyLinked ? 'Physical tracker already linked to this delivery' : 'Physical tracker successfully linked to delivery', {
    order_id: order.order_id,
    package_tracking_id: order.package_tracking_id,
    physical_tracker_id: order.physical_tracker_id,
    next_step: 'Ready to leave hub for delivery',
  });
});

const updateTrackerLocation = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const payload = req.validatedBody || req.body;

  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }
  assertRiderOperational(rider, 'Package tracker location update');

  const order = await Order.findOne({
    _id: orderId,
    rider_id: req.user.id,
  });

  if (!order) {
    throw new AppError(
      'Order not found or not assigned to you',
      404
    );
  }

  order.tracker_last_location = {
    latitude,
    longitude,
    updated_at: new Date(),
  };
  order.package_gps_location = {
    type: 'Point',
    coordinates: [longitude, latitude],
  };
  order.package_last_update = new Date();

  const [riderLongitude, riderLatitude] = Array.isArray(rider?.gps_location?.coordinates)
    ? rider.gps_location.coordinates
    : [];
  const hasRiderFix = Number.isFinite(riderLatitude)
    && Number.isFinite(riderLongitude)
    && !(riderLatitude === 0 && riderLongitude === 0);

  if (hasRiderFix) {
    const distance =
      calculateDistance(
        riderLatitude,
        riderLongitude,
        latitude,
        longitude
      );

    order.tracker_divergence_distance =
      Math.round(distance);

    order.tracker_divergence_alert = distance > 500;
  } else {
    order.tracker_divergence_distance = 0;
    order.tracker_divergence_alert = false;
  }

  await order.save();

  emitToHub(rider?.hub_id || order.hub_id, 'package-location-updated', {
    order_id: order.order_id,
    order_db_id: order._id,
    rider_id: rider?._id || null,
    package_tracking_id: order.package_tracking_id,
    physical_tracker_id: order.physical_tracker_id,
    tracker_last_location: order.tracker_last_location,
    divergence_alert: order.tracker_divergence_alert,
    divergence_distance: order.tracker_divergence_distance,
  });

  if (order.tracker_divergence_alert) {
    emitToHub(rider?.hub_id || order.hub_id, 'tracker-divergence-alert', {
      order_id: order.order_id,
      order_db_id: order._id,
      rider_id: rider?._id || null,
      package_tracking_id: order.package_tracking_id,
      physical_tracker_id: order.physical_tracker_id,
      divergence_distance: order.tracker_divergence_distance,
    });
  }

  return successResponse(
    res,
    'Tracker location updated',
    {
      tracker_last_location: order.tracker_last_location,
      package_gps_location: order.package_gps_location,
      divergence_alert:
        order.tracker_divergence_alert,

      divergence_distance:
        order.tracker_divergence_distance,
    }
  );
});

const uploadDocument = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  const payload = req.validatedBody || req.body;
  const updatedRider = await uploadRiderDocument({
    rider,
    documentType: payload.document_type,
    url: payload.url,
    publicId: payload.public_id,
  });

  return successResponse(res, 'Document uploaded successfully', { rider: updatedRider.toPublicJSON() });
});

const verifyDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { document_type } = req.body;

  const rider = await getRiderById(id);

  if (!rider) {
    throw new AppError('Rider not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider document verification');

  const verified = req.body.verified === true || req.body.verified === 'true';
  const updatedRider = await verifyRiderDocument({
    rider,
    documentType: document_type,
    verified,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Document verified successfully', { rider: updatedRider.toPublicJSON({ includeInternal: req.user.role !== 'rider' }) });
});

const registerBond = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  const payload = req.validatedBody || req.body;
  const updatedRider = await registerBondPayment({
    rider,
    amount: payload.bond_amount,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Bond registered successfully', { rider: updatedRider.toPublicJSON() });
});

const updateBond = asyncHandler(async (req, res) => {
  const rider = await getRiderById(req.params.id);

  if (!rider) {
    throw new AppError('Rider not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider bond management');

  const payload = req.validatedBody || req.body;
  const updatedRider = await updateRiderBond({
    rider,
    action: payload.action,
    amount: payload.bond_amount,
    reference: payload.reference,
    note: payload.note || payload.reason,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Rider security bond updated successfully', {
    rider: updatedRider.toPublicJSON({ includeInternal: req.user.role !== 'rider' }),
  });
});

const updatePerformance = asyncHandler(async (req, res) => {
  const rider = await getRiderById(req.params.id);

  if (!rider) {
    throw new AppError('Rider not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider performance update');

  const updatedRider = await updateRiderPerformance({ rider });

  return successResponse(res, 'Performance updated successfully', { rider: updatedRider.toPublicJSON() });
});

const issueFine = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = req.validatedBody || req.body;

  const rider = await getRiderById(id);

  if (!rider) {
    throw new AppError('Rider not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider fine issue');

  const updatedRider = await addFine({
    rider,
    amount: payload.amount,
    reason: payload.reason,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Fine issued successfully', { rider: updatedRider.toPublicJSON() });
});

const payFineController = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  const { fineId } = req.params;
  const updatedRider = await payRiderFine(rider, fineId);

  return successResponse(res, 'Fine paid successfully', { rider: updatedRider.toPublicJSON() });
});

const getFines = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  return successResponse(res, 'Fines fetched successfully', { fines: rider.fines });
});

const createIncident = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  const payload = req.validatedBody || req.body;
  const updatedRider = await reportIncident({
    rider,
    type: payload.type,
    description: payload.description,
    location: payload.location,
  });

  return successResponse(res, 'Incident reported successfully', { rider: updatedRider.toPublicJSON() });
});

const resolveIncidentController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { incidentId } = req.params;
  const payload = req.validatedBody || req.body;

  const rider = await getRiderById(id);

  if (!rider) {
    throw new AppError('Rider not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider incident resolution');

  const updatedRider = await resolveRiderIncident({
    rider,
    incidentId,
    resolution: payload.resolution,
    status: payload.status,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Incident workflow updated successfully', {
    rider: updatedRider.toPublicJSON({ includeInternal: req.user.role !== 'rider' }),
  });
});

const getIncidents = asyncHandler(async (req, res) => {
  const rider = req.params.id
    ? await getRiderById(req.params.id)
    : await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  if (req.params.id) {
    assertRiderHubAccess(rider, req.user, 'Rider incident access');
  }

  const riderPayload = rider.toPublicJSON({ includeInternal: req.user.role !== 'rider' });
  return successResponse(res, 'Incidents fetched successfully', { incidents: riderPayload.incidents || [] });
});

const getDailySummary = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  const payload = req.validatedBody || req.body;
  const date = payload.date ? new Date(payload.date) : new Date();

  const summary = await getDailyEarnings({ rider, date });

  return successResponse(res, 'Daily summary fetched successfully', { summary });
});

const getEarnings = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  const payload = req.validatedBody || req.body;
  const summary = await getEarningsSummary({
    rider,
    from: payload.from,
    to: payload.to,
  });

  return successResponse(res, 'Earnings fetched successfully', { summary });
});

const getRiderEarnings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const rider = await getRiderById(id);

  if (!rider) {
    throw new AppError('Rider not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'Rider earnings access');

  const payload = req.validatedBody || req.body;
  const summary = await getEarningsSummary({
    rider,
    from: payload.from,
    to: payload.to,
  });

  return successResponse(res, 'Earnings fetched successfully', { summary });
});

const requestWithdrawal = asyncHandler(async (req, res) => {
  const rider = await getRiderByUserId(req.user.id);

  if (!rider) {
    throw new AppError('Rider profile not found', 404);
  }

  const result = await createWithdrawalRequest({
    rider,
    payload: req.validatedBody || req.body,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Withdrawal request submitted successfully', {
    settlement: result.settlement.toPublicJSON(),
    rider: result.rider.toPublicJSON(),
    balance: result.balance,
  }, 201);
});

const listSettlementHistory = asyncHandler(async (req, res) => {
  const result = await listSettlements({
    query: req.validatedBody || req.query,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Settlement history fetched successfully', {
    settlements: result.items.map((settlement) => settlement.toPublicJSON()),
    balance: result.balance,
  }, 200, result.pagination);
});

const updateSettlementStatusController = asyncHandler(async (req, res) => {
  const result = await updateSettlementStatus({
    settlementId: req.params.settlementId,
    payload: req.validatedBody || req.body,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'Settlement status updated successfully', {
    settlement: result.settlement.toPublicJSON(),
    rider: result.rider.toPublicJSON(),
    balance: result.balance,
  });
});

const recordCodSettlement = asyncHandler(async (req, res) => {
  const rider = await getRiderById(req.params.id);

  if (!rider) {
    throw new AppError('Rider not found', 404);
  }

  assertRiderHubAccess(rider, req.user, 'COD settlement');

  const result = await recordCodSettlementCompletion({
    rider,
    payload: req.validatedBody || req.body,
    actor: getRiderActorContext(req),
  });

  return successResponse(res, 'COD settlement recorded successfully', {
    settlement: result.settlement.toPublicJSON(),
    rider: result.rider.toPublicJSON(),
    balance: result.balance,
  }, 201);
});

module.exports = {
  publicRegisterRider,
  registerRider,
  getMyRiderProfile,
  getRiderByIdController,
  listAllRiders,
  updateStatus,
  updateVehicleType,
  updateOperationalProfile,
  updateKycStatus,
  updateOperationalState,
  unbindDeviceBinding,
  updateGpsLocation,
  scanPackageTracker,
  updateTrackerLocation,
  uploadDocument,
  verifyDocument,
  registerBond,
  updateBond,
  updatePerformance,
  issueFine,
  payFineController,
  getFines,
  createIncident,
  resolveIncidentController,
  getIncidents,
  getDailySummary,
  getEarnings,
  getRiderEarnings,
  requestWithdrawal,
  listSettlementHistory,
  updateSettlementStatusController,
  recordCodSettlement,
};
