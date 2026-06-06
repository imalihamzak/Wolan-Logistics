const mongoose = require('mongoose');
const {
  normalizeAcceptedPolicyKeys,
  validatePolicyAcceptanceSelection,
} = require('../constants/policyConstants');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedTiers = ['Starter', 'Active', 'Priority', 'Elite'];
const allowedStatuses = ['pending', 'active', 'suspended'];
const allowedKycStatuses = ['unverified', 'not_submitted', 'pending', 'pending_review', 'verified', 'rejected'];
const allowedOtpPurposes = ['login', 'register'];
const allowedEscalationStatuses = ['none', 'open', 'in_progress', 'resolved', 'dismissed'];
const allowedEscalationPriorities = ['normal', 'high', 'urgent'];
const requiredMerchantKycDocumentTypes = [
  'business_registration',
  'tax_certificate',
  'owner_id',
  'shop_photo',
];

const buildResult = (value, errors) => ({ value, errors });

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const hasValidPhoneDigits = (value) => String(value || '').replace(/[^0-9]/g, '').length >= 9;
const normalizeStringArray = (value) => (
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : String(value || '')
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
);

const normalizeDocumentUploads = (value) => {
  if (!value) {
    return [];
  }

  const rawItems = Array.isArray(value) ? value : [value];
  return rawItems
    .map((item) => {
      if (typeof item === 'string') {
        try {
          return JSON.parse(item);
        } catch (error) {
          return null;
        }
      }
      return item;
    })
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      type: String(item.type || '').trim(),
      label: String(item.label || '').trim(),
      upload_id: item.upload_id ? String(item.upload_id).trim() : null,
      file_name: item.file_name ? String(item.file_name).trim() : null,
      url: item.url ? String(item.url).trim() : null,
      uploaded_at: item.uploaded_at ? new Date(item.uploaded_at) : undefined,
    }))
    .filter((item) => item.type && item.label);
};

const validateMerchantRegister = (req) => {
  const errors = [];
  const value = {
    merchant_name: String(req.body.merchant_name || '').trim(),
    shop_name: String(req.body.shop_name || '').trim(),
    building_name: String(req.body.building_name || '').trim(),
    phone: String(req.body.phone || '').trim(),
    email: String(req.body.email || '').trim().toLowerCase(),
    password: String(req.body.password || ''),
    address: String(req.body.address || '').trim(),
    referred_by: req.body.referred_by ? String(req.body.referred_by).trim() : null,
    hub_id: req.body.hub_id ? String(req.body.hub_id).trim() : null,
    tier_level: String(req.body.tier_level || 'Starter').trim(),
    status: String(req.body.status || 'active').trim(),
    kyc_status: req.body.kyc_status ? String(req.body.kyc_status).trim() : undefined,
    otp_verification_token: req.body.otp_verification_token ? String(req.body.otp_verification_token).trim() : null,
    accepted_policy_keys: normalizeAcceptedPolicyKeys(req.body.accepted_policy_keys || req.body.policy_acceptances),
  };

  if (value.merchant_name.length < 2) errors.push('merchant_name is required');
  if (value.shop_name.length < 2) errors.push('shop_name is required');
  if (value.building_name.length < 2) errors.push('building_name is required');
  if (!hasValidPhoneDigits(value.phone)) errors.push('phone is invalid');
  if (!emailPattern.test(value.email)) errors.push('email is invalid');
  if (value.password.length < 8) errors.push('password must be at least 8 characters');
  if (value.address.length < 5) errors.push('address is required');
  if (value.referred_by && !isObjectId(value.referred_by) && value.referred_by.length < 3) errors.push('referred_by must be a valid merchant id or referral code');
  if (value.hub_id && !isObjectId(value.hub_id)) errors.push('hub_id must be a valid ObjectId');
  if (!allowedStatuses.includes(value.status)) errors.push('status is invalid');
  if (!allowedTiers.includes(value.tier_level)) errors.push('tier_level is invalid');
  if (value.kyc_status && !allowedKycStatuses.includes(value.kyc_status)) errors.push('kyc_status is invalid');
  errors.push(...validatePolicyAcceptanceSelection('merchant', value.accepted_policy_keys, { requireAll: !req.user }));

  return buildResult(value, errors);
};

const validateMerchantLogin = (req) => {
  const errors = [];
  const value = {
    email: String(req.body.email || '').trim().toLowerCase(),
    password: String(req.body.password || ''),
  };

  if (!emailPattern.test(value.email)) errors.push('email is invalid');
  if (!value.password) errors.push('password is required');

  return buildResult(value, errors);
};

