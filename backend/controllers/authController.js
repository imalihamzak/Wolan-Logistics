const mongoose = require('mongoose');

const User = require('../models/User');
const Hub = require('../models/Hub');
const Merchant = require('../models/Merchant');
const Rider = require('../models/Rider');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const {
  sendOtpChallenge,
  verifyOtpChallenge,
  phoneCandidates,
} = require('../services/otpService');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  generatePasswordResetToken,
} = require('../utils/token');
const {
  DEVICE_FREEZE_REASON_PREFIX,
  ensureRiderDeviceAllowed,
} = require('../services/deviceSecurityService');
const {
  assertAccountCanLogin,
  recordFailedLogin,
  clearFailedLogin,
  unlockAccount,
} = require('../utils/accountSecurity');
const { getRiderRestrictionSnapshot } = require('../utils/riderRestrictions');
const {
  ADMIN_ROLES,
  HUB_DASHBOARD_ROLES,
  HQ_DASHBOARD_ROLES,
  REGIONAL_DASHBOARD_ROLES,
} = require('../constants/roleConstants');
const { buildHubScopedMatch, canAccessAllHubs } = require('../utils/hubAccess');

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

const createAuthTokens = (user) => {
  const payload = {
    id: user._id,
    role: user.role,
    hub_id: user.hub_id,
    assigned_hub_ids: user.assigned_hub_ids || [],
    email: user.email,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return { accessToken, refreshToken };
};

const buildUserResponse = (user) => ({
  id: user._id,
  full_name: user.full_name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  hub_id: user.hub_id,
  assigned_hub_ids: user.assigned_hub_ids || [],
  profile_image: user.profile_image,
  is_active: user.is_active,
  kyc_status: user.kyc_status,
  kyc_verified_at: user.kyc_verified_at,
  kyc_rejection_reason: user.kyc_rejection_reason,
  failed_login_attempts: user.failed_login_attempts,
  account_locked: user.account_locked,
  locked_at: user.locked_at,
  locked_reason: user.locked_reason,
  unlocked_at: user.unlocked_at,
  last_login: user.last_login,
});

const shouldExposeDevOtp = () => process.env.NODE_ENV !== 'production' && process.env.EXPOSE_DEV_OTP === 'true';
const MANAGED_USER_ROLES = [...ADMIN_ROLES, 'rider'];
const isDeviceFreezeReason = (value) => String(value || '').startsWith(DEVICE_FREEZE_REASON_PREFIX);

const assertRiderDeviceNotFrozen = async (user, actionName) => {
  if (!user || user.role !== 'rider') {
    return;
  }

  const rider = await Rider.findOne({ user_id: user._id })
    .select('device_binding.status device_binding.freeze_reason suspension_reason');

  const deviceFrozen = rider?.device_binding?.status === 'frozen'
    || isDeviceFreezeReason(rider?.suspension_reason)
    || isDeviceFreezeReason(user.locked_reason);

  if (deviceFrozen) {
    throw new AppError(`${actionName} is blocked by rider device security freeze. Use the rider device unbind workflow with a reason note.`, 423);
  }
};

const getLoginVisibleRiderRestriction = async (user) => {
  if (!user || user.role !== 'rider') {
    return null;
  }

  const rider = await Rider.findOne({ user_id: user._id })
    .select('is_active suspension_reason suspended_at restriction_type restriction_reason restriction_started_at restriction_expires_at restriction_reinstatement_state');

  if (!rider) {
    return null;
  }

  const restriction = getRiderRestrictionSnapshot(rider);
  return restriction.active ? restriction : null;
};

const assertUserActiveOrRiderRestrictionVisible = async (user, label = 'Account') => {
  if (user.is_active) {
    return null;
  }

  const restriction = await getLoginVisibleRiderRestriction(user);
  if (restriction) {
    return restriction;
  }

  throw new AppError(`${label} is inactive`, 403);
};

const canAssignRole = (req, role) => {
  if (!req.user && role !== 'merchant') {
    return false;
  }

  if (!req.user) {
    return true;
  }

  if (canAccessAllHubs(req.user)) {
    return MANAGED_USER_ROLES.includes(role) || role === 'merchant';
  }

  if (HUB_DASHBOARD_ROLES.includes(req.user.role)) {
    return ['rider', 'ops_coordinator'].includes(role);
  }

  return false;
};

const register = asyncHandler(async (req, res) => {
  const { full_name, email, phone, password, role, hub_id, assigned_hub_ids, profile_image } = req.validatedBody || req.body;

  if (!canAssignRole(req, role)) {
    throw new AppError('You are not allowed to assign this role', 403);
  }

  const duplicateQuery = phone
    ? { $or: [{ email }, { phone: { $in: phoneCandidates(phone) } }] }
    : { email };
  const existingUser = await User.findOne(duplicateQuery);

  if (existingUser) {
    throw new AppError('Email or phone already exists', 409);
  }

  let effectiveHubId = hub_id || null;
  let effectiveAssignedHubIds = Array.isArray(assigned_hub_ids) ? assigned_hub_ids : [];
  if (req.user && !canAccessAllHubs(req.user)) {
    if (!req.user.hub_id) {
      throw new AppError('Hub access is required for this account', 403);
    }
    if (hub_id && String(hub_id) !== String(req.user.hub_id)) {
      throw new AppError('Forbidden', 403);
    }
    effectiveHubId = req.user.hub_id;
    effectiveAssignedHubIds = [];
  }

  if (effectiveHubId) {
    const hubExists = await Hub.exists({ _id: effectiveHubId });
    if (!hubExists) {
      throw new AppError('hub_id is invalid', 400);
    }
  }

  if (effectiveAssignedHubIds.length > 0) {
    const validHubCount = await Hub.countDocuments({ _id: { $in: effectiveAssignedHubIds } });
    if (validHubCount !== effectiveAssignedHubIds.length) {
      throw new AppError('assigned_hub_ids contains an invalid hub', 400);
    }
  }

  const user = await User.create({
    full_name,
    email,
    phone,
    password,
    role,
    hub_id: effectiveHubId,
    assigned_hub_ids: effectiveAssignedHubIds,
    profile_image,
    is_active: true,
    kyc_status: ['rider', 'merchant'].includes(role) ? 'pending' : 'verified',
    last_login: new Date(),
  });

  const { accessToken, refreshToken } = createAuthTokens(user);
  user.refresh_token_hash = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'User registered successfully', {
    accessToken,
    refreshToken,
    user: buildUserResponse(user),
  }, 201);
});

