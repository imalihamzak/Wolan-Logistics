const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Rider = require('../models/Rider');
const User = require('../models/User');
const Order = require('../models/Order');
const Hub = require('../models/Hub');
const Upload = require('../models/Upload');
const AppError = require('../utils/AppError');
const { emitToAdmin, emitToHub, emitToUser } = require('./realtimeService');
const { phoneCandidates } = require('./otpService');
const {
  RIDER_REQUIRED_DOCUMENT_TYPES,
  RIDER_VEHICLE_TYPES,
} = require('../constants/riderConstants');
const {
  RIDER_SOFT_BLOCK_MIN_HOURS,
  RIDER_SOFT_BLOCK_MAX_HOURS,
  RIDER_HARD_BLOCK_MIN_DAYS,
  RIDER_HARD_BLOCK_MAX_DAYS,
} = require('../constants/riderRestrictionConstants');
const { isKycVerified, isRiderKycComplete, applyKycDecision } = require('../utils/accountSecurity');
const {
  RIDER_COD_OPERATION_LIMIT,
  RIDER_PAYOUT_RATE,
  RIDER_FLAT_DELIVERY_PAYOUT,
} = require('../constants/settlementConstants');
const {
  getMissingRequiredAcceptedPolicyKeys,
  hasAcceptedRequiredPolicies,
} = require('../constants/policyConstants');
const { assertRiderBelowCodLimit } = require('./settlementService');
const { refreshRiderDispatchPerformance } = require('./dispatchPerformanceService');
const {
  buildRestrictionSchedule,
  getRiderRestrictionSnapshot,
  getRestrictionLabel,
  isTemporaryRestriction,
  normalizeRestrictionType,
} = require('../utils/riderRestrictions');
const {
  ADMIN_ROLES,
  isAdminRole,
  buildHubScopedMatch,
  assertHubAccess,
} = require('../utils/hubAccess');

const RIDER_STATUSES = ['available', 'on_delivery', 'break', 'offline'];
const DISPATCH_WINDOW_DAYS = 30;
const DOCUMENT_LABELS = {
  id_card: 'National ID / Passport',
  license: 'Driving Permit',
  rider_photo: 'Rider Photograph',
  bike_photo: 'Bike Photograph',
};
const uploadRoot = path.resolve(__dirname, '..', 'uploads');

const buildAuthContext = (actor = {}) => ({
  id: actor.id ? String(actor.id) : null,
  role: actor.role || 'system',
  hub_id: actor.hub_id ? String(actor.hub_id) : null,
  assigned_hub_ids: actor.assigned_hub_ids || [],
});

const getMissingRequiredDocuments = (rider) => RIDER_REQUIRED_DOCUMENT_TYPES.filter((type) =>
  !rider.documents?.some((doc) => doc.type === type)
);

const hasStoredUploadReference = (doc) => Boolean(
  doc?.public_id && mongoose.Types.ObjectId.isValid(doc.public_id)
);

const isReviewableDocument = (doc, options = {}) => {
  if (options.requireStoredUpload) {
    return hasStoredUploadReference(doc);
  }

  return Boolean(
    hasStoredUploadReference(doc)
    || (typeof doc?.url === 'string' && /^https?:\/\//i.test(doc.url))
  );
};

const getUnreviewableRequiredDocuments = (rider) => RIDER_REQUIRED_DOCUMENT_TYPES.filter((type) => {
  const document = rider.documents?.find((doc) => doc.type === type);
  return !isReviewableDocument(document, { requireStoredUpload: true });
});

const formatDocumentList = (documentTypes) => documentTypes
  .map((type) => DOCUMENT_LABELS[type] || type)
  .join(', ');

const isStoredUploadAccessible = (upload) => {
  if (!upload?.file_path) {
    return false;
  }

  const resolvedPath = path.resolve(upload.file_path);
  if (resolvedPath !== uploadRoot && !resolvedPath.startsWith(`${uploadRoot}${path.sep}`)) {
    return false;
  }

  return fs.existsSync(resolvedPath);
};

const getUnavailableStoredRequiredDocuments = async (rider) => {
  const unavailable = [];

  await Promise.all(RIDER_REQUIRED_DOCUMENT_TYPES.map(async (type) => {
    const document = rider.documents?.find((doc) => doc.type === type);
    const hasExternalUrl = typeof document?.url === 'string' && /^https?:\/\//i.test(document.url);

    if (!document?.public_id || hasExternalUrl) {
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(document.public_id)) {
      unavailable.push(type);
      return;
    }

    const upload = await Upload.findOne({
      _id: document.public_id,
      related_model: 'Rider',
      related_id: rider._id,
      hub_id: rider.hub_id,
    }).lean();

    if (!isStoredUploadAccessible(upload)) {
      unavailable.push(type);
    }
  }));

  return unavailable;
};

const buildRiderRealtimePayload = (rider, options = {}) => ({
  ...rider.toPublicJSON({ includeInternal: Boolean(options.includeInternal) }),
  id: resolveIdValue(rider._id),
  rider_id: resolveIdValue(rider._id),
  user_id: resolveIdValue(rider.user_id),
});

const pushRestrictionHistory = ({ rider, action, type, reason, startedAt, expiresAt, liftedAt, reinstatementState, actor }) => {
  rider.restriction_history = Array.isArray(rider.restriction_history) ? rider.restriction_history : [];
  rider.restriction_history.push({
    action,
    type: type || 'none',
    reason: reason || null,
    started_at: startedAt || null,
    expires_at: expiresAt || null,
    lifted_at: liftedAt || null,
    reinstatement_state: reinstatementState || 'none',
    actor_id: actor?.id || null,
    actor_role: actor?.role || 'system',
    occurred_at: new Date(),
  });

  if (rider.restriction_history.length > 25) {
    rider.restriction_history = rider.restriction_history.slice(-25);
  }
};

const RIDER_DEVICE_SELECT = '+device_binding.device_id_hash +device_binding.mismatch_device_id_hash +device_binding_history';
const DEVICE_FREEZE_REASON_PREFIX = 'Device security freeze';
const configuredSecurityBondAmount = Number(process.env.RIDER_SECURITY_BOND_AMOUNT || 250000);
const RIDER_SECURITY_BOND_AMOUNT = Number.isFinite(configuredSecurityBondAmount) && configuredSecurityBondAmount > 0
  ? configuredSecurityBondAmount
  : 250000;

const assertActorCanUseHub = (context, hubId, actionName = 'Hub operation') => {
  if (!isAdminRole(context.role)) {
    return;
  }

  assertHubAccess(context, hubId, actionName);
};

const resolveIdValue = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return String(value._id || value.id || value);
  }
  return String(value);
};

