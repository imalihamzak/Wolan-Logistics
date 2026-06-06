const Merchant = require('../models/Merchant');
const MerchantTransaction = require('../models/MerchantTransaction');
const Hub = require('../models/Hub');
const Upload = require('../models/Upload');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const notificationService = require('../services/notificationService');
const {
  emitToAdmin,
  emitToHub,
  emitToMerchant,
} = require('../sockets/emitters');
const { generatePasswordResetToken, verifyRefreshToken, hashToken } = require('../utils/token');
const {
  createMerchantTokens,
  hashMerchantToken,
  generateReferralCode,
  generateQrCode,
  resolveReferralMerchant,
  createReferralPayout,
  recalculateMerchantTier,
  getMerchantDashboardStats,
  listMerchants,
  aggregateMerchantTransactions,
} = require('../services/merchantService');
const {
  sendOtpChallenge,
  verifyOtpChallenge,
  consumeRegistrationOtp,
  phoneCandidates,
  normalizePhoneKey,
} = require('../services/otpService');
const {
  assertAccountCanLogin,
  recordFailedLogin,
  clearFailedLogin,
  unlockAccount,
  applyKycDecision,
} = require('../utils/accountSecurity');
const {
  buildPolicyAcceptanceRecords,
} = require('../constants/policyConstants');
const {
  isAdminRole,
  canAccessAllHubs,
  buildHubScopedMatch,
  assertHubAccess,
} = require('../utils/hubAccess');
const {
  HQ_DASHBOARD_ROLES,
  REGIONAL_DASHBOARD_ROLES,
  HUB_DASHBOARD_ROLES,
} = require('../constants/roleConstants');

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
    path: MERCHANT_REFRESH_COOKIE_PATH,
  });
};

const buildMerchantResponse = (merchant) => merchant.toPublicJSON();

const shouldExposeDevOtp = () => process.env.NODE_ENV !== 'production' && process.env.EXPOSE_DEV_OTP === 'true';

const buildQueryMatch = (query) => {
  const match = {};

  if (query.status) match.status = query.status;
  if (query.tier_level) match.tier_level = query.tier_level;
  if (query.hub_id) match.hub_id = query.hub_id;
  if (query.search) {
    match.$or = [
      { merchant_name: { $regex: query.search, $options: 'i' } },
      { shop_name: { $regex: query.search, $options: 'i' } },
      { building_name: { $regex: query.search, $options: 'i' } },
      { phone: { $regex: query.search, $options: 'i' } },
      { email: { $regex: query.search, $options: 'i' } },
      { referral_code: { $regex: query.search, $options: 'i' } },
    ];
  }

  return match;
};

const assertMerchantHubAccess = (merchant, user, actionName = 'Merchant access') => {
  if (!user || canAccessAllHubs(user)) {
    return;
  }

  if (!isAdminRole(user.role)) {
    throw new AppError('Forbidden', 403);
  }

  assertHubAccess(user, merchant.hub_id, actionName);
};

const applyMerchantHubScope = (query = {}, user) => {
  const scopedQuery = { ...query };

  if (!user || canAccessAllHubs(user)) {
    return scopedQuery;
  }

  if (!isAdminRole(user.role)) {
    throw new AppError('Hub access is required for this account', 403);
  }

  const scopedMatch = buildHubScopedMatch(user, scopedQuery, {
    actionName: 'Merchant list',
  });
  if (scopedMatch.hub_id) {
    scopedQuery.hub_id = scopedMatch.hub_id;
  }
  return scopedQuery;
};

const ACTIVE_ESCALATION_STATUSES = ['open', 'in_progress'];
const ESCALATION_PRIORITY_WEIGHT = { urgent: 0, high: 1, normal: 2 };
const DEFAULT_ESCALATION_SLA_HOURS = { urgent: 4, high: 12, normal: 24 };
const MERCHANT_KYC_PENDING_STATUSES = ['pending', 'pending_review'];
const REQUIRED_MERCHANT_KYC_DOCUMENT_TYPES = [
  'business_registration',
  'tax_certificate',
  'owner_id',
  'shop_photo',
];

const escalationSort = (left, right) => {
  const priorityDiff = (ESCALATION_PRIORITY_WEIGHT[left.escalation_priority] ?? 99)
    - (ESCALATION_PRIORITY_WEIGHT[right.escalation_priority] ?? 99);
  if (priorityDiff !== 0) return priorityDiff;

  const leftDue = left.escalation_sla_due_at ? new Date(left.escalation_sla_due_at).getTime() : Number.MAX_SAFE_INTEGER;
  const rightDue = right.escalation_sla_due_at ? new Date(right.escalation_sla_due_at).getTime() : Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;

  return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
};

