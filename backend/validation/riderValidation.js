const phonePattern = /^[0-9+\-()\s]{7,20}$/;

const { RIDER_DOCUMENT_TYPES, RIDER_REQUIRED_DOCUMENT_TYPES, RIDER_VEHICLE_TYPES } = require('../constants/riderConstants');
const {
  normalizeAcceptedPolicyKeys,
  validatePolicyAcceptanceSelection,
} = require('../constants/policyConstants');
const {
  RIDER_RESTRICTION_TYPES,
  RIDER_SOFT_BLOCK_MIN_HOURS,
  RIDER_SOFT_BLOCK_MAX_HOURS,
  RIDER_HARD_BLOCK_MIN_DAYS,
  RIDER_HARD_BLOCK_MAX_DAYS,
} = require('../constants/riderRestrictionConstants');
const {
  SETTLEMENT_METHODS,
  SETTLEMENT_STATUSES,
  SETTLEMENT_TYPES,
} = require('../constants/settlementConstants');

const buildResult = (value, errors) => ({ value, errors });
const hasValidPhoneDigits = (value) => String(value || '').replace(/[^0-9]/g, '').length >= 9;
const allowedKycStatuses = ['not_submitted', 'pending', 'verified', 'rejected'];
const allowedBondActions = ['register', 'approve', 'reject'];
const objectIdPattern = /^[a-f\d]{24}$/i;

const validateRegisterRider = (req) => {
  const errors = [];
  const value = {
    full_name: req.body.full_name ? String(req.body.full_name).trim() : null,
    phone: req.body.phone ? String(req.body.phone).trim() : null,
    years_experience: req.body.years_experience !== undefined ? Number(req.body.years_experience) : null,
    district: req.body.district ? String(req.body.district).trim() : null,
    division: req.body.division ? String(req.body.division).trim() : null,
    boda_stage: req.body.boda_stage ? String(req.body.boda_stage).trim() : null,
    stage_chairman_phone: req.body.stage_chairman_phone ? String(req.body.stage_chairman_phone).trim() : null,
    vehicle_type: req.body.vehicle_type ? String(req.body.vehicle_type).trim().toLowerCase() : null,
    hub_id: req.body.hub_id ? String(req.body.hub_id).trim() : null,
    bike_plate: req.body.bike_plate ? String(req.body.bike_plate).trim().toUpperCase() : null,
    nin_number: req.body.nin_number ? String(req.body.nin_number).trim().toUpperCase() : null,
    otp_verification_token: req.body.otp_verification_token ? String(req.body.otp_verification_token).trim() : null,
    next_of_kin: req.body.next_of_kin
      ? {
          name: String(req.body.next_of_kin.name || '').trim(),
          phone: String(req.body.next_of_kin.phone || '').trim(),
          relationship: String(req.body.next_of_kin.relationship || '').trim(),
        }
      : null,
    accepted_policy_keys: normalizeAcceptedPolicyKeys(req.body.accepted_policy_keys || req.body.policy_acceptances),
  };

  if (!value.full_name || value.full_name.length < 2) errors.push('full_name is required');
  if (!phonePattern.test(value.phone || '') || !hasValidPhoneDigits(value.phone)) errors.push('phone is invalid');
  if (value.years_experience === null || Number.isNaN(value.years_experience) || value.years_experience < 0 || value.years_experience > 60) errors.push('years_experience must be between 0 and 60');
  if (!value.district || value.district.length < 2) errors.push('district is required');
  if (!value.division || value.division.length < 2) errors.push('division is required');
  if (!value.boda_stage || value.boda_stage.length < 2) errors.push('boda_stage is required');
  if (!value.stage_chairman_phone || !hasValidPhoneDigits(value.stage_chairman_phone)) errors.push('stage_chairman_phone is required');
  if (!value.vehicle_type) errors.push('vehicle_type is required');
  if (value.vehicle_type && !RIDER_VEHICLE_TYPES.includes(value.vehicle_type)) errors.push('vehicle_type must be one of moto, voiture, velo');
  if (!value.bike_plate || value.bike_plate.length < 2) errors.push('bike_plate is required');
  if (!value.nin_number || value.nin_number.length < 5) errors.push('nin_number is required');
  if (!value.next_of_kin) errors.push('next_of_kin is required');
  if (value.next_of_kin) {
    if (!value.next_of_kin.name || value.next_of_kin.name.length < 2) errors.push('next_of_kin.name is required');
    if (!phonePattern.test(value.next_of_kin.phone || '') || !hasValidPhoneDigits(value.next_of_kin.phone)) errors.push('next_of_kin.phone is invalid');
    if (!value.next_of_kin.relationship || value.next_of_kin.relationship.length < 2) errors.push('next_of_kin.relationship is required');
  }
  errors.push(...validatePolicyAcceptanceSelection('rider', value.accepted_policy_keys, { requireAll: !req.user }));

  return buildResult(value, errors);
};