const normalizePagination = (query = {}) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const ensureUserAndHub = async ({ userId, hubId }) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role !== 'rider') {
    throw new AppError('User must have rider role', 400);
  }

  const effectiveHubId = hubId || user.hub_id;

  if (!effectiveHubId) {
    throw new AppError('hub_id is required for rider registration', 400);
  }

  const hubExists = await Hub.exists({ _id: effectiveHubId });
  if (!hubExists) {
    throw new AppError('hub_id is invalid', 400);
  }

  return { user, hubId: effectiveHubId };
};

const createRiderProfile = async ({ userId, payload, actor }) => {
  const { user, hubId } = await ensureUserAndHub({ userId, hubId: payload.hub_id });

  const existingRider = await Rider.findOne({ user_id: userId });
  if (existingRider) {
    throw new AppError('Rider profile already exists', 409);
  }

  if (!RIDER_VEHICLE_TYPES.includes(payload.vehicle_type)) {
    throw new AppError('vehicle_type is required and must be one of moto, voiture, velo', 400);
  }

  const rider = new Rider({
    user_id: user._id,
    full_name: payload.full_name || user.full_name,
    phone: payload.phone || user.phone,
    years_experience: payload.years_experience || 0,
    district: payload.district,
    division: payload.division,
    boda_stage: payload.boda_stage,
    stage_chairman_phone: payload.stage_chairman_phone,
    vehicle_type: payload.vehicle_type,
    bike_plate: payload.bike_plate,
    nin_number: payload.nin_number,
    next_of_kin: payload.next_of_kin,
    bond_amount: 0,
    bond_target_amount: RIDER_SECURITY_BOND_AMOUNT,
    bond_status: 'pending',
    current_status: 'offline',
    gps_location: { type: 'Point', coordinates: [0, 0] },
    current_cod: 0,
    performance_score: 0,
    total_deliveries: 0,
    earnings: 0,
    hub_id: hubId,
    is_active: true,
    kyc_status: 'pending',
    policy_acceptances: payload.policy_acceptances || [],
    activation_date: new Date(),
  });

  await rider.save();

  const registrationPayload = buildRiderRealtimePayload(rider, { includeInternal: true });
  emitToHub(resolveIdValue(rider.hub_id), 'rider:registered', registrationPayload);
  emitToAdmin('rider:registered', registrationPayload);
  emitToUser(resolveIdValue(rider.user_id), 'rider:registered', buildRiderRealtimePayload(rider));

  return rider;
};

const getRiderByUserId = async (userId) => Rider.findOne({ user_id: userId })
  .select(RIDER_DEVICE_SELECT)
  .populate('user_id', 'full_name email phone role hub_id is_active kyc_status account_locked failed_login_attempts locked_at locked_reason unlocked_at')
  .populate('hub_id', 'name code city coordinates');

const getRiderById = async (riderId) => Rider.findById(riderId)
  .select(RIDER_DEVICE_SELECT)
  .populate('user_id', 'full_name email phone role hub_id is_active kyc_status account_locked failed_login_attempts locked_at locked_reason unlocked_at')
  .populate('hub_id', 'name code city coordinates');