const addMerchantEscalationAction = (merchant, payload, actor) => {
  merchant.escalation_action_trail.push({
    action: `escalation_${payload.to_status}`,
    from_status: payload.from_status,
    to_status: payload.to_status,
    priority: payload.priority,
    note: payload.note,
    actor_id: actor?.id || null,
    actor_role: actor?.role || 'system',
    sla_due_at: payload.sla_due_at || null,
    created_at: new Date(),
  });
};

const buildEscalationDueAt = (priority, slaHours) => {
  const hours = slaHours || DEFAULT_ESCALATION_SLA_HOURS[priority] || DEFAULT_ESCALATION_SLA_HOURS.normal;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return String(value._id || value.id || value);
  return String(value);
};

const isQrDataUrl = (value) => typeof value === 'string' && /^data:image\/png;base64,/i.test(value);

const ensureMerchantQrCode = async (merchant, options = {}) => {
  if (!merchant) {
    return merchant;
  }

  let changed = false;
  let qrPayloadChanged = false;

  if (!merchant.referral_code) {
    merchant.referral_code = await generateReferralCode(merchant.merchant_name || merchant.shop_name, merchant.email);
    changed = true;
    qrPayloadChanged = true;
  }

  if (options.force || qrPayloadChanged || !isQrDataUrl(merchant.qr_code)) {
    merchant.qr_code = await generateQrCode(merchant);
    changed = true;
  }

  if (changed) {
    await merchant.save({ validateBeforeSave: false });
  }

  return merchant;
};

const buildMerchantKycPayload = (merchant, event) => ({
  event,
  merchant_id: String(merchant._id),
  hub_id: merchant.hub_id || null,
  kyc_status: merchant.kyc_status,
  merchant: buildMerchantResponse(merchant),
});

const emitMerchantKycUpdate = (merchant, event) => {
  const payload = buildMerchantKycPayload(merchant, event);
  emitToAdmin('merchant:kyc-updated', payload);
  emitToAdmin(`merchant:kyc-${event}`, payload);
  if (merchant.hub_id) {
    emitToHub(String(merchant.hub_id), 'merchant:kyc-updated', payload);
    emitToHub(String(merchant.hub_id), `merchant:kyc-${event}`, payload);
  }
  emitToMerchant(String(merchant._id), 'merchant:kyc-updated', payload);
  emitToMerchant(String(merchant._id), `merchant:kyc-${event}`, payload);
};

const notifyAdminsOfMerchantKyc = async (merchant) => {
  const adminFilter = merchant.hub_id
    ? {
      is_active: true,
      $or: [
        { role: { $in: HQ_DASHBOARD_ROLES } },
        { role: { $in: REGIONAL_DASHBOARD_ROLES }, assigned_hub_ids: merchant.hub_id },
        { role: { $in: HUB_DASHBOARD_ROLES }, hub_id: merchant.hub_id },
      ],
    }
    : {
      role: { $in: HQ_DASHBOARD_ROLES },
      is_active: true,
    };

  const admins = await User.find(adminFilter).select('full_name email phone role hub_id').limit(100);
  const variables = {
    merchant_name: merchant.shop_name || merchant.merchant_name,
    merchant_email: merchant.email,
    merchant_phone: merchant.phone,
    kyc_status: merchant.kyc_status,
  };

  await Promise.allSettled(admins.map((admin) => notificationService.send(
    'in_app',
    'merchant',
    { id: admin._id, email: admin.email, phone: admin.phone },
    'merchant_kyc_submitted',
    variables,
    {
      priority: 'high',
      related_type: 'merchant',
      related_id: merchant._id,
      metadata: {
        hub_id: toIdString(merchant.hub_id),
        merchant_id: String(merchant._id),
        kyc_status: merchant.kyc_status,
      },
    }
  )));
};

const notifyMerchantOfKycDecision = async (merchant, actorId) => {
  const templateKey = merchant.kyc_status === 'verified'
    ? 'merchant_kyc_approved'
    : merchant.kyc_status === 'rejected'
      ? 'merchant_kyc_rejected'
      : null;

  if (!templateKey) {
    return;
  }

  await notificationService.send(
    'in_app',
    'merchant',
    { id: merchant._id, email: merchant.email, phone: merchant.phone },
    templateKey,
    {
      merchant_name: merchant.shop_name || merchant.merchant_name,
      rejection_reason: merchant.kyc_rejection_reason || 'Admin requested corrected documents',
    },
    {
      priority: merchant.kyc_status === 'rejected' ? 'high' : 'normal',
      related_type: 'merchant',
      related_id: merchant._id,
      sent_by: actorId || null,
      metadata: {
        hub_id: toIdString(merchant.hub_id),
        merchant_id: String(merchant._id),
        kyc_status: merchant.kyc_status,
      },
    }
  );
};