const validateRiderQuery = (req) => {
  const value = {
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search ? String(req.query.search).trim() : undefined,
    hub_id: req.query.hub_id ? String(req.query.hub_id).trim() : undefined,
    current_status: req.query.current_status ? String(req.query.current_status).trim() : undefined,
    is_active: req.query.is_active ? String(req.query.is_active).trim() : undefined,
  };

  return buildResult(value, []);
};

const validateUpdateStatus = (req) => {
  const errors = [];
  const allowedStatuses = ['available', 'on_delivery', 'break', 'offline'];
  const value = {
    current_status: String(req.body.current_status || '').trim(),
  };

  if (!allowedStatuses.includes(value.current_status)) errors.push('current_status is invalid');

  return buildResult(value, errors);
};

const validateVehicleTypeUpdate = (req) => {
  const errors = [];
  const value = {
    vehicle_type: req.body.vehicle_type ? String(req.body.vehicle_type).trim().toLowerCase() : null,
  };

  if (!value.vehicle_type) errors.push('vehicle_type is required');
  if (value.vehicle_type && !RIDER_VEHICLE_TYPES.includes(value.vehicle_type)) errors.push('vehicle_type must be one of moto, voiture, velo');

  return buildResult(value, errors);
};

const validateRiderKycUpdate = (req) => {
  const errors = [];
  const value = {
    kyc_status: String(req.body.kyc_status || '').trim(),
    reason: req.body.reason ? String(req.body.reason).trim() : null,
    admin_verification_notes: req.body.admin_verification_notes ? String(req.body.admin_verification_notes).trim() : null,
  };

  if (!allowedKycStatuses.includes(value.kyc_status)) errors.push('kyc_status is invalid');
  if (value.kyc_status === 'rejected' && (!value.reason || value.reason.length < 3)) errors.push('reason is required when rejecting KYC');
  if (['verified', 'rejected'].includes(value.kyc_status) && (!value.admin_verification_notes || value.admin_verification_notes.length < 3)) errors.push('admin_verification_notes is required');

  return buildResult(value, errors);
};

const validateOperationalStateUpdate = (req) => {
  const errors = [];
  const rawRestrictionType = req.body.restriction_type ? String(req.body.restriction_type).trim() : null;
  const durationHours = req.body.duration_hours === undefined || req.body.duration_hours === ''
    ? null
    : Number(req.body.duration_hours);
  const durationDays = req.body.duration_days === undefined || req.body.duration_days === ''
    ? null
    : Number(req.body.duration_days);
  const value = {
    is_active: req.body.is_active === true || req.body.is_active === 'true',
    reason: req.body.reason ? String(req.body.reason).trim() : null,
    restriction_type: rawRestrictionType,
    duration_hours: durationHours,
    duration_days: durationDays,
  };

  if (req.body.is_active === undefined) errors.push('is_active is required');

  if (value.reason && value.reason.length > 300) errors.push('reason must be 300 characters or less');

  if (value.is_active === false) {
    if (!value.reason || value.reason.length < 3) errors.push('reason is required when restricting a rider');
    if (!RIDER_RESTRICTION_TYPES.includes(value.restriction_type)) {
      errors.push('restriction_type must be one of soft_block, hard_block, permanent_suspension');
    }

    if (value.restriction_type === 'soft_block') {
      if (!Number.isFinite(value.duration_hours)) {
        errors.push('duration_hours is required for a soft block');
      } else if (
        !Number.isInteger(value.duration_hours)
        || value.duration_hours < RIDER_SOFT_BLOCK_MIN_HOURS
        || value.duration_hours > RIDER_SOFT_BLOCK_MAX_HOURS
      ) {
        errors.push(`soft block duration must be a whole number between ${RIDER_SOFT_BLOCK_MIN_HOURS} and ${RIDER_SOFT_BLOCK_MAX_HOURS} hours`);
      }
    }

    if (value.restriction_type === 'hard_block') {
      if (!Number.isFinite(value.duration_days)) {
        errors.push('duration_days is required for a hard block');
      } else if (
        !Number.isInteger(value.duration_days)
        || value.duration_days < RIDER_HARD_BLOCK_MIN_DAYS
        || value.duration_days > RIDER_HARD_BLOCK_MAX_DAYS
      ) {
        errors.push(`hard block duration must be a whole number between ${RIDER_HARD_BLOCK_MIN_DAYS} and ${RIDER_HARD_BLOCK_MAX_DAYS} days`);
      }
    }

    if (value.restriction_type === 'permanent_suspension') {
      value.duration_hours = null;
      value.duration_days = null;
    }
  } else if (!value.reason || value.reason.length < 3) {
    errors.push('reason is required when reinstating a rider');
  }

  return buildResult(value, errors);
};