const createStaffUser = asyncHandler(async (req, res) => {
  if (!canAccessAllHubs(req.user)) {
    throw new AppError('Only HQ admins can create staff users', 403);
  }

  const {
    full_name,
    email,
    phone,
    password,
    role,
    hub_id,
    assigned_hub_ids,
    profile_image,
  } = req.validatedBody || req.body;

  if (!ADMIN_ROLES.includes(role)) {
    throw new AppError('Staff user role must be an admin, regional, or hub role', 400);
  }

  const duplicateQuery = phone
    ? { $or: [{ email }, { phone: { $in: phoneCandidates(phone) } }] }
    : { email };
  const existingUser = await User.findOne(duplicateQuery);
  if (existingUser) {
    throw new AppError('Email or phone already exists', 409);
  }

  const effectiveAssignedHubIds = Array.isArray(assigned_hub_ids) ? assigned_hub_ids : [];
  if (HUB_DASHBOARD_ROLES.includes(role) && !hub_id) {
    throw new AppError('hub_id is required for hub-level staff users', 400);
  }
  if (REGIONAL_DASHBOARD_ROLES.includes(role) && effectiveAssignedHubIds.length === 0) {
    throw new AppError('assigned_hub_ids is required for regional staff users', 400);
  }

  const hubIdsToValidate = [
    ...(hub_id ? [hub_id] : []),
    ...effectiveAssignedHubIds,
  ];
  if (hubIdsToValidate.length > 0) {
    const uniqueHubIds = [...new Set(hubIdsToValidate.map(String))];
    const validHubCount = await Hub.countDocuments({ _id: { $in: uniqueHubIds } });
    if (validHubCount !== uniqueHubIds.length) {
      throw new AppError('Hub scope contains an invalid hub', 400);
    }
  }

  const user = await User.create({
    full_name,
    email,
    phone,
    password,
    role,
    hub_id: hub_id || null,
    assigned_hub_ids: effectiveAssignedHubIds,
    profile_image,
    is_active: true,
    kyc_status: 'verified',
    account_locked: false,
    failed_login_attempts: 0,
  });

  return successResponse(res, 'Staff user created successfully', {
    user: buildUserResponse(user),
  }, 201);
});