const assertMerchantDocumentUploadsBelongToSubmission = async (merchant, documentUploads = []) => {
  const uploadIds = documentUploads
    .map((document) => document.upload_id)
    .filter(Boolean);

  if (uploadIds.length === 0) {
    return;
  }

  const uploads = await Upload.find({ _id: { $in: uploadIds } }).lean();
  const uploadMap = new Map(uploads.map((upload) => [String(upload._id), upload]));

  for (const uploadId of uploadIds) {
    const upload = uploadMap.get(String(uploadId));
    if (!upload) {
      throw new AppError('Merchant KYC document upload was not found', 404);
    }

    if (upload.related_model !== 'Merchant' || String(upload.related_id) !== String(merchant._id)) {
      throw new AppError('Merchant KYC document upload does not belong to this merchant', 400);
    }

    if (upload.hub_id && merchant.hub_id && String(upload.hub_id) !== String(merchant.hub_id)) {
      throw new AppError('Merchant KYC document upload belongs to a different hub', 400);
    }
  }
};

const assertMerchantKycSubmissionReadyForReview = async (merchant, actionName = 'Merchant KYC review') => {
  if (!merchant.kyc_submission?.submitted_at) {
    throw new AppError('Merchant KYC submission is required before review', 400);
  }

  const documentUploads = merchant.kyc_submission.document_uploads || [];
  const documentsByType = new Map(documentUploads.map((document) => [document.type, document]));
  const missingDocuments = REQUIRED_MERCHANT_KYC_DOCUMENT_TYPES.filter((type) => !documentsByType.get(type)?.upload_id);
  if (missingDocuments.length > 0) {
    throw new AppError(`${actionName} requires uploaded documents for: ${missingDocuments.join(', ')}`, 400);
  }

  const uploadIds = documentUploads
    .map((document) => document.upload_id ? String(document.upload_id) : null)
    .filter(Boolean);
  const duplicateUploadId = uploadIds.find((uploadId, index) => uploadIds.indexOf(uploadId) !== index);
  if (duplicateUploadId) {
    throw new AppError(`${actionName} requires a separate uploaded file for each document slot`, 400);
  }

  await assertMerchantDocumentUploadsBelongToSubmission(merchant, documentUploads);
};

const registerMerchant = asyncHandler(async (req, res) => {
  const {
    merchant_name,
    shop_name,
    building_name,
    phone,
    email,
    password,
    address,
    referred_by,
    hub_id,
    tier_level,
    status,
    otp_verification_token,
    accepted_policy_keys,
  } = req.validatedBody || req.body;

  const normalizedPhone = normalizePhoneKey(phone);
  const existingMerchant = await Merchant.findOne({
    $or: [
      { email },
      { phone: { $in: phoneCandidates(phone) } },
    ],
  });

  if (existingMerchant) {
    throw new AppError('Merchant already exists', 409);
  }

  let effectiveHubId = hub_id || null;
  if (req.user && !canAccessAllHubs(req.user)) {
    if (!isAdminRole(req.user.role)) {
      throw new AppError('Hub access is required for this account', 403);
    }
    const scopedMatch = buildHubScopedMatch(req.user, { hub_id }, {
      actionName: 'Merchant registration',
    });
    if (scopedMatch.hub_id?.$in) {
      throw new AppError('hub_id is required when registering a merchant from a regional account', 400);
    }
    effectiveHubId = scopedMatch.hub_id;
  }

  if (effectiveHubId) {
    const hubExists = await Hub.exists({ _id: effectiveHubId });
    if (!hubExists) {
      throw new AppError('hub_id is invalid', 400);
    }
  }

  if (!req.user) {
    await consumeRegistrationOtp({
      phone,
      accountType: 'merchant',
      verificationToken: otp_verification_token,
    });
  }

  const referralMerchant = await resolveReferralMerchant(referred_by);

  const referral_code = await generateReferralCode(merchant_name, email);

  const merchant = await Merchant.create({
    merchant_name,
    shop_name,
    building_name,
    phone: normalizedPhone,
    email,
    password,
    address,
    referral_code,
    referred_by: referralMerchant ? referralMerchant._id : null,
    tier_level: tier_level || 'Starter',
    tier_manually_set: Boolean(req.user && tier_level),
    tier_updated_at: req.user && tier_level ? new Date() : null,
    tier_updated_by: req.user && tier_level ? req.user.id : null,
    total_deliveries: 0,
    cod_balance: 0,
    earnings: 0,
    hub_id: effectiveHubId,
    status: status || 'active',
    kyc_status: req.user ? (req.validatedBody?.kyc_status || req.body.kyc_status || 'unverified') : 'unverified',
    policy_acceptances: buildPolicyAcceptanceRecords({
      audience: 'merchant',
      acceptedKeys: accepted_policy_keys,
      req,
    }),
  });

  merchant.qr_code = await generateQrCode(merchant);

  if (referralMerchant) {
    await createReferralPayout({ referredByMerchant: referralMerchant, newMerchant: merchant });
  }

  if (!req.user || !tier_level) {
    recalculateMerchantTier(merchant);
  }
  await merchant.save();

  const { accessToken, refreshToken } = createMerchantTokens(merchant);
  merchant.refresh_token_hash = hashMerchantToken(refreshToken);
  await merchant.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'Merchant registered successfully', {
    accessToken,
    refreshToken,
    merchant: buildMerchantResponse(merchant),
  }, 201);
});