const listRiders = async ({ query, actor }) => {
  const { page, limit, skip } = normalizePagination(query);
  const context = buildAuthContext(actor);

  const match = {};
  if (isAdminRole(context.role)) {
    Object.assign(match, buildHubScopedMatch(context, query, {
      actionName: 'Rider directory access',
    }));
  } else if (context.hub_id) {
    match.hub_id = new mongoose.Types.ObjectId(context.hub_id);
  }

  if (query.current_status) {
    match.current_status = query.current_status;
  }

  if (query.is_active !== undefined) {
    match.is_active = query.is_active === 'true' || query.is_active === true;
  }

  if (query.search) {
    match.$or = [
      { full_name: { $regex: query.search, $options: 'i' } },
      { phone: { $regex: query.search, $options: 'i' } },
      { bike_plate: { $regex: query.search, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Rider.find(match)
      .select(RIDER_DEVICE_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user_id', 'full_name email phone role hub_id is_active kyc_status account_locked failed_login_attempts locked_at locked_reason unlocked_at')
      .populate('hub_id', 'name code city coordinates'),
    Rider.countDocuments(match),
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

const updateRiderStatus = async ({ rider, status, actor }) => {
  if (!RIDER_STATUSES.includes(status)) {
    throw new AppError('Invalid rider status', 400);
  }

  if (!rider.is_active && status !== 'offline') {
    throw new AppError('Suspended riders can only remain offline until reinstated by admin', 403);
  }

  if (!isRiderKycComplete(rider) && status !== 'offline') {
    throw new AppError('Rider KYC documents, stage chairman contact, and admin approval must be complete before becoming operational', 403);
  }

  if (status !== 'offline' && !hasAcceptedRequiredPolicies('rider', rider.policy_acceptances)) {
    const missingPolicies = getMissingRequiredAcceptedPolicyKeys('rider', rider.policy_acceptances);
    throw new AppError(`Rider legal agreements must be accepted before becoming operational: ${missingPolicies.join(', ')}`, 403);
  }

  if (['available', 'on_delivery'].includes(status)) {
    assertRiderBelowCodLimit(rider, 'Rider status update');
  }

  rider.current_status = status;
  if (status === 'offline') {
    rider.gps_location = { type: 'Point', coordinates: [0, 0] };
  }

  await rider.save();

  const payload = {
    rider_id: rider._id,
    user_id: rider.user_id,
    full_name: rider.full_name,
    current_status: status,
  };

  emitToHub(resolveIdValue(rider.hub_id), 'rider:status-updated', payload);
  emitToUser(resolveIdValue(rider.user_id), 'rider:status-updated', payload);

  return rider;
};

const updateRiderVehicleType = async ({ rider, vehicleType, actor }) => {
  if (!RIDER_VEHICLE_TYPES.includes(vehicleType)) {
    throw new AppError('vehicle_type must be one of moto, voiture, velo', 400);
  }

  rider.vehicle_type = vehicleType;
  await rider.save();
  try {
    await refreshRiderDispatchPerformance({ riderUserId: rider.user_id, hubId: rider.hub_id });
  } catch (error) {
    console.warn(`Rider dispatch performance refresh failed after vehicle update: ${error.message}`);
  }

  const payload = {
    rider_id: rider._id,
    user_id: rider.user_id,
    full_name: rider.full_name,
    vehicle_type: rider.vehicle_type,
    updated_by: actor?.id || null,
  };

  emitToHub(resolveIdValue(rider.hub_id), 'rider:vehicle-updated', payload);
  emitToUser(resolveIdValue(rider.user_id), 'rider:vehicle-updated', payload);

  return rider;
};

const updateRiderOperationalProfile = async ({ rider, payload, actor }) => {
  const context = buildAuthContext(actor);
  const previousHubId = resolveIdValue(rider.hub_id);
  const nextHubId = payload.hub_id || resolveIdValue(rider.hub_id);

  assertActorCanUseHub(context, resolveIdValue(rider.hub_id), 'Rider profile update');
  assertActorCanUseHub(context, nextHubId, 'Rider profile update');

  if (payload.hub_id) {
    const hubExists = await Hub.exists({ _id: payload.hub_id, is_active: true });
    if (!hubExists) {
      throw new AppError('hub_id is invalid or inactive', 400);
    }
  }

  if (payload.phone !== undefined && payload.phone !== rider.phone) {
    const candidatePhones = phoneCandidates(payload.phone);
    const currentUserId = resolveIdValue(rider.user_id);
    const [duplicateRider, duplicateUser] = await Promise.all([
      Rider.exists({ _id: { $ne: rider._id }, phone: { $in: candidatePhones } }),
      User.exists({ _id: { $ne: currentUserId }, phone: { $in: candidatePhones } }),
    ]);

    if (duplicateRider || duplicateUser) {
      throw new AppError('Phone number is already used by another account', 409);
    }
  }

  if (payload.full_name !== undefined) {
    rider.full_name = payload.full_name;
  }
  if (payload.phone !== undefined) {
    rider.phone = payload.phone;
  }
  if (payload.years_experience !== undefined) {
    rider.years_experience = payload.years_experience;
  }
  if (payload.district !== undefined) {
    rider.district = payload.district;
  }
  if (payload.division !== undefined) {
    rider.division = payload.division;
  }
  if (payload.boda_stage !== undefined) {
    rider.boda_stage = payload.boda_stage;
  }
  if (payload.stage_chairman_phone !== undefined) {
    rider.stage_chairman_phone = payload.stage_chairman_phone;
  }
  if (payload.bike_plate !== undefined) {
    rider.bike_plate = payload.bike_plate;
  }
  if (payload.nin_number !== undefined) {
    rider.nin_number = payload.nin_number;
  }
  if (payload.next_of_kin !== undefined) {
    rider.next_of_kin = payload.next_of_kin;
  }
  if (payload.current_cod !== undefined) {
    rider.current_cod = payload.current_cod;
  }
  if (payload.hub_id !== undefined) {
    rider.hub_id = payload.hub_id;
  }

  const user = await User.findById(resolveIdValue(rider.user_id));
  if (user) {
    if (payload.full_name !== undefined) {
      user.full_name = payload.full_name;
    }
    if (payload.phone !== undefined) {
      user.phone = payload.phone;
    }
    if (payload.hub_id !== undefined) {
      user.hub_id = payload.hub_id;
    }
    await user.save({ validateBeforeSave: false });
  }

  await rider.save({ validateBeforeSave: false });

  const payloadForEvent = {
    rider_id: rider._id,
    user_id: rider.user_id,
    full_name: rider.full_name,
    phone: rider.phone,
    years_experience: rider.years_experience,
    district: rider.district,
    division: rider.division,
    boda_stage: rider.boda_stage,
    stage_chairman_phone: rider.stage_chairman_phone,
    bike_plate: rider.bike_plate,
    hub_id: rider.hub_id,
    updated_by: actor?.id || null,
  };

  const currentHubId = resolveIdValue(rider.hub_id);
  emitToHub(currentHubId, 'rider:profile-updated', payloadForEvent);
  if (previousHubId && previousHubId !== currentHubId) {
    emitToHub(previousHubId, 'rider:profile-updated', payloadForEvent);
  }
  emitToUser(resolveIdValue(rider.user_id), 'rider:profile-updated', payloadForEvent);

  return rider;
};

const updateRiderGpsLocation = async ({ rider, latitude, longitude }) => {
  if (!rider.is_active) {
    throw new AppError('Suspended riders cannot update GPS until reinstated by admin', 403);
  }

  if (!isRiderKycComplete(rider)) {
    throw new AppError('Rider KYC documents, stage chairman contact, and admin approval must be complete before GPS tracking can become operational', 403);
  }

  if (!hasAcceptedRequiredPolicies('rider', rider.policy_acceptances)) {
    const missingPolicies = getMissingRequiredAcceptedPolicyKeys('rider', rider.policy_acceptances);
    throw new AppError(`Rider legal agreements must be accepted before GPS tracking can become operational: ${missingPolicies.join(', ')}`, 403);
  }

  if (latitude < -90 || latitude > 90) {
    throw new AppError('Invalid latitude', 400);
  }
  if (longitude < -180 || longitude > 180) {
    throw new AppError('Invalid longitude', 400);
  }

  rider.gps_location = {
    type: 'Point',
    coordinates: [longitude, latitude],
  };
  rider.last_location_update = new Date();

  if (rider.current_status === 'offline') {
    assertRiderBelowCodLimit(rider, 'GPS availability update');
    rider.current_status = 'available';
  }

  await rider.save();

  const payload = {
    rider_id: rider._id,
    user_id: rider.user_id,
    gps_location: rider.gps_location,
    last_location_update: rider.last_location_update,
  };

  emitToHub(resolveIdValue(rider.hub_id), 'rider:location-updated', payload);
  emitToUser(resolveIdValue(rider.user_id), 'rider:location-updated', payload);

  try {
    await refreshRiderDispatchPerformance({ riderUserId: rider.user_id, hubId: rider.hub_id });
  } catch (error) {
    console.warn(`Rider dispatch performance refresh failed after GPS update: ${error.message}`);
  }

  return rider;
};

const assertRiderDocumentUploadReference = async ({ rider, documentType, url, publicId }) => {
  const hasExternalUrl = typeof url === 'string' && /^https?:\/\//i.test(url);
  const isRequiredDocument = RIDER_REQUIRED_DOCUMENT_TYPES.includes(documentType);

  if (!publicId) {
    if (isRequiredDocument) {
      throw new AppError('Required rider KYC documents must be uploaded as stored files', 400);
    }

    if (!hasExternalUrl) {
      throw new AppError('Document must reference a stored upload or an external reviewable URL', 400);
    }
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(publicId)) {
    if (!isRequiredDocument && hasExternalUrl) {
      return;
    }
    throw new AppError('Document upload reference is invalid', 400);
  }

  const upload = await Upload.findById(publicId).lean();
  if (!upload) {
    throw new AppError('Document upload reference was not found', 404);
  }

  if (upload.related_model !== 'Rider' || String(upload.related_id) !== String(rider._id)) {
    throw new AppError('Document upload reference does not belong to this rider profile', 400);
  }

  if (String(upload.hub_id) !== String(resolveIdValue(rider.hub_id))) {
    throw new AppError('Document upload hub does not match this rider profile', 400);
  }

  if (String(upload.uploaded_by) !== String(resolveIdValue(rider.user_id))) {
    throw new AppError('Document upload must be submitted by the rider account being reviewed', 403);
  }
};

const uploadRiderDocument = async ({ rider, documentType, url, publicId }) => {
  await assertRiderDocumentUploadReference({ rider, documentType, url, publicId });

  const existingIndex = rider.documents.findIndex((doc) => doc.type === documentType);

  const docData = {
    type: documentType,
    url,
    public_id: publicId,
    verified: false,
    uploaded_at: new Date(),
  };

  if (existingIndex >= 0) {
    rider.documents[existingIndex] = docData;
  } else {
    rider.documents.push(docData);
  }

  rider.kyc_status = 'pending';
  rider.kyc_verified_at = null;
  rider.kyc_verified_by = null;
  rider.kyc_rejection_reason = null;
  rider.all_documents_verified = false;

  const allUploaded = RIDER_REQUIRED_DOCUMENT_TYPES.every((type) =>
    rider.documents.some((doc) => doc.type === type)
  );

  if (allUploaded) {
    rider.all_documents_verified = RIDER_REQUIRED_DOCUMENT_TYPES.every((type) =>
      rider.documents.some((doc) => doc.type === type && doc.verified === true)
    );
  }

  await rider.save();

  const user = await User.findById(resolveIdValue(rider.user_id));
  if (user) {
    user.kyc_status = 'pending';
    user.kyc_verified_at = null;
    user.kyc_verified_by = null;
    user.kyc_rejection_reason = null;
    await user.save({ validateBeforeSave: false });
  }

  const documentPayload = buildRiderRealtimePayload(rider, { includeInternal: true });

  emitToHub(resolveIdValue(rider.hub_id), 'rider:kyc-documents-updated', documentPayload);
  emitToAdmin('rider:kyc-documents-updated', documentPayload);
  emitToUser(resolveIdValue(rider.user_id), 'rider:kyc-documents-updated', buildRiderRealtimePayload(rider));

  return rider;
};

const verifyRiderDocument = async ({ rider, documentType, verified, actor }) => {
  const doc = rider.documents.find((d) => d.type === documentType);
  if (!doc) {
    throw new AppError('Document not found', 404);
  }

  doc.verified = verified;

  const allVerified = RIDER_REQUIRED_DOCUMENT_TYPES.every((type) =>
    rider.documents.some((item) => item.type === type && item.verified === true)
  );

  rider.all_documents_verified = allVerified;
  if (!allVerified && rider.kyc_status === 'verified') {
    rider.kyc_status = 'pending';
    rider.kyc_verified_at = null;
    rider.kyc_verified_by = null;
  }

  await rider.save();

  const user = await User.findById(resolveIdValue(rider.user_id));
  if (user) {
    user.kyc_status = rider.kyc_status;
    user.kyc_verified_at = rider.kyc_verified_at;
    user.kyc_verified_by = rider.kyc_verified_by;
    await user.save({ validateBeforeSave: false });
  }

  const documentPayload = {
    ...buildRiderRealtimePayload(rider, { includeInternal: true }),
    updated_by: actor?.id || null,
  };

  emitToHub(resolveIdValue(rider.hub_id), 'rider:kyc-documents-updated', documentPayload);
  emitToAdmin('rider:kyc-documents-updated', documentPayload);
  emitToUser(resolveIdValue(rider.user_id), 'rider:kyc-documents-updated', buildRiderRealtimePayload(rider));

  return rider;
};

const updateRiderKyc = async ({ rider, status, reason, adminVerificationNotes, actor }) => {
  if (status === 'verified') {
    if (!rider.stage_chairman_phone) {
      throw new AppError('Cannot approve KYC until the stage chairman contact number is recorded', 400);
    }

    const missingDocuments = getMissingRequiredDocuments(rider);
    if (missingDocuments.length > 0) {
      throw new AppError(`Cannot approve KYC until required documents are uploaded: ${formatDocumentList(missingDocuments)}`, 400);
    }

    const unreviewableDocuments = getUnreviewableRequiredDocuments(rider);
    if (unreviewableDocuments.length > 0) {
      throw new AppError(`Cannot approve KYC until required documents are stored uploads that can be opened for review: ${formatDocumentList(unreviewableDocuments)}`, 400);
    }

    const unavailableStoredDocuments = await getUnavailableStoredRequiredDocuments(rider);
    if (unavailableStoredDocuments.length > 0) {
      throw new AppError(`Cannot approve KYC until stored document files are accessible: ${formatDocumentList(unavailableStoredDocuments)}`, 400);
    }

    rider.documents.forEach((doc) => {
      if (RIDER_REQUIRED_DOCUMENT_TYPES.includes(doc.type)) {
        doc.verified = true;
      }
    });
  }

  await applyKycDecision(rider, status, actor?.id, reason);
  rider.all_documents_verified = rider.kyc_status === 'verified';
  rider.admin_verification_notes = adminVerificationNotes || rider.admin_verification_notes || null;
  rider.admin_verification_notes_by = adminVerificationNotes ? actor?.id || null : rider.admin_verification_notes_by;
  rider.admin_verification_notes_at = adminVerificationNotes ? new Date() : rider.admin_verification_notes_at;
  await rider.save({ validateBeforeSave: false });

  const user = await User.findById(resolveIdValue(rider.user_id));
  if (user) {
    await applyKycDecision(user, status, actor?.id, reason);
  }

  const kycPayload = buildRiderRealtimePayload(rider, { includeInternal: true });

  emitToHub(resolveIdValue(rider.hub_id), 'rider:kyc-updated', kycPayload);
  emitToAdmin('rider:kyc-updated', kycPayload);
  emitToUser(resolveIdValue(rider.user_id), 'rider:kyc-updated', buildRiderRealtimePayload(rider));

  return rider;
};

const updateRiderOperationalState = async ({
  rider,
  isActive,
  reason,
  actor,
  restrictionType,
  durationHours,
  durationDays,
}) => {
  const activating = Boolean(isActive);
  const deviceFrozen = rider.device_binding?.status === 'frozen'
    || String(rider.suspension_reason || '').startsWith(DEVICE_FREEZE_REASON_PREFIX);

  if (activating && deviceFrozen) {
    throw new AppError('Rider is frozen by device security. Use the device unbind workflow with a reason note before reinstating dispatch access.', 423);
  }

  const now = new Date();

  if (!activating) {
    if (rider.is_active === false) {
      const restriction = getRiderRestrictionSnapshot(rider, now);
      throw new AppError(`${restriction.label} is already active. Reinstate the rider before applying a new restriction.`, 409);
    }

    const normalizedType = normalizeRestrictionType(restrictionType);

    if (!normalizedType) {
      throw new AppError('A valid restriction_type is required when restricting a rider', 400);
    }

    if (normalizedType === 'soft_block') {
      const normalizedDurationHours = Number(durationHours);
      if (
        !Number.isInteger(normalizedDurationHours)
        || normalizedDurationHours < RIDER_SOFT_BLOCK_MIN_HOURS
        || normalizedDurationHours > RIDER_SOFT_BLOCK_MAX_HOURS
      ) {
        throw new AppError(`Soft block duration must be a whole number between ${RIDER_SOFT_BLOCK_MIN_HOURS} and ${RIDER_SOFT_BLOCK_MAX_HOURS} hours`, 400);
      }
    }

    if (normalizedType === 'hard_block') {
      const normalizedDurationDays = Number(durationDays);
      if (
        !Number.isInteger(normalizedDurationDays)
        || normalizedDurationDays < RIDER_HARD_BLOCK_MIN_DAYS
        || normalizedDurationDays > RIDER_HARD_BLOCK_MAX_DAYS
      ) {
        throw new AppError(`Hard block duration must be a whole number between ${RIDER_HARD_BLOCK_MIN_DAYS} and ${RIDER_HARD_BLOCK_MAX_DAYS} days`, 400);
      }
    }

    const schedule = buildRestrictionSchedule({
      type: normalizedType,
      durationHours,
      durationDays,
      now,
    });
    const normalizedReason = reason || `${getRestrictionLabel(normalizedType)} issued by admin`;
    const reinstatementState = normalizedType === 'permanent_suspension'
      ? 'permanent_review_required'
      : 'restricted';

    rider.is_active = false;
    rider.current_status = 'offline';
    rider.suspension_reason = normalizedReason;
    rider.restriction_type = normalizedType;
    rider.restriction_reason = normalizedReason;
    rider.restriction_started_at = schedule.startedAt;
    rider.restriction_expires_at = schedule.expiresAt;
    rider.restriction_reinstatement_state = reinstatementState;
    rider.restriction_lifted_at = null;
    rider.restriction_lifted_by = null;
    rider.suspended_at = now;
    rider.suspended_by = actor?.id || null;

    pushRestrictionHistory({
      rider,
      action: 'restricted',
      type: normalizedType,
      reason: normalizedReason,
      startedAt: schedule.startedAt,
      expiresAt: schedule.expiresAt,
      reinstatementState,
      actor,
    });
  } else {
    if (rider.is_active !== false) {
      throw new AppError('Rider is already active. No reinstatement is required.', 409);
    }

    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reinstatement reason is required', 400);
    }

    const restriction = getRiderRestrictionSnapshot(rider, now);

    if (restriction.active && isTemporaryRestriction(restriction.type) && restriction.remaining_ms > 0) {
      throw new AppError(`${getRestrictionLabel(restriction.type)} cannot be reinstated until the countdown ends (${restriction.remaining_label} remaining)`, 423);
    }

    const previousType = normalizeRestrictionType(rider.restriction_type) || 'none';
    const previousReason = rider.restriction_reason || rider.suspension_reason || reason || null;
    const previousStartedAt = rider.restriction_started_at || rider.suspended_at || null;
    const previousExpiresAt = rider.restriction_expires_at || null;

    rider.is_active = true;
    rider.suspension_reason = null;
    rider.restriction_type = 'none';
    rider.restriction_reason = null;
    rider.restriction_started_at = null;
    rider.restriction_expires_at = null;
    rider.restriction_reinstatement_state = 'reinstated';
    rider.restriction_lifted_at = now;
    rider.restriction_lifted_by = actor?.id || null;
    rider.reinstated_at = now;
    rider.reinstated_by = actor?.id || null;

    pushRestrictionHistory({
      rider,
      action: 'reinstated',
      type: previousType,
      reason: reason || previousReason || 'Rider reinstated after admin review',
      startedAt: previousStartedAt,
      expiresAt: previousExpiresAt,
      liftedAt: now,
      reinstatementState: 'reinstated',
      actor,
    });
  }

  const user = await User.findById(resolveIdValue(rider.user_id));
  if (user) {
    // Operational restrictions block dispatch through Rider.is_active while still
    // allowing the rider to log in and see the reason/countdown in the app.
    user.is_active = true;
    await user.save({ validateBeforeSave: false });
  }

  await rider.save({ validateBeforeSave: false });

  const payload = buildRiderRealtimePayload(rider, { includeInternal: true });

  emitToHub(resolveIdValue(rider.hub_id), 'rider:operational-state-updated', payload);
  emitToUser(resolveIdValue(rider.user_id), 'rider:operational-state-updated', payload);
  emitToAdmin('rider:operational-state-updated', payload);

  return rider;
};

const appendBondHistory = ({ rider, action, amount, previousStatus, nextStatus, reference, note, actor }) => {
  rider.bond_history = Array.isArray(rider.bond_history) ? rider.bond_history : [];
  rider.bond_history.push({
    action,
    amount: Number(amount || 0),
    previous_status: previousStatus || null,
    next_status: nextStatus || null,
    reference: reference || null,
    note: note || null,
    actor_id: actor?.id || null,
    actor_role: actor?.role || 'system',
    created_at: new Date(),
  });

  if (rider.bond_history.length > 50) {
    rider.bond_history = rider.bond_history.slice(-50);
  }
};

const updateRiderBond = async ({ rider, action, amount, reference, note, actor }) => {
  const previousStatus = rider.bond_status || 'pending';
  const targetAmount = Number(rider.bond_target_amount || RIDER_SECURITY_BOND_AMOUNT);
  const currentAmount = Number(rider.bond_amount || 0);
  const nextAmount = amount !== undefined && amount !== null ? Number(amount) : currentAmount;
  const cleanedReference = reference ? String(reference).trim() : rider.bond_reference || null;
  const cleanedNote = note ? String(note).trim() : null;
  const approvedBondStatuses = ['approved', 'deposited'];

  if (!['register', 'approve', 'reject'].includes(action)) {
    throw new AppError('Unsupported rider bond action', 400);
  }

  if (action === 'register' && (!Number.isFinite(nextAmount) || nextAmount <= 0)) {
    throw new AppError('Security bond amount must be greater than 0', 400);
  }

  if (action === 'register' && approvedBondStatuses.includes(previousStatus)) {
    throw new AppError('This rider security bond is already approved', 409);
  }

  if (action === 'approve' && approvedBondStatuses.includes(previousStatus)) {
    throw new AppError('This rider security bond is already approved', 409);
  }

  if (action === 'approve' && previousStatus !== 'registered') {
    throw new AppError('Register the rider security bond before approval', 400);
  }

  if (action === 'approve' && nextAmount < targetAmount) {
    throw new AppError(`Security bond must be at least ${targetAmount.toLocaleString()} UGX before approval`, 400);
  }

  if (action === 'reject' && previousStatus !== 'registered') {
    throw new AppError('Only registered rider security bonds can be rejected', 400);
  }

  if (action === 'reject' && (!cleanedNote || cleanedNote.length < 3)) {
    throw new AppError('A rejection reason is required before rejecting rider bond verification', 400);
  }

  const now = new Date();
  rider.bond_target_amount = targetAmount;
  rider.bond_amount = nextAmount;

  if (action === 'register') {
    rider.bond_status = 'registered';
    rider.bond_reference = cleanedReference;
    rider.bond_rejection_reason = null;
    rider.bond_rejected_at = null;
    rider.bond_rejected_by = null;
  }

  if (action === 'approve') {
    rider.bond_status = 'approved';
    rider.bond_reference = cleanedReference;
    rider.bond_verified_at = now;
    rider.bond_verified_by = actor?.id || null;
    rider.bond_rejection_reason = null;
    rider.bond_rejected_at = null;
    rider.bond_rejected_by = null;
  }

  if (action === 'reject') {
    rider.bond_status = 'rejected';
    rider.bond_rejection_reason = cleanedNote;
    rider.bond_rejected_at = now;
    rider.bond_rejected_by = actor?.id || null;
  }

  appendBondHistory({
    rider,
    action: action === 'register' ? 'registered' : action === 'approve' ? 'approved' : 'rejected',
    amount: rider.bond_amount,
    previousStatus,
    nextStatus: rider.bond_status,
    reference: rider.bond_reference,
    note: cleanedNote,
    actor,
  });

  await rider.save({ validateBeforeSave: false });

  const payload = buildRiderRealtimePayload(rider, { includeInternal: true });
  emitToHub(resolveIdValue(rider.hub_id), 'rider:bond-updated', payload);
  emitToUser(resolveIdValue(rider.user_id), 'rider:bond-updated', payload);
  emitToAdmin('rider:bond-updated', payload);

  return rider;
};

const registerBondPayment = async ({ rider, amount, actor }) => updateRiderBond({
  rider,
  action: 'register',
  amount,
  actor,
  note: 'Rider submitted security bond for admin verification',
});

const updateRiderPerformance = async ({ rider }) => {
  await refreshRiderDispatchPerformance({ riderUserId: rider.user_id, hubId: rider.hub_id });
  return Rider.findById(rider._id)
    .populate('user_id', 'full_name email phone role hub_id is_active kyc_status account_locked failed_login_attempts locked_at locked_reason unlocked_at')
    .populate('hub_id', 'name code city coordinates');
};

const addFine = async ({ rider, amount, reason, actor }) => {
  const context = buildAuthContext(actor);

  rider.fines.push({
    amount,
    reason,
    status: 'pending',
    issued_by: context.id ? new mongoose.Types.ObjectId(context.id) : null,
    issued_at: new Date(),
  });

  await rider.save();

  emitToUser(resolveIdValue(rider.user_id), 'rider:fine-added', {
    amount,
    reason,
    total_fines: rider.fines.length,
  });

  return rider;
};

const payFine = async ({ rider, fineId }) => {
  const fine = rider.fines.id(fineId);
  if (!fine) {
    throw new AppError('Fine not found', 404);
  }

  if (fine.status !== 'pending') {
    throw new AppError('Fine is not pending', 400);
  }

  if (fine.amount > Number(rider.pending_payout || 0)) {
    throw new AppError('Pending payout is not enough to pay this fine', 400);
  }

  fine.status = 'paid';
  fine.paid_at = new Date();
  rider.pending_payout -= fine.amount;
  await rider.save();

  return rider;
};

const reportIncident = async ({ rider, type, description, location }) => {
  rider.incidents.push({
    type,
    description,
    location,
    reported_by: resolveIdValue(rider.user_id),
    status: 'open',
    priority: ['accident', 'theft', 'medical'].includes(type) ? 'high' : 'normal',
    reported_at: new Date(),
    status_history: [{
      status: 'open',
      note: 'Incident reported by rider',
      actor_id: resolveIdValue(rider.user_id),
      actor_role: 'rider',
      updated_at: new Date(),
    }],
  });

  await rider.save();

  try {
    await refreshRiderDispatchPerformance({ riderUserId: rider.user_id, hubId: rider.hub_id });
  } catch (error) {
    console.warn(`Rider dispatch performance refresh failed after incident report: ${error.message}`);
  }

  emitToHub(resolveIdValue(rider.hub_id), 'rider:incident-reported', {
    rider_id: rider._id,
    type,
    description,
  });

  return rider;
};

const findIncidentByIdOrIndex = (rider, incidentId) => {
  const incidents = rider.incidents || [];
  const stringId = String(incidentId || '');

  if (mongoose.Types.ObjectId.isValid(stringId)) {
    const directMatch = incidents.id ? incidents.id(stringId) : null;
    if (directMatch) {
      return directMatch;
    }
  }

  const idMatch = incidents.find((incident) => String(incident._id || '') === stringId);
  if (idMatch) {
    return idMatch;
  }

  if (/^\d+$/.test(stringId)) {
    return incidents[Number(stringId)] || null;
  }

  return null;
};

const resolveIncident = async ({ rider, incidentId, resolution, status = 'resolved', actor }) => {
  const allowedStatuses = ['investigating', 'escalated', 'resolved', 'closed'];
  if (!allowedStatuses.includes(status)) {
    throw new AppError('Incident status is invalid', 400);
  }

  const incident = findIncidentByIdOrIndex(rider, incidentId);
  if (!incident) {
    throw new AppError('Incident not found', 404);
  }

  if (['resolved', 'closed'].includes(incident.status) && status !== 'closed') {
    throw new AppError('Resolved or closed incidents cannot be escalated again', 400);
  }

  incident.status = status;
  incident.resolution = resolution;
  if (status === 'escalated') {
    incident.priority = incident.priority === 'critical' ? 'critical' : 'high';
    incident.escalated_at = new Date();
    incident.escalated_by = actor?.id || null;
  }
  if (status === 'resolved' || status === 'closed') {
    incident.resolved_at = new Date();
  }
  incident.status_history = Array.isArray(incident.status_history) ? incident.status_history : [];
  incident.status_history.push({
    status,
    note: resolution,
    actor_id: actor?.id || null,
    actor_role: actor?.role || 'system',
    updated_at: new Date(),
  });
  if (incident.status_history.length > 20) {
    incident.status_history = incident.status_history.slice(-20);
  }
  await rider.save();

  try {
    await refreshRiderDispatchPerformance({ riderUserId: rider.user_id, hubId: rider.hub_id });
  } catch (error) {
    console.warn(`Rider dispatch performance refresh failed after incident resolution: ${error.message}`);
  }

  const payload = {
    rider_id: resolveIdValue(rider._id),
    incident_id: incident._id ? String(incident._id) : String(incidentId),
    status,
    priority: incident.priority,
    resolution,
  };
  emitToUser(resolveIdValue(rider.user_id), 'rider:incident-status-updated', payload);
  emitToHub(resolveIdValue(rider.hub_id), 'rider:incident-status-updated', payload);
  emitToAdmin('rider:incident-status-updated', payload);

  return rider;
};

const getDailyEarnings = async ({ rider, date }) => {
  const targetDate = date || new Date();
  targetDate.setHours(0, 0, 0, 0);

  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const dayStats = await Order.aggregate([
    {
      $match: {
        rider_id: rider.user_id,
        createdAt: { $gte: targetDate, $lt: nextDate },
      },
    },
    {
      $group: {
        _id: null,
        deliveries: { $sum: 1 },
        successful: {
          $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$order_status', 'failed'] }, 1, 0] },
        },
        returned: {
          $sum: { $cond: [{ $eq: ['$order_status', 'returned'] }, 1, 0] },
        },
        delivery_fees: {
          $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, '$delivery_fee', 0] },
        },
        cod_collected: {
          $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, '$cod_amount', 0] },
        },
      },
    },
  ]);

  const stats = dayStats[0] || { deliveries: 0, successful: 0, failed: 0, returned: 0 };
  const grossFees = Number(stats.delivery_fees || 0);
  const riderPayout = grossFees > 0
    ? Math.round(grossFees * RIDER_PAYOUT_RATE)
    : stats.successful * RIDER_FLAT_DELIVERY_PAYOUT;

  const dayEarnings = {
    date: targetDate,
    deliveries: stats.deliveries,
    successful_deliveries: stats.successful,
    failed_deliveries: stats.failed,
    returned_orders: stats.returned,
    total_distance: 0,
    gross_earnings: grossFees,
    earnings: riderPayout,
    cod_collected: stats.cod_collected || 0,
    fines: 0,
    bonus: 0,
    platform_share: Math.max(0, grossFees - riderPayout),
    net_earnings: riderPayout,
  };

  return dayEarnings;
};

const getEarningsSummary = async ({ rider, from, to }) => {
  const startDate = from ? new Date(from) : new Date();
  startDate.setDate(startDate.getDate() - 30);

  const endDate = to ? new Date(to) : new Date();
  endDate.setHours(23, 59, 59, 999);

  const periodStats = await Order.aggregate([
    {
      $match: {
        rider_id: rider.user_id,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        total_deliveries: { $sum: 1 },
        successful: {
          $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$order_status', 'failed'] }, 1, 0] },
        },
        returned: {
          $sum: { $cond: [{ $eq: ['$order_status', 'returned'] }, 1, 0] },
        },
        delivery_fees: {
          $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, '$delivery_fee', 0] },
        },
        cod_collected: {
          $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, '$cod_amount', 0] },
        },
      },
    },
  ]);

  const stats = periodStats[0] || { total_deliveries: 0, successful: 0, failed: 0, returned: 0 };

  const totalFines = rider.fines
    .filter((f) => f.status === 'pending')
    .reduce((sum, f) => sum + f.amount, 0);
  const grossFees = Number(stats.delivery_fees || 0);
  const riderPayout = grossFees > 0
    ? Math.round(grossFees * RIDER_PAYOUT_RATE)
    : stats.successful * RIDER_FLAT_DELIVERY_PAYOUT;

  return {
    period: {
      from: startDate,
      to: endDate,
    },
    deliveries: stats.total_deliveries,
    successful_deliveries: stats.successful,
    failed_deliveries: stats.failed,
    returned_orders: stats.returned,
    gross_earnings: grossFees,
    cod_collected: stats.cod_collected || 0,
    total_fines: totalFines,
    rider_payout_share: riderPayout,
    platform_share: Math.max(0, grossFees - riderPayout),
    net_earnings: riderPayout - totalFines,
    pending_payout: rider.pending_payout,
    total_earnings: rider.earnings,
    cod_operation_limit: RIDER_COD_OPERATION_LIMIT,
  };
};