const login = asyncHandler(async (req, res) => {
  const { email, phone, password } = req.validatedBody || req.body;
  const identifier = email || phone;

  if (!identifier || !password) {
    throw new AppError('Email or phone and password are required', 400);
  }

  const user = await User.findOne({
    $or: [{ email: identifier }, { phone: identifier }],
  }).select('+password +refresh_token_hash');

  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  await assertUserActiveOrRiderRestrictionVisible(user, 'Account');
  assertAccountCanLogin(user, 'Account');

  const isPasswordValid = await user.matchPassword(password);

  if (!isPasswordValid) {
    await recordFailedLogin(user, 'Three failed password login attempts');
    throw new AppError('Invalid credentials', 401);
  }

  await ensureRiderDeviceAllowed({ user, req });

  clearFailedLogin(user);
  user.last_login = new Date();
  const { accessToken, refreshToken } = createAuthTokens(user);
  user.refresh_token_hash = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'Login successful', {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      hub_id: user.hub_id,
      assigned_hub_ids: user.assigned_hub_ids || [],
      phone: user.phone,
      profile_image: user.profile_image,
      is_active: user.is_active,
      kyc_status: user.kyc_status,
      kyc_verified_at: user.kyc_verified_at,
      kyc_rejection_reason: user.kyc_rejection_reason,
      failed_login_attempts: user.failed_login_attempts,
      account_locked: user.account_locked,
      locked_at: user.locked_at,
      locked_reason: user.locked_reason,
      unlocked_at: user.unlocked_at,
      last_login: user.last_login,
    },
  });
});

const sendLoginOtp = asyncHandler(async (req, res) => {
  const { phone, purpose = 'login' } = req.validatedBody || req.body;
  const candidates = phoneCandidates(phone);

  if (purpose === 'login') {
    const user = await User.findOne({ phone: { $in: candidates }, role: 'rider' });

    if (!user) {
      throw new AppError('No driver/rider account found with this phone number', 404);
    }

    await assertUserActiveOrRiderRestrictionVisible(user, 'Driver account');
    assertAccountCanLogin(user, 'Driver account');
    await assertRiderDeviceNotFrozen(user, 'Driver OTP request');

    const { otp, response } = await sendOtpChallenge({
      phone: user.phone || phone,
      accountType: 'driver',
      purpose,
      recipient: {
        id: user._id,
        phone: user.phone || phone,
        email: user.email,
        related_type: 'user',
        related_id: user._id,
      },
      request: req,
    });

    if (shouldExposeDevOtp()) {
      response.otp = otp;
    }

    return successResponse(res, 'OTP sent successfully', response);
  }

  const [existingUser, existingRider] = await Promise.all([
    User.findOne({ phone: { $in: candidates } }),
    Rider.findOne({ phone: { $in: candidates } }),
  ]);

  if (existingUser || existingRider) {
    throw new AppError('A driver account already exists for this phone number', 409);
  }

  const { otp, response } = await sendOtpChallenge({
    phone,
    accountType: 'driver',
    purpose,
    request: req,
  });

  if (shouldExposeDevOtp()) {
    response.otp = otp;
  }

  return successResponse(res, 'Registration OTP sent successfully', response);
});

const verifyLoginOtp = asyncHandler(async (req, res) => {
  const { phone, otp, purpose = 'login' } = req.validatedBody || req.body;
  const candidates = phoneCandidates(phone);

  if (purpose === 'register') {
    const { registrationToken, registrationTokenExpiresAt } = await verifyOtpChallenge({
      phone,
      accountType: 'driver',
      purpose,
      otp,
      consumeOnSuccess: false,
    });

    return successResponse(res, 'Phone verified successfully', {
      otp_verified: true,
      otp_verification_token: registrationToken,
      otp_verification_expires_at: registrationTokenExpiresAt,
    });
  }

  const user = await User.findOne({
    phone: { $in: candidates },
    role: 'rider',
  }).select('+refresh_token_hash');

  if (!user) {
    throw new AppError('No driver/rider account found with this phone number', 404);
  }

  assertAccountCanLogin(user, 'Driver account');

  try {
    await verifyOtpChallenge({
      phone: user.phone || phone,
      accountType: 'driver',
      purpose,
      otp,
      consumeOnSuccess: true,
    });
  } catch (error) {
    await recordFailedLogin(user, 'Three failed OTP login attempts');
    throw error;
  }

  await assertUserActiveOrRiderRestrictionVisible(user, 'Driver account');

  await ensureRiderDeviceAllowed({ user, req });

  user.last_login = new Date();
  clearFailedLogin(user);

  const { accessToken, refreshToken } = createAuthTokens(user);
  user.refresh_token_hash = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'Login successful', {
    accessToken,
    refreshToken,
    user: buildUserResponse(user),
  });
});