const validateDeviceUnbind = (req) => {
  const errors = [];
  const value = {
    reason: req.body.reason ? String(req.body.reason).trim() : null,
  };

  if (!value.reason || value.reason.length < 3) errors.push('reason is required for device unbinding');

  return buildResult(value, errors);
};

const validateOperationalProfileUpdate = (req) => {
  const errors = [];
  const hasField = (key) => Object.prototype.hasOwnProperty.call(req.body, key);
  const value = {};

  if (hasField('full_name')) {
    value.full_name = String(req.body.full_name || '').trim();
    if (value.full_name.length < 2) errors.push('full_name must be at least 2 characters');
  }

  if (hasField('phone')) {
    value.phone = String(req.body.phone || '').trim();
    if (!phonePattern.test(value.phone) || !hasValidPhoneDigits(value.phone)) errors.push('phone is invalid');
  }

  if (hasField('years_experience')) {
    value.years_experience = Number(req.body.years_experience);
    if (Number.isNaN(value.years_experience) || value.years_experience < 0 || value.years_experience > 60) errors.push('years_experience must be between 0 and 60');
  }

  if (hasField('district')) {
    value.district = String(req.body.district || '').trim();
    if (value.district.length < 2) errors.push('district must be at least 2 characters');
  }

  if (hasField('division')) {
    value.division = String(req.body.division || '').trim();
    if (value.division.length < 2) errors.push('division must be at least 2 characters');
  }

  if (hasField('boda_stage')) {
    value.boda_stage = String(req.body.boda_stage || '').trim();
    if (value.boda_stage.length < 2) errors.push('boda_stage must be at least 2 characters');
  }

  if (hasField('stage_chairman_phone')) {
    value.stage_chairman_phone = String(req.body.stage_chairman_phone || '').trim();
    if (!hasValidPhoneDigits(value.stage_chairman_phone)) errors.push('stage_chairman_phone is invalid');
  }

  if (hasField('bike_plate')) {
    value.bike_plate = String(req.body.bike_plate || '').trim().toUpperCase();
    if (value.bike_plate.length < 2) errors.push('bike_plate must be at least 2 characters');
  }

  if (hasField('nin_number')) {
    value.nin_number = String(req.body.nin_number || '').trim().toUpperCase();
    if (value.nin_number.length < 5) errors.push('nin_number must be at least 5 characters');
  }

  if (hasField('hub_id')) {
    value.hub_id = req.body.hub_id ? String(req.body.hub_id).trim() : null;
    if (!value.hub_id) errors.push('hub_id is required when updating hub assignment');
  }

  if (hasField('current_cod')) {
    value.current_cod = Number(req.body.current_cod);
    if (!Number.isFinite(value.current_cod) || value.current_cod < 0) errors.push('current_cod must be a positive number');
  }

  if (hasField('next_of_kin')) {
    value.next_of_kin = {
      name: String(req.body.next_of_kin?.name || '').trim(),
      phone: String(req.body.next_of_kin?.phone || '').trim(),
      relationship: String(req.body.next_of_kin?.relationship || '').trim(),
    };
    if (!value.next_of_kin.name || value.next_of_kin.name.length < 2) errors.push('next_of_kin.name is required');
    if (!phonePattern.test(value.next_of_kin.phone || '') || !hasValidPhoneDigits(value.next_of_kin.phone)) errors.push('next_of_kin.phone is invalid');
    if (!value.next_of_kin.relationship || value.next_of_kin.relationship.length < 2) errors.push('next_of_kin.relationship is required');
  }

  if (Object.keys(value).length === 0) {
    errors.push('At least one operational profile field is required');
  }

  return buildResult(value, errors);
};

const validateGpsLocation = (req) => {
  const errors = [];
  const value = {
    latitude: Number(req.body.latitude),
    longitude: Number(req.body.longitude),
  };

  if (Number.isNaN(value.latitude)) errors.push('latitude is required');
  if (Number.isNaN(value.longitude)) errors.push('longitude is required');
  if (!Number.isNaN(value.latitude) && (value.latitude < -90 || value.latitude > 90)) errors.push('latitude must be between -90 and 90');
  if (!Number.isNaN(value.longitude) && (value.longitude < -180 || value.longitude > 180)) errors.push('longitude must be between -180 and 180');

  return buildResult(value, errors);
};