const loginMerchant = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody || req.body;

  const merchant = await Merchant.findOne({ email }).select('+password +refresh_token_hash');

  if (!merchant) {
    throw new AppError('Invalid credentials', 401);
  }

  if (merchant.status !== 'active') {
    throw new AppError('Merchant account is not active', 403);
  }
  assertAccountCanLogin(merchant, 'Merchant account');

  const isPasswordValid = await merchant.matchPassword(password);

  if (!isPasswordValid) {
    await recordFailedLogin(merchant, 'Three failed password login attempts');
    throw new AppError('Invalid credentials', 401);
  }

  clearFailedLogin(merchant);
  merchant.last_login = new Date();
  const { accessToken, refreshToken } = createMerchantTokens(merchant);
  merchant.refresh_token_hash = hashMerchantToken(refreshToken);
  await merchant.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'Merchant login successful', {
    accessToken,
    refreshToken,
    merchant: buildMerchantResponse(merchant),
  });
});

const sendMerchantOtp = asyncHandler(async (req, res) => {
  const { phone, purpose = 'login' } = req.validatedBody || req.body;
  const candidates = phoneCandidates(phone);

  if (purpose === 'login') {
    const merchant = await Merchant.findOne({ phone: { $in: candidates } });

    if (!merchant) {
      throw new AppError('No merchant account found with this phone number', 404);
    }

    if (merchant.status !== 'active') {
      throw new AppError('Merchant account is not active', 403);
    }
    assertAccountCanLogin(merchant, 'Merchant account');

    const { otp, response } = await sendOtpChallenge({
      phone: merchant.phone || phone,
      accountType: 'merchant',
      purpose,
      recipient: {
        id: merchant._id,
        phone: merchant.phone || phone,
        email: merchant.email,
        related_type: 'merchant',
        related_id: merchant._id,
      },
      request: req,
    });

    if (shouldExposeDevOtp()) {
      response.otp = otp;
    }

    return successResponse(res, 'OTP sent successfully', response);
  }

  const existingMerchant = await Merchant.findOne({
    $or: [
      { phone: { $in: candidates } },
      { email: String(req.body.email || '').trim().toLowerCase() },
    ],
  });

  if (existingMerchant) {
    throw new AppError('Merchant already exists', 409);
  }

  const { otp, response } = await sendOtpChallenge({
    phone,
    accountType: 'merchant',
    purpose,
    request: req,
  });

  if (shouldExposeDevOtp()) {
    response.otp = otp;
  }

  return successResponse(res, 'Registration OTP sent successfully', response);
});