const refreshToken = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.refreshToken || req.body.refreshToken;

  if (!incomingToken) {
    clearAuthCookies(res);
    throw new AppError('Refresh token is required', 401);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(incomingToken);
  } catch (error) {
    clearAuthCookies(res);
    throw new AppError('Invalid refresh token', 401);
  }

  const user = await User.findById(decoded.id).select('+refresh_token_hash');

  if (!user || !user.refresh_token_hash || user.refresh_token_hash !== hashToken(incomingToken)) {
    clearAuthCookies(res);
    throw new AppError('Invalid refresh token', 401);
  }

  await assertUserActiveOrRiderRestrictionVisible(user, 'Account');
  assertAccountCanLogin(user, 'Account');
  await ensureRiderDeviceAllowed({ user, req });

  const { accessToken, refreshToken: nextRefreshToken } = createAuthTokens(user);
  user.refresh_token_hash = hashToken(nextRefreshToken);
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, nextRefreshToken);

  return successResponse(res, 'Token refreshed successfully', {
    accessToken,
    refreshToken: nextRefreshToken,
  });
});

const logout = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.refreshToken || req.body.refreshToken;

  if (incomingToken) {
    try {
      const decoded = verifyRefreshToken(incomingToken);
      await User.findByIdAndUpdate(decoded.id, { $unset: { refresh_token_hash: '' } });
    } catch (error) {
      // Ignore invalid refresh token during logout.
    }
  }

  clearAuthCookies(res);

  return successResponse(res, 'Logout successful');
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.validatedBody || req.body;
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError('No account found for this email', 404);
  }

  const { resetToken, resetTokenHash, resetTokenExpires } = generatePasswordResetToken();

  user.password_reset_token_hash = resetTokenHash;
  user.password_reset_expires = new Date(resetTokenExpires);
  await user.save({ validateBeforeSave: false });

  return successResponse(res, 'Password reset token generated', {
    resetToken: process.env.NODE_ENV === 'production' ? undefined : resetToken,
    resetTokenExpires: user.password_reset_expires,
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken } = req.params;
  const { password } = req.validatedBody || req.body;
  const hashedToken = hashToken(resetToken);

  const user = await User.findOne({
    password_reset_token_hash: hashedToken,
    password_reset_expires: { $gt: new Date() },
  }).select('+password_reset_token_hash +password_reset_expires');

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  user.password = password;
  user.password_reset_token_hash = null;
  user.password_reset_expires = null;
  user.refresh_token_hash = null;
  await user.save();

  const { accessToken, refreshToken: nextRefreshToken } = createAuthTokens(user);
  user.refresh_token_hash = hashToken(nextRefreshToken);
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, nextRefreshToken);

  return successResponse(res, 'Password reset successful', {
    accessToken,
    refreshToken: nextRefreshToken,
    user: buildUserResponse(user),
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { current_password, password } = req.validatedBody || req.body;
  const user = await User.findById(req.user.id).select('+password +refresh_token_hash');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const isCurrentPasswordValid = await user.matchPassword(current_password);

  if (!isCurrentPasswordValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  user.password = password;
  user.refresh_token_hash = null;
  await user.save();

  const { accessToken, refreshToken: nextRefreshToken } = createAuthTokens(user);
  user.refresh_token_hash = hashToken(nextRefreshToken);
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, nextRefreshToken);

  return successResponse(res, 'Password changed successfully', {
    accessToken,
    refreshToken: nextRefreshToken,
  });
});

const me = asyncHandler(async (req, res) => {
  if (req.user.role === 'merchant') {
    const merchant = await Merchant.findById(req.user.id).populate('hub_id', 'name code city');

    if (!merchant) {
      throw new AppError('Merchant not found', 404);
    }

    return successResponse(res, 'Profile fetched successfully', {
      user: {
        id: merchant._id,
        full_name: merchant.shop_name || merchant.merchant_name,
        email: merchant.email,
        phone: merchant.phone,
        role: 'merchant',
        hub_id: merchant.hub_id,
        profile_image: null,
        is_active: merchant.status === 'active',
        kyc_status: merchant.kyc_status,
        kyc_verified_at: merchant.kyc_verified_at,
        kyc_rejection_reason: merchant.kyc_rejection_reason,
        failed_login_attempts: merchant.failed_login_attempts,
        account_locked: merchant.account_locked,
        locked_at: merchant.locked_at,
        locked_reason: merchant.locked_reason,
        unlocked_at: merchant.unlocked_at,
        last_login: merchant.last_login,
      },
    });
  }

  const user = await User.findById(req.user.id).populate('hub_id', 'name code city');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return successResponse(res, 'Profile fetched successfully', {
    user: buildUserResponse(user),
  });
});