const validateDocumentUpload = (req) => {
  const errors = [];
  const value = {
    document_type: String(req.body.document_type || '').trim().toLowerCase(),
    url: req.body.url ? String(req.body.url).trim() : null,
    public_id: req.body.public_id ? String(req.body.public_id).trim() : null,
  };

  if (!RIDER_DOCUMENT_TYPES.includes(value.document_type)) errors.push('document_type is invalid');
  if (!value.url) errors.push('url is required');
  if (RIDER_REQUIRED_DOCUMENT_TYPES.includes(value.document_type) && !value.public_id) {
    errors.push('public_id is required for required rider KYC documents');
  }

  return buildResult(value, errors);
};

const validateVerifyDocument = (req) => {
  const errors = [];
  const value = {
    document_type: String(req.body.document_type || '').trim().toLowerCase(),
    verified: req.body.verified === true || req.body.verified === 'true',
  };

  if (!RIDER_DOCUMENT_TYPES.includes(value.document_type)) errors.push('document_type is invalid');

  return buildResult(value, errors);
};

const validateRegisterBond = (req) => {
  const errors = [];
  const value = {
    bond_amount: Number(req.body.bond_amount),
  };

  if (!Number.isFinite(value.bond_amount) || value.bond_amount <= 0) errors.push('bond_amount must be a positive number');

  return buildResult(value, errors);
};

const validateRiderBondUpdate = (req) => {
  const errors = [];
  const hasBondAmount = req.body.bond_amount !== undefined && String(req.body.bond_amount).trim() !== '';
  const value = {
    action: String(req.body.action || '').trim().toLowerCase(),
    bond_amount: hasBondAmount ? Number(req.body.bond_amount) : undefined,
    reference: req.body.reference ? String(req.body.reference).trim() : null,
    note: req.body.note ? String(req.body.note).trim() : null,
    reason: req.body.reason ? String(req.body.reason).trim() : null,
  };

  if (!allowedBondActions.includes(value.action)) {
    errors.push('action must be register, approve, or reject');
  }

  if (value.action === 'register') {
    if (!Number.isFinite(value.bond_amount) || value.bond_amount <= 0) {
      errors.push('bond_amount must be a positive number when registering a rider bond');
    }
  } else if (value.bond_amount !== undefined && (!Number.isFinite(value.bond_amount) || value.bond_amount < 0)) {
    errors.push('bond_amount must be a positive number');
  }

  if (value.reference && value.reference.length > 100) {
    errors.push('reference must be 100 characters or less');
  }

  const rejectionNote = value.note || value.reason;
  if (value.action === 'reject' && (!rejectionNote || rejectionNote.length < 3)) {
    errors.push('note or reason is required when rejecting a rider bond');
  }

  if (value.note && value.note.length > 300) errors.push('note must be 300 characters or less');
  if (value.reason && value.reason.length > 300) errors.push('reason must be 300 characters or less');

  return buildResult(value, errors);
};

const validateIssueFine = (req) => {
  const errors = [];
  const value = {
    amount: Number(req.body.amount),
    reason: String(req.body.reason || '').trim(),
  };

  if (!Number.isFinite(value.amount) || value.amount <= 0) errors.push('amount must be a positive number');
  if (value.reason.length < 3) errors.push('reason is required');

  return buildResult(value, errors);
};

const validateIncident = (req) => {
  const errors = [];
  const allowedTypes = ['accident', 'theft', 'complaint', 'lost_package', 'damage', 'medical', 'other'];
  const value = {
    type: String(req.body.type || '').trim(),
    description: String(req.body.description || '').trim(),
    location: req.body.location ? String(req.body.location).trim() : null,
  };

  if (!allowedTypes.includes(value.type)) errors.push('type is invalid');
  if (value.description.length < 5) errors.push('description is required');

  return buildResult(value, errors);
};

const validateResolveIncident = (req) => {
  const errors = [];
  const allowedStatuses = ['investigating', 'escalated', 'resolved', 'closed'];
  const value = {
    status: req.body.status ? String(req.body.status).trim() : 'resolved',
    resolution: String(req.body.resolution || '').trim(),
  };

  if (!allowedStatuses.includes(value.status)) errors.push('status is invalid');
  if (value.resolution.length < 3) errors.push('resolution is required');

  return buildResult(value, errors);
};