const validateMerchantSendOtp = (req) => {
  const errors = [];
  const value = {
    phone: String(req.body.phone || '').trim(),
    purpose: String(req.body.purpose || 'login').trim(),
  };

  if (!hasValidPhoneDigits(value.phone)) errors.push('phone is invalid');
  if (!allowedOtpPurposes.includes(value.purpose)) errors.push('purpose is invalid');

  return buildResult(value, errors);
};

const validateMerchantVerifyOtp = (req) => {
  const errors = [];
  const value = {
    phone: String(req.body.phone || '').trim(),
    otp: String(req.body.otp || '').trim(),
    purpose: String(req.body.purpose || 'login').trim(),
  };

  if (!hasValidPhoneDigits(value.phone)) errors.push('phone is invalid');
  if (!/^[0-9]{4}$/.test(value.otp)) errors.push('otp must be a 4-digit code');
  if (!allowedOtpPurposes.includes(value.purpose)) errors.push('purpose is invalid');

  return buildResult(value, errors);
};

const validateMerchantForgotPassword = (req) => {
  const errors = [];
  const value = {
    email: String(req.body.email || '').trim().toLowerCase(),
  };

  if (!emailPattern.test(value.email)) errors.push('email is invalid');

  return buildResult(value, errors);
};

const validateMerchantUpdate = (req) => {
  const errors = [];
  const value = {
    merchant_name: req.body.merchant_name ? String(req.body.merchant_name).trim() : undefined,
    shop_name: req.body.shop_name ? String(req.body.shop_name).trim() : undefined,
    building_name: req.body.building_name ? String(req.body.building_name).trim() : undefined,
    phone: req.body.phone ? String(req.body.phone).trim() : undefined,
    email: req.body.email ? String(req.body.email).trim().toLowerCase() : undefined,
    address: req.body.address ? String(req.body.address).trim() : undefined,
    hub_id: req.body.hub_id ? String(req.body.hub_id).trim() : undefined,
    status: req.body.status ? String(req.body.status).trim() : undefined,
    tier_level: req.body.tier_level ? String(req.body.tier_level).trim() : undefined,
    referral_code: req.body.referral_code ? String(req.body.referral_code).trim().toUpperCase() : undefined,
  };

  if (value.email && !emailPattern.test(value.email)) errors.push('email is invalid');
  if (value.phone && !hasValidPhoneDigits(value.phone)) errors.push('phone is invalid');
  if (value.hub_id && !isObjectId(value.hub_id)) errors.push('hub_id must be a valid ObjectId');
  if (value.status && !allowedStatuses.includes(value.status)) errors.push('status is invalid');
  if (value.tier_level && !allowedTiers.includes(value.tier_level)) errors.push('tier_level is invalid');

  return buildResult(value, errors);
};

const validateMerchantKycUpdate = (req) => {
  const errors = [];
  const value = {
    kyc_status: String(req.body.kyc_status || '').trim(),
    reason: req.body.reason ? String(req.body.reason).trim() : null,
  };

  if (!allowedKycStatuses.includes(value.kyc_status)) errors.push('kyc_status is invalid');
  if (!['verified', 'rejected'].includes(value.kyc_status)) errors.push('kyc_status can only be verified or rejected from admin review');
  if (value.kyc_status === 'rejected' && (!value.reason || value.reason.length < 3)) errors.push('reason is required when rejecting KYC');

  return buildResult(value, errors);
};