const verifyMerchantOtp = asyncHandler(async (req, res) => {
  const { phone, otp, purpose = 'login' } = req.validatedBody || req.body;
  const candidates = phoneCandidates(phone);

  if (purpose === 'register') {
    const { registrationToken, registrationTokenExpiresAt } = await verifyOtpChallenge({
      phone,
      accountType: 'merchant',
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

  const merchant = await Merchant.findOne({ phone: { $in: candidates } }).select('+refresh_token_hash');

  if (!merchant) {
    throw new AppError('No merchant account found with this phone number', 404);
  }

  assertAccountCanLogin(merchant, 'Merchant account');

  try {
    await verifyOtpChallenge({
      phone: merchant.phone || phone,
      accountType: 'merchant',
      purpose,
      otp,
      consumeOnSuccess: true,
    });
  } catch (error) {
    await recordFailedLogin(merchant, 'Three failed OTP login attempts');
    throw error;
  }

  if (merchant.status !== 'active') {
    throw new AppError('Merchant account is not active', 403);
  }

  merchant.last_login = new Date();
  clearFailedLogin(merchant);
  const { accessToken, refreshToken } = createMerchantTokens(merchant);
  merchant.refresh_token_hash = hashMerchantToken(refreshToken);
  await merchant.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'Merchant login successful', {
    accessToken,
    refreshToken,
    merchant: buildMerchantResponse(merchant),
  });
});

const refreshMerchantToken = asyncHandler(async (req, res) => {
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

  const merchant = await Merchant.findById(decoded.id).select('+refresh_token_hash');

  if (!merchant || merchant.refresh_token_hash !== hashMerchantToken(incomingToken)) {
    clearAuthCookies(res);
    throw new AppError('Invalid refresh token', 401);
  }

  if (merchant.status !== 'active') {
    throw new AppError('Merchant account is not active', 403);
  }
  assertAccountCanLogin(merchant, 'Merchant account');

  const { accessToken, refreshToken } = createMerchantTokens(merchant);
  merchant.refresh_token_hash = hashMerchantToken(refreshToken);
  await merchant.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'Merchant token refreshed successfully', {
    accessToken,
    refreshToken,
  });
});

const logoutMerchant = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.refreshToken || req.body.refreshToken;

  if (incomingToken) {
    try {
      const decoded = verifyRefreshToken(incomingToken);
      await Merchant.findByIdAndUpdate(decoded.id, { $unset: { refresh_token_hash: '' } });
    } catch (error) {
      // ignore invalid refresh token during logout
    }
  }

  clearAuthCookies(res);

  return successResponse(res, 'Merchant logout successful');
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.validatedBody || req.body;
  const merchant = await Merchant.findOne({ email });

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  const { resetToken, resetTokenHash, resetTokenExpires } = generatePasswordResetToken();

  merchant.password_reset_token_hash = resetTokenHash;
  merchant.password_reset_expires = new Date(resetTokenExpires);
  await merchant.save({ validateBeforeSave: false });

  return successResponse(res, 'Password reset token generated', {
    resetToken: process.env.NODE_ENV === 'production' ? undefined : resetToken,
    resetTokenExpires: merchant.password_reset_expires,
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken } = req.params;
  const { password } = req.validatedBody || req.body;

  const merchant = await Merchant.findOne({
    password_reset_token_hash: hashToken(resetToken),
    password_reset_expires: { $gt: new Date() },
  }).select('+password_reset_token_hash +password_reset_expires +refresh_token_hash');

  if (!merchant) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  merchant.password = password;
  merchant.password_reset_token_hash = null;
  merchant.password_reset_expires = null;
  merchant.refresh_token_hash = null;
  await merchant.save();

  const { accessToken, refreshToken } = createMerchantTokens(merchant);
  merchant.refresh_token_hash = hashMerchantToken(refreshToken);
  await merchant.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'Password reset successful', {
    accessToken,
    refreshToken,
    merchant: buildMerchantResponse(merchant),
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { current_password, password } = req.validatedBody || req.body;
  const merchant = await Merchant.findById(req.user.id).select('+password +refresh_token_hash');

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  const isPasswordValid = await merchant.matchPassword(current_password);

  if (!isPasswordValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  merchant.password = password;
  merchant.refresh_token_hash = null;
  await merchant.save();

  const { accessToken, refreshToken } = createMerchantTokens(merchant);
  merchant.refresh_token_hash = hashMerchantToken(refreshToken);
  await merchant.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken);

  return successResponse(res, 'Password changed successfully', {
    accessToken,
    refreshToken,
  });
});

const getCurrentMerchant = asyncHandler(async (req, res) => {
  const merchant = await Merchant.findById(req.user.id);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  await ensureMerchantQrCode(merchant);

  return successResponse(res, 'Merchant profile fetched successfully', {
    merchant: buildMerchantResponse(merchant),
  });
});

const updateCurrentMerchant = asyncHandler(async (req, res) => {
  const merchant = await Merchant.findById(req.user.id).select('+refresh_token_hash');

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  const updates = req.validatedBody || req.body;
  const selfUpdateFields = new Set(['merchant_name', 'shop_name', 'building_name', 'phone', 'email', 'address']);
  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined && selfUpdateFields.has(key)) {
      merchant[key] = value;
    }
  });

  merchant.qr_code = await generateQrCode(merchant);
  await merchant.save();

  return successResponse(res, 'Merchant profile updated successfully', {
    merchant: buildMerchantResponse(merchant),
  });
});