const validateEarningsQuery = (req) => {
  const value = {
    from: req.query.from ? String(req.query.from).trim() : undefined,
    to: req.query.to ? String(req.query.to).trim() : undefined,
    date: req.query.date ? String(req.query.date).trim() : undefined,
  };

return buildResult(value, []);
};

const validateWithdrawalRequest = (req) => {
  const errors = [];
  const value = {
    amount: Number(req.body.amount),
    method: req.body.method ? String(req.body.method).trim() : 'mobile_money',
    account_name: req.body.account_name ? String(req.body.account_name).trim() : null,
    account_phone: req.body.account_phone ? String(req.body.account_phone).trim() : null,
    note: req.body.note ? String(req.body.note).trim() : null,
  };

  if (!Number.isFinite(value.amount) || value.amount <= 0) errors.push('amount must be a positive number');
  if (!SETTLEMENT_METHODS.includes(value.method)) errors.push('method is invalid');
  if (value.account_phone && (!phonePattern.test(value.account_phone) || !hasValidPhoneDigits(value.account_phone))) {
    errors.push('account_phone is invalid');
  }
  if (value.note && value.note.length > 300) errors.push('note must be 300 characters or less');

  return buildResult(value, errors);
};

const validateSettlementQuery = (req) => {
  const errors = [];
  const value = {
    page: req.query.page,
    limit: req.query.limit,
    rider_id: req.query.rider_id ? String(req.query.rider_id).trim() : undefined,
    hub_id: req.query.hub_id ? String(req.query.hub_id).trim() : undefined,
    status: req.query.status ? String(req.query.status).trim() : undefined,
    type: req.query.type ? String(req.query.type).trim() : undefined,
  };

  if (value.rider_id && !objectIdPattern.test(value.rider_id)) errors.push('rider_id is invalid');
  if (value.hub_id && !objectIdPattern.test(value.hub_id)) errors.push('hub_id is invalid');
  if (value.status && !SETTLEMENT_STATUSES.includes(value.status)) errors.push('status is invalid');
  if (value.type && !SETTLEMENT_TYPES.includes(value.type)) errors.push('type is invalid');

  return buildResult(value, errors);
};

const validateSettlementStatusUpdate = (req) => {
  const errors = [];
  const value = {
    status: req.body.status ? String(req.body.status).trim() : null,
    admin_note: req.body.admin_note ? String(req.body.admin_note).trim() : null,
    rejection_reason: req.body.rejection_reason ? String(req.body.rejection_reason).trim() : null,
    completion_reference: req.body.completion_reference ? String(req.body.completion_reference).trim() : null,
  };

  if (!value.status || !['approved', 'rejected', 'completed', 'cancelled'].includes(value.status)) {
    errors.push('status must be approved, rejected, completed, or cancelled');
  }
  if (value.status === 'rejected' && (!value.rejection_reason || value.rejection_reason.length < 3)) {
    errors.push('rejection_reason is required when rejecting a settlement');
  }
  if (value.admin_note && value.admin_note.length > 300) errors.push('admin_note must be 300 characters or less');

  return buildResult(value, errors);
};

const validateCodSettlement = (req) => {
  const errors = [];
  const value = {
    amount: Number(req.body.amount),
    method: req.body.method ? String(req.body.method).trim() : 'cash',
    note: req.body.note ? String(req.body.note).trim() : null,
    admin_note: req.body.admin_note ? String(req.body.admin_note).trim() : null,
    completion_reference: req.body.completion_reference ? String(req.body.completion_reference).trim() : null,
  };

  if (!Number.isFinite(value.amount) || value.amount <= 0) errors.push('amount must be a positive number');
  if (!SETTLEMENT_METHODS.includes(value.method)) errors.push('method is invalid');
  if (value.note && value.note.length > 300) errors.push('note must be 300 characters or less');
  if (value.admin_note && value.admin_note.length > 300) errors.push('admin_note must be 300 characters or less');

  return buildResult(value, errors);
};

module.exports = {
  validateRegisterRider,
  validateRiderQuery,
  validateUpdateStatus,
  validateVehicleTypeUpdate,
  validateRiderKycUpdate,
  validateOperationalStateUpdate,
  validateDeviceUnbind,
  validateOperationalProfileUpdate,
  validateGpsLocation,
  validateDocumentUpload,
  validateVerifyDocument,
  validateRegisterBond,
  validateRiderBondUpdate,
  validateIssueFine,
  validateIncident,
  validateResolveIncident,
  validateEarningsQuery,
  validateWithdrawalRequest,
  validateSettlementQuery,
  validateSettlementStatusUpdate,
  validateCodSettlement,
};