const validateMerchantKycSubmission = (req) => {
  const errors = [];
  const value = {
    legal_business_name: String(req.body.legal_business_name || '').trim(),
    business_registration_number: String(req.body.business_registration_number || '').trim(),
    tin_number: String(req.body.tin_number || '').trim(),
    owner_full_name: String(req.body.owner_full_name || '').trim(),
    owner_id_number: String(req.body.owner_id_number || '').trim(),
    owner_phone: String(req.body.owner_phone || '').trim(),
    document_links: normalizeStringArray(req.body.document_links),
    document_uploads: normalizeDocumentUploads(req.body.document_uploads),
    document_notes: req.body.document_notes ? String(req.body.document_notes).trim() : null,
  };

  if (value.legal_business_name.length < 2) errors.push('legal_business_name is required');
  if (value.business_registration_number.length < 2) errors.push('business_registration_number is required');
  if (value.tin_number.length < 2) errors.push('tin_number is required');
  if (value.owner_full_name.length < 2) errors.push('owner_full_name is required');
  if (value.owner_id_number.length < 3) errors.push('owner_id_number is required');
  if (!hasValidPhoneDigits(value.owner_phone)) errors.push('owner_phone is invalid');
  if (value.document_links.some((link) => link.length > 500)) errors.push('document_links entries must be 500 characters or fewer');
  if (value.document_uploads.some((document) => !requiredMerchantKycDocumentTypes.includes(document.type))) errors.push('document_uploads contains an invalid document type');
  const uploadedTypes = value.document_uploads.map((document) => document.type);
  const duplicateTypes = uploadedTypes.filter((type, index) => uploadedTypes.indexOf(type) !== index);
  if (duplicateTypes.length > 0) errors.push('document_uploads cannot contain duplicate document types');
  const uploadIds = value.document_uploads.map((document) => document.upload_id).filter(Boolean);
  const duplicateUploadIds = uploadIds.filter((uploadId, index) => uploadIds.indexOf(uploadId) !== index);
  if (duplicateUploadIds.length > 0) errors.push('document_uploads cannot reuse the same upload_id for multiple document types');
  if (value.document_uploads.some((document) => document.upload_id && !isObjectId(document.upload_id))) errors.push('document_uploads upload_id must be a valid ObjectId');
  if (value.document_uploads.some((document) => !document.upload_id)) errors.push('document_uploads entries require upload_id');
  const missingRequiredDocuments = requiredMerchantKycDocumentTypes.filter((type) => !uploadedTypes.includes(type));
  if (missingRequiredDocuments.length > 0) {
    errors.push(`document_uploads missing required document types: ${missingRequiredDocuments.join(', ')}`);
  }

  return buildResult(value, errors);
};

const validateMerchantQuery = (req) => {
  const value = {
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search ? String(req.query.search).trim() : undefined,
    status: req.query.status ? String(req.query.status).trim() : undefined,
    tier_level: req.query.tier_level ? String(req.query.tier_level).trim() : undefined,
    hub_id: req.query.hub_id ? String(req.query.hub_id).trim() : undefined,
  };

  return buildResult(value, []);
};

const validateMerchantEscalationUpdate = (req) => {
  const errors = [];
  const value = {
    escalation_status: String(req.body.escalation_status || '').trim(),
    escalation_priority: req.body.escalation_priority ? String(req.body.escalation_priority).trim() : undefined,
    reason: req.body.reason ? String(req.body.reason).trim() : null,
    note: req.body.note ? String(req.body.note).trim() : null,
    sla_hours: req.body.sla_hours !== undefined ? Number(req.body.sla_hours) : undefined,
  };

  if (!allowedEscalationStatuses.includes(value.escalation_status)) errors.push('escalation_status is invalid');
  if (value.escalation_priority && !allowedEscalationPriorities.includes(value.escalation_priority)) errors.push('escalation_priority is invalid');
  if (['open', 'in_progress'].includes(value.escalation_status) && !(value.reason || value.note)) {
    errors.push('reason or note is required for active escalation');
  }
  if (['resolved', 'dismissed'].includes(value.escalation_status) && !(value.note || value.reason)) {
    errors.push('note is required when closing an escalation');
  }
  if (value.sla_hours !== undefined && (Number.isNaN(value.sla_hours) || value.sla_hours < 1 || value.sla_hours > 168)) {
    errors.push('sla_hours must be between 1 and 168');
  }

  return buildResult(value, errors);
};

const validateMerchantPasswordReset = (req) => {
  const errors = [];
  const value = {
    password: String(req.body.password || ''),
    confirm_password: String(req.body.confirm_password || ''),
  };

  if (value.password.length < 8) errors.push('password must be at least 8 characters');
  if (value.password !== value.confirm_password) errors.push('confirm_password must match password');

  return buildResult(value, errors);
};

const validateMerchantChangePassword = (req) => {
  const errors = [];
  const value = {
    current_password: String(req.body.current_password || ''),
    password: String(req.body.password || ''),
    confirm_password: String(req.body.confirm_password || ''),
  };

  if (!value.current_password) errors.push('current_password is required');
  if (value.password.length < 8) errors.push('password must be at least 8 characters');
  if (value.password !== value.confirm_password) errors.push('confirm_password must match password');

  return buildResult(value, errors);
};

module.exports = {
  validateMerchantRegister,
  validateMerchantLogin,
  validateMerchantSendOtp,
  validateMerchantVerifyOtp,
  validateMerchantForgotPassword,
  validateMerchantUpdate,
  validateMerchantKycUpdate,
  validateMerchantKycSubmission,
  validateMerchantQuery,
  validateMerchantEscalationUpdate,
  validateMerchantPasswordReset,
  validateMerchantChangePassword,
};