const updateRiderFromOrder = async ({ rider, order, status }) => {
  if (status === 'delivered') {
    const riderPayout = Number(order.delivery_fee || 0) > 0
      ? Math.round(Number(order.delivery_fee || 0) * RIDER_PAYOUT_RATE)
      : RIDER_FLAT_DELIVERY_PAYOUT;
    rider.total_deliveries += 1;
    rider.successful_deliveries += 1;
    rider.earnings += riderPayout;
    rider.pending_payout += riderPayout;
    rider.current_cod += order.cod_amount || 0;
    rider.last_delivery_at = new Date();
  } else if (status === 'failed') {
    rider.failed_deliveries += 1;
  } else if (status === 'returned') {
    rider.returned_orders += 1;
  }

  await rider.save();

  return rider;
};

const findNearbyRiders = async ({ hubId, latitude, longitude, radiusKm = 5 }) => {
  return Rider.find({
    hub_id: hubId,
    current_status: 'available',
    is_active: true,
    kyc_status: 'verified',
    all_documents_verified: true,
    stage_chairman_phone: { $nin: [null, ''] },
    $or: [
      { current_cod: { $exists: false } },
      { current_cod: { $lt: RIDER_COD_OPERATION_LIMIT } },
    ],
    gps_location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        $maxDistance: radiusKm * 1000,
      },
    },
  }).limit(10);
};

module.exports = {
  RIDER_STATUSES,
  buildAuthContext,
  normalizePagination,
  ensureUserAndHub,
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
  payFine,
  reportIncident,
  resolveIncident,
  getDailyEarnings,
  getEarningsSummary,
  updateRiderFromOrder,
  findNearbyRiders,
};
