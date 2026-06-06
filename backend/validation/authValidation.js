const mongoose = require('mongoose');

const allowedRoles = [
  'super_admin',
  'director',
  'general_manager',
  'coo',
  'regional_manager',
  'hub_manager',
  'ops_coordinator',
  'rider',
  'merchant',
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedOtpPurposes = ['login', 'register'];

const buildResult = (value, errors) => ({ value, errors });

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const hasValidPhoneDigits = (value) => String(value || '').replace(/[^0-9]/g, '').length >= 9;

const validateRegister = (req) => {
  const errors = [];
  const value = {
    full_name: String(req.body.full_name || '').trim(),
    email: String(req.body.email || '').trim().toLowerCase(),
    phone: String(req.body.phone || '').trim(),
    password: String(req.body.password || ''),
    role: String(req.body.role || 'merchant').trim(),
    hub_id: req.body.hub_id || null,
    assigned_hub_ids: Array.isArray(req.body.assigned_hub_ids) ? req.body.assigned_hub_ids : [],
    profile_image: req.body.profile_image ? String(req.body.profile_image).trim() : null,
  };

  if (value.full_name.length < 2) errors.push('full_name is required');
  if (!emailPattern.test(value.email)) errors.push('email is invalid');
  if (value.phone && !hasValidPhoneDigits(value.phone)) errors.push('phone is invalid');
  if (value.password.length < 8) errors.push('password must be at least 8 characters');
  if (!allowedRoles.includes(value.role)) errors.push('role is invalid');
  if (value.hub_id && !isObjectId(value.hub_id)) errors.push('hub_id must be a valid ObjectId');
  if (value.assigned_hub_ids.some((hubId) => !isObjectId(hubId))) {
    errors.push('assigned_hub_ids must contain valid ObjectIds');
  }

  return buildResult(value, errors);
};

const validateLogin = (req) => {
  const errors = [];
  const value = {
    email: String(req.body.email || '').trim().toLowerCase(),
    phone: String(req.body.phone || '').trim(),
    password: String(req.body.password || ''),
  };

  const isPhone = /^[0-9+]*$/.test(value.phone) && hasValidPhoneDigits(value.phone);
  const hasEmail = emailPattern.test(value.email);

  if (!hasEmail && !isPhone) errors.push('email or phone is required');
  if (!value.password) errors.push('password is required');

  return buildResult(value, errors);
};

const validateSendOtp = (req) => {
  const errors = [];
  const value = {
    phone: String(req.body.phone || '').trim(),
    purpose: String(req.body.purpose || 'login').trim(),
  };

  const isPhone = /^[0-9+]*$/.test(value.phone) && hasValidPhoneDigits(value.phone);
  if (!isPhone) errors.push('phone is invalid');
  if (!allowedOtpPurposes.includes(value.purpose)) errors.push('purpose is invalid');

  return buildResult(value, errors);
};

const validateVerifyOtp = (req) => {
  const errors = [];
  const value = {
    phone: String(req.body.phone || '').trim(),
    otp: String(req.body.otp || '').trim(),
    purpose: String(req.body.purpose || 'login').trim(),
  };

  const isPhone = /^[0-9+]*$/.test(value.phone) && hasValidPhoneDigits(value.phone);
  if (!isPhone) errors.push('phone is invalid');
  if (!/^[0-9]{4}$/.test(value.otp)) errors.push('otp must be a 4-digit code');
  if (!allowedOtpPurposes.includes(value.purpose)) errors.push('purpose is invalid');

  return buildResult(value, errors);
};

const validateForgotPassword = (req) => {
  const errors = [];
  const value = {
    email: String(req.body.email || '').trim().toLowerCase(),
  };

  if (!emailPattern.test(value.email)) errors.push('email is invalid');

  return buildResult(value, errors);
};

const validateResetPassword = (req) => {
  const errors = [];
  const value = {
    password: String(req.body.password || ''),
    confirm_password: String(req.body.confirm_password || ''),
  };

  if (value.password.length < 8) errors.push('password must be at least 8 characters');
  if (value.password !== value.confirm_password) errors.push('confirm_password must match password');

  return buildResult(value, errors);
};

const validateChangePassword = (req) => {
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
  validateRegister,
  validateLogin,
  validateSendOtp,
  validateVerifyOtp,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
};