const submitCurrentMerchantKyc = asyncHandler(async (req, res) => {
  const merchant = await Merchant.findById(req.user.id);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  if (merchant.kyc_status === 'verified') {
    throw new AppError('Merchant KYC is already verified. Contact admin to change verified KYC details.', 400);
  }

  const payload = req.validatedBody || req.body;
  const now = new Date();
  const documentUploads = payload.document_uploads || [];

  await assertMerchantDocumentUploadsBelongToSubmission(merchant, documentUploads);

  merchant.kyc_submission = {
    legal_business_name: payload.legal_business_name,
    business_registration_number: payload.business_registration_number,
    tin_number: payload.tin_number,
    owner_full_name: payload.owner_full_name,
    owner_id_number: payload.owner_id_number,
    owner_phone: payload.owner_phone,
    document_links: payload.document_links || [],
    document_uploads: documentUploads,
    document_notes: payload.document_notes || null,
    submitted_at: now,
    updated_at: now,
    reviewed_at: null,
    reviewed_by: null,
  };
  merchant.kyc_status = 'pending_review';
  merchant.kyc_rejection_reason = null;
  merchant.kyc_verified_at = null;
  merchant.kyc_verified_by = null;

  await merchant.save();
  await notifyAdminsOfMerchantKyc(merchant);
  emitMerchantKycUpdate(merchant, 'submitted');

  return successResponse(res, 'Merchant KYC submitted successfully', {
    merchant: buildMerchantResponse(merchant),
  });
});

const listAllMerchants = asyncHandler(async (req, res) => {
  const result = await listMerchants({ query: applyMerchantHubScope(req.query, req.user) });

  return successResponse(res, 'Merchants fetched successfully', {
    merchants: result.items.map((merchant) => merchant.toPublicJSON()),
  }, 200, result.pagination);
});

const createMerchant = asyncHandler(async (req, res) => {
  req.validatedBody = req.validatedBody || req.body;
  return registerMerchant(req, res);
});

const getMerchantById = asyncHandler(async (req, res) => {
  const merchant = await Merchant.findById(req.params.id);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  assertMerchantHubAccess(merchant, req.user);
  await ensureMerchantQrCode(merchant);

  return successResponse(res, 'Merchant fetched successfully', {
    merchant: buildMerchantResponse(merchant),
  });
});

const updateMerchant = asyncHandler(async (req, res) => {
  const merchant = await Merchant.findById(req.params.id).select('+refresh_token_hash');

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  assertMerchantHubAccess(merchant, req.user, 'Merchant update');

  const updates = req.validatedBody || req.body;

  if (!canAccessAllHubs(req.user) && updates.hub_id && String(updates.hub_id) !== String(merchant.hub_id || '')) {
    throw new AppError('Only super admins can move merchants between hubs', 403);
  }

  if (
    updates.tier_level
    && updates.tier_level !== 'Elite'
    && ACTIVE_ESCALATION_STATUSES.includes(merchant.escalation_status)
  ) {
    throw new AppError('Resolve or dismiss the active elite escalation before downgrading this merchant', 400);
  }

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      merchant[key] = value;
    }
  });

  if (updates.tier_level) {
    merchant.tier_manually_set = true;
    merchant.tier_updated_at = new Date();
    merchant.tier_updated_by = req.user.id;
  }

  if (req.validatedBody?.hub_id) {
    const hubExists = await Hub.exists({ _id: req.validatedBody.hub_id });
    if (!hubExists) {
      throw new AppError('hub_id is invalid', 400);
    }
  }

  if (!updates.tier_level && (updates.total_deliveries !== undefined || updates.earnings !== undefined)) {
    recalculateMerchantTier(merchant);
  }
  await ensureMerchantQrCode(merchant, { force: true });
  await merchant.save();

  return successResponse(res, 'Merchant updated successfully', {
    merchant: buildMerchantResponse(merchant),
  });
});

const updateMerchantKyc = asyncHandler(async (req, res) => {
  const merchant = await Merchant.findById(req.params.id);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  assertMerchantHubAccess(merchant, req.user, 'Merchant KYC update');

  const payload = req.validatedBody || req.body;
  if (!['verified', 'rejected'].includes(payload.kyc_status)) {
    throw new AppError('Merchant KYC review can only approve or reject a submitted KYC package', 400);
  }
  if (payload.kyc_status === 'verified') {
    await assertMerchantKycSubmissionReadyForReview(merchant, 'Merchant KYC approval');
  }
  if (payload.kyc_status === 'rejected' && !merchant.kyc_submission?.submitted_at) {
    throw new AppError('Merchant KYC submission is required before rejection', 400);
  }

  const nextKycStatus = payload.kyc_status === 'pending' ? 'pending_review' : payload.kyc_status;
  await applyKycDecision(merchant, nextKycStatus, req.user.id, payload.reason);
  if (nextKycStatus === 'verified') {
    clearFailedLogin(merchant);
    merchant.unlocked_at = new Date();
    merchant.unlocked_by = req.user.id;
  }
  if (merchant.kyc_submission) {
    const currentSubmission = merchant.kyc_submission.toObject
      ? merchant.kyc_submission.toObject()
      : merchant.kyc_submission;
    merchant.kyc_submission = {
      ...currentSubmission,
      reviewed_at: new Date(),
      reviewed_by: req.user.id,
    };
    await merchant.save({ validateBeforeSave: false });
  }
  await notifyMerchantOfKycDecision(merchant, req.user.id);
  emitMerchantKycUpdate(merchant, nextKycStatus === 'verified' ? 'approved' : nextKycStatus === 'rejected' ? 'rejected' : 'updated');

  return successResponse(res, 'Merchant KYC updated successfully', {
    merchant: buildMerchantResponse(merchant),
  });
});