const listUsers = asyncHandler(async (req, res) => {
  const requestedRoles = String(req.query.roles || '')
    .split(',')
    .map((role) => role.trim())
    .filter((role) => MANAGED_USER_ROLES.includes(role));
  const roles = requestedRoles.length ? requestedRoles : ADMIN_ROLES;

  const match = {
    role: {
      $in: canAccessAllHubs(req.user)
        ? roles
        : roles.filter((role) => !HQ_DASHBOARD_ROLES.includes(role)),
    },
  };

  if (req.query.hub_id && !mongoose.Types.ObjectId.isValid(req.query.hub_id)) {
    throw new AppError('hub_id is invalid', 400);
  }

  if (!canAccessAllHubs(req.user)) {
    Object.assign(match, buildHubScopedMatch(req.user, req.query, {
      actionName: 'User list',
    }));
  } else if (req.query.hub_id) {
    match.hub_id = req.query.hub_id;
  }

  if (req.query.locked === 'true') {
    match.account_locked = true;
  }

  if (req.query.search) {
    const search = String(req.query.search).trim();
    match.$or = [
      { full_name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  const users = await User.find(match)
    .sort({ account_locked: -1, role: 1, full_name: 1 })
    .limit(limit)
    .populate('hub_id', 'name code city');

  return successResponse(res, 'Users fetched successfully', {
    users: users.map(buildUserResponse),
  });
});

const unlockUserAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!canAccessAllHubs(req.user)) {
    if (canAccessAllHubs(user)) {
      throw new AppError('Only HQ admins can unlock HQ admin accounts', 403);
    }
    buildHubScopedMatch(req.user, { hub_id: user.hub_id }, { actionName: 'User unlock' });
  }

  await assertRiderDeviceNotFrozen(user, 'Account unlock');
  await unlockAccount(user, req.user.id);

  return successResponse(res, 'User account unlocked successfully', {
    user: buildUserResponse(user),
  });
});

const updateUserHubScope = asyncHandler(async (req, res) => {
  if (!HQ_DASHBOARD_ROLES.includes(req.user.role)) {
    throw new AppError('Only HQ admins can update user hub scope', 403);
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!ADMIN_ROLES.includes(user.role)) {
    throw new AppError('Hub scope can only be updated for staff users', 400);
  }

  const payload = req.validatedBody || req.body;
  const nextHubId = payload.hub_id === undefined ? user.hub_id : (payload.hub_id || null);
  const nextAssignedHubIds = payload.assigned_hub_ids === undefined
    ? (user.assigned_hub_ids || [])
    : (Array.isArray(payload.assigned_hub_ids) ? payload.assigned_hub_ids : []);

  if (payload.assigned_hub_ids !== undefined && !Array.isArray(payload.assigned_hub_ids)) {
    throw new AppError('assigned_hub_ids must be an array', 400);
  }

  const hubIdsToValidate = [
    ...(nextHubId ? [nextHubId] : []),
    ...nextAssignedHubIds,
  ].map(String);
  if (hubIdsToValidate.some((hubId) => !mongoose.Types.ObjectId.isValid(hubId))) {
    throw new AppError('Hub scope contains an invalid hub id', 400);
  }

  const uniqueHubIds = [...new Set(hubIdsToValidate)];
  if (uniqueHubIds.length > 0) {
    const existingHubCount = await Hub.countDocuments({ _id: { $in: uniqueHubIds } });
    if (existingHubCount !== uniqueHubIds.length) {
      throw new AppError('Hub scope contains an unknown hub', 400);
    }
  }

  if (REGIONAL_DASHBOARD_ROLES.includes(user.role) && nextAssignedHubIds.length === 0) {
    throw new AppError('Regional users require at least one assigned hub', 400);
  }

  if (HUB_DASHBOARD_ROLES.includes(user.role) && !nextHubId) {
    throw new AppError('Hub-level users require hub_id', 400);
  }

  user.hub_id = nextHubId;
  user.assigned_hub_ids = nextAssignedHubIds;
  await user.save({ validateBeforeSave: false });

  return successResponse(res, 'User hub scope updated successfully', {
    user: buildUserResponse(user),
  });
});

module.exports = {
  register,
  createStaffUser,
  login,
  sendLoginOtp,
  verifyLoginOtp,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  me,
  listUsers,
  unlockUserAccount,
  updateUserHubScope,
};