const unlockMerchantAccount = asyncHandler(async (req, res) => {
  const merchant = await Merchant.findById(req.params.id);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  assertMerchantHubAccess(merchant, req.user, 'Merchant unlock');

  await unlockAccount(merchant, req.user.id);

  return successResponse(res, 'Merchant account unlocked successfully', {
    merchant: buildMerchantResponse(merchant),
  });
});

const listMerchantEscalationQueue = asyncHandler(async (req, res) => {
  const match = applyMerchantHubScope({
    tier_level: 'Elite',
    escalation_status: { $in: ACTIVE_ESCALATION_STATUSES },
  }, req.user);

  const merchants = await Merchant.find(match).limit(200);
  merchants.sort(escalationSort);

  return successResponse(res, 'Elite merchant escalation queue fetched successfully', {
    merchants: merchants.map((merchant) => buildMerchantResponse(merchant)),
    count: merchants.length,
  });
});

const updateMerchantEscalation = asyncHandler(async (req, res) => {
  const merchant = await Merchant.findById(req.params.id);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  assertMerchantHubAccess(merchant, req.user, 'Merchant escalation update');

  const payload = req.validatedBody || req.body;
  const nextStatus = payload.escalation_status;
  const previousStatus = merchant.escalation_status || 'none';
  const nextPriority = payload.escalation_priority || merchant.escalation_priority || 'high';
  const note = String(payload.note || payload.reason || '').trim();

  if (note.length < 3 && nextStatus !== 'none') {
    throw new AppError('Escalation note is required', 400);
  }

  if (ACTIVE_ESCALATION_STATUSES.includes(nextStatus) && merchant.tier_level !== 'Elite') {
    throw new AppError('Only Elite merchants can enter the escalation queue', 400);
  }

  const now = new Date();
  let slaDueAt = merchant.escalation_sla_due_at;

  if (ACTIVE_ESCALATION_STATUSES.includes(nextStatus)) {
    slaDueAt = payload.sla_hours
      ? buildEscalationDueAt(nextPriority, payload.sla_hours)
      : (merchant.escalation_sla_due_at || buildEscalationDueAt(nextPriority));

    merchant.escalation_status = nextStatus;
    merchant.escalation_priority = nextPriority;
    merchant.escalation_reason = payload.reason || merchant.escalation_reason || note;
    merchant.escalation_sla_due_at = slaDueAt;
    merchant.escalation_opened_at = merchant.escalation_opened_at || now;
    merchant.escalation_resolved_at = null;
  } else {
    merchant.escalation_status = nextStatus;
    merchant.escalation_priority = nextStatus === 'none' ? 'normal' : nextPriority;
    merchant.escalation_resolved_at = now;

    if (nextStatus === 'none') {
      merchant.escalation_reason = null;
      merchant.escalation_sla_due_at = null;
      merchant.escalation_opened_at = null;
      slaDueAt = null;
    }
  }

  merchant.escalation_updated_by = req.user.id;
  addMerchantEscalationAction(merchant, {
    from_status: previousStatus,
    to_status: nextStatus,
    priority: merchant.escalation_priority,
    note,
    sla_due_at: slaDueAt,
  }, req.user);

  await merchant.save();

  return successResponse(res, 'Merchant escalation updated successfully', {
    merchant: buildMerchantResponse(merchant),
  });
});

const deleteMerchant = asyncHandler(async (req, res) => {
  const merchant = await Merchant.findById(req.params.id);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  assertMerchantHubAccess(merchant, req.user, 'Merchant deletion');

  await merchant.deleteOne();
  await MerchantTransaction.deleteMany({ merchant_id: merchant._id });

  return successResponse(res, 'Merchant deleted successfully');
});

const getMerchantDashboard = asyncHandler(async (req, res) => {
  const merchantId = req.user.role === 'merchant' ? req.user.id : (req.query.merchant_id || req.user.id);
  const merchant = await Merchant.findById(merchantId);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  if (req.user.role !== 'merchant') {
    assertMerchantHubAccess(merchant, req.user, 'Merchant dashboard access');
  }

  await ensureMerchantQrCode(merchant);

  const dashboard = await getMerchantDashboardStats(merchant);

  return successResponse(res, 'Merchant dashboard fetched successfully', dashboard);
});

const getMerchantDashboardById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const merchant = await Merchant.findById(id);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  assertMerchantHubAccess(merchant, req.user, 'Merchant dashboard access');

  await ensureMerchantQrCode(merchant);

  const dashboard = await getMerchantDashboardStats(merchant);

  return successResponse(res, 'Merchant dashboard fetched successfully', dashboard);
});

const getReferralEarnings = asyncHandler(async (req, res) => {
  const merchantId = req.user.role === 'merchant' ? req.user.id : (req.query.merchant_id || req.user.id);
  if (req.user.role !== 'merchant') {
    const merchant = await Merchant.findById(merchantId);
    if (!merchant) {
      throw new AppError('Merchant not found', 404);
    }
    assertMerchantHubAccess(merchant, req.user, 'Merchant referral access');
  }
  const result = await aggregateMerchantTransactions(merchantId, 'referral', req.query);

  return successResponse(res, 'Referral earnings fetched successfully', {
    referralEarnings: result.summary.totalAmount,
    referrals: result.items,
  }, 200, result.pagination);
});

const getCodReports = asyncHandler(async (req, res) => {
  const merchantId = req.user.role === 'merchant' ? req.user.id : (req.query.merchant_id || req.user.id);
  const merchant = await Merchant.findById(merchantId);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  if (req.user.role !== 'merchant') {
    assertMerchantHubAccess(merchant, req.user, 'Merchant COD access');
  }

  const result = await aggregateMerchantTransactions(merchantId, 'cod', req.query);

  return successResponse(res, 'COD reports fetched successfully', {
    cod_balance: merchant?.cod_balance || 0,
    codReports: result.items,
    totalCodAmount: result.summary.totalAmount,
  }, 200, result.pagination);
});

const getPayoutHistory = asyncHandler(async (req, res) => {
  const merchantId = req.user.role === 'merchant' ? req.user.id : (req.query.merchant_id || req.user.id);
  if (req.user.role !== 'merchant') {
    const merchant = await Merchant.findById(merchantId);
    if (!merchant) {
      throw new AppError('Merchant not found', 404);
    }
    assertMerchantHubAccess(merchant, req.user, 'Merchant payout access');
  }
  const result = await aggregateMerchantTransactions(merchantId, 'payout', req.query);

  return successResponse(res, 'Payout history fetched successfully', {
    payoutHistory: result.items,
    totalPayoutAmount: result.summary.totalAmount,
  }, 200, result.pagination);
});

const getMerchantQrCode = asyncHandler(async (req, res) => {
  const merchant = req.user.role === 'merchant' ? await Merchant.findById(req.user.id) : await Merchant.findById(req.params.id);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  if (req.user.role !== 'merchant') {
    assertMerchantHubAccess(merchant, req.user, 'Merchant QR access');
  }

  await ensureMerchantQrCode(merchant);

  return successResponse(res, 'Merchant QR code fetched successfully', {
    merchant_id: merchant._id,
    referral_code: merchant.referral_code,
    shop_name: merchant.shop_name,
    merchant_name: merchant.merchant_name,
    qr_code: merchant.qr_code,
  });
});

const regenerateMerchantQrCode = asyncHandler(async (req, res) => {
  const merchantId = req.user.role === 'merchant' ? req.user.id : req.params.id;
  const merchant = await Merchant.findById(merchantId);

  if (!merchant) {
    throw new AppError('Merchant not found', 404);
  }

  if (req.user.role !== 'merchant') {
    assertMerchantHubAccess(merchant, req.user, 'Merchant QR regeneration');
  }

  await ensureMerchantQrCode(merchant, { force: true });

  return successResponse(res, 'Merchant QR code regenerated successfully', {
    merchant_id: merchant._id,
    referral_code: merchant.referral_code,
    shop_name: merchant.shop_name,
    merchant_name: merchant.merchant_name,
    qr_code: merchant.qr_code,
  });
});

module.exports = {
  registerMerchant,
  createMerchant,
  loginMerchant,
  sendMerchantOtp,
  verifyMerchantOtp,
  refreshMerchantToken,
  logoutMerchant,
  forgotPassword,
  resetPassword,
  changePassword,
  getCurrentMerchant,
  updateCurrentMerchant,
  submitCurrentMerchantKyc,
  listAllMerchants,
  getMerchantById,
  updateMerchant,
  updateMerchantKyc,
  unlockMerchantAccount,
  listMerchantEscalationQueue,
  updateMerchantEscalation,
  deleteMerchant,
  getMerchantDashboard,
  getMerchantDashboardById,
  getReferralEarnings,
  getCodReports,
  getPayoutHistory,
  getMerchantQrCode,
  regenerateMerchantQrCode,
};
