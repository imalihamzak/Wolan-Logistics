const crypto = require('crypto');

const User = require('../models/User');
const Merchant = require('../models/Merchant');
const Rider = require('../models/Rider');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const {
  signAccessToken,
  signRefreshToken,
  hashToken,
} = require('../utils/token');
const {
  createMerchantTokens,
  hashMerchantToken,
} = require('../services/merchantService');
const {
  assertAccountCanLogin,
  clearFailedLogin,
} = require('../utils/accountSecurity');
const {
  ensureRiderDeviceAllowed,
} = require('../services/deviceSecurityService');
const { getRiderRestrictionSnapshot } = require('../utils/riderRestrictions');
const { ADMIN_ROLES } = require('../constants/roleConstants');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_OAUTH_TIMEOUT_MS = Number(process.env.GOOGLE_OAUTH_TIMEOUT_MS || 10000);

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
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const OAUTH_SESSION_MAX_AGE_MS = 2 * 60 * 1000;

const STAFF_ROLES = [...ADMIN_ROLES];
const ACCOUNT_TYPES = ['staff', 'merchant', 'driver'];
const oauthSessionStore = new Map();

const getFrontendBaseUrl = () => (
  process.env.FRONTEND_URL
  || String(process.env.CLIENT_ORIGIN || '').split(',')[0]
  || 'http://localhost:5173'
).replace(/\/+$/, '');

const getGoogleCallbackUrl = () => (
  process.env.GOOGLE_CALLBACK_URL
  || `${process.env.PUBLIC_API_URL || 'http://localhost:5000'}/api/v1/auth/google/callback`
);

const getStateSecret = () => process.env.GOOGLE_OAUTH_STATE_SECRET
  || process.env.JWT_SECRET
  || process.env.JWT_ACCESS_SECRET
  || 'wolan-google-oauth-state-development-secret';

const base64url = (value) => Buffer
  .from(value)
  .toString('base64url');

const signStatePayload = (payload) => crypto
  .createHmac('sha256', getStateSecret())
  .update(payload)
  .digest('base64url');

const isValidStateSignature = (payload, signature) => {
  const expected = signStatePayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(signature || ''));

  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const normalizeAccountType = (value) => {
  const accountType = String(value || 'staff').trim().toLowerCase();
  return ACCOUNT_TYPES.includes(accountType) ? accountType : 'staff';
};

const sanitizeRedirectPath = (value, accountType) => {
  const fallback = accountType === 'merchant'
    ? '/merchant/dashboard'
    : accountType === 'driver'
      ? '/driver/dashboard'
      : '/dashboard';

  const candidate = String(value || '').trim();
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return fallback;
  }

  if (accountType === 'merchant' && !candidate.startsWith('/merchant')) {
    return fallback;
  }

  if (accountType === 'driver' && !candidate.startsWith('/driver')) {
    return fallback;
  }

  if (accountType === 'staff' && (candidate.startsWith('/merchant') || candidate.startsWith('/driver'))) {
    return fallback;
  }

  return candidate;
};

const sanitizeStateValue = (value, maxLength = 160) => String(value || '')
  .trim()
  .slice(0, maxLength);

const readDeviceState = (query = {}) => ({
  device_id: sanitizeStateValue(query.device_id, 120),
  device_label: sanitizeStateValue(query.device_label, 160),
  device_platform: sanitizeStateValue(query.device_platform, 80),
  device_compromised: sanitizeStateValue(query.device_compromised, 10),
  device_rooted: sanitizeStateValue(query.device_rooted, 10),
  device_jailbroken: sanitizeStateValue(query.device_jailbroken, 10),
});

const buildState = ({ accountType, returnTo, device }) => {
  const payload = base64url(JSON.stringify({
    accountType,
    returnTo,
    device,
    nonce: crypto.randomBytes(16).toString('hex'),
    issuedAt: Date.now(),
  }));

  return `${payload}.${signStatePayload(payload)}`;
};

const parseState = (state) => {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature || !isValidStateSignature(payload, signature)) {
    throw new AppError('Invalid Google authentication state', 400);
  }

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!parsed.issuedAt || Date.now() - Number(parsed.issuedAt) > OAUTH_STATE_MAX_AGE_MS) {
    throw new AppError('Google authentication state expired. Please try again.', 400);
  }

  const accountType = normalizeAccountType(parsed.accountType);
  return {
    accountType,
    returnTo: sanitizeRedirectPath(parsed.returnTo, accountType),
    device: parsed.device || {},
  };
};

const redirectToFrontend = (res, path, params = {}) => {
  const url = new URL(path, getFrontendBaseUrl());
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return res.redirect(url.toString());
};

const redirectWithOAuthError = (res, accountType, message) => {
  const loginPath = accountType === 'merchant'
    ? '/merchant-login'
    : accountType === 'driver'
      ? '/driver-login'
      : '/login';

  return redirectToFrontend(res, loginPath, {
    auth_error: message || 'Google login failed. Please try again.',
  });
};

const pruneOAuthSessions = () => {
  const now = Date.now();
  oauthSessionStore.forEach((session, code) => {
    if (!session?.expiresAt || session.expiresAt <= now) {
      oauthSessionStore.delete(code);
    }
  });
};

const createOAuthSessionCode = (session) => {
  pruneOAuthSessions();
  const code = crypto.randomBytes(32).toString('base64url');
  oauthSessionStore.set(code, {
    ...session,
    expiresAt: Date.now() + OAUTH_SESSION_MAX_AGE_MS,
  });
  return code;
};

const buildOAuthUserResponse = (user) => ({
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
  account_locked: user.account_locked,
  locked_at: user.locked_at,
  locked_reason: user.locked_reason,
  unlocked_at: user.unlocked_at,
  last_login: user.last_login,
});

const buildOAuthMerchantResponse = (merchant) => ({
  id: merchant._id,
  merchant_name: merchant.merchant_name,
  shop_name: merchant.shop_name,
  email: merchant.email,
  phone: merchant.phone,
  role: 'merchant',
  hub_id: merchant.hub_id,
  status: merchant.status,
  is_active: merchant.status === 'active',
  kyc_status: merchant.kyc_status,
  kyc_verified_at: merchant.kyc_verified_at,
  kyc_rejection_reason: merchant.kyc_rejection_reason,
  account_locked: merchant.account_locked,
  locked_at: merchant.locked_at,
  locked_reason: merchant.locked_reason,
  unlocked_at: merchant.unlocked_at,
  last_login: merchant.last_login,
});

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

const setUserAuthCookies = (res, accessToken, refreshToken) => {
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

const setMerchantAuthCookies = (res, accessToken, refreshToken) => {
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

const createUserTokens = (user) => {
  const payload = {
    id: user._id,
    role: user.role,
    hub_id: user.hub_id,
    assigned_hub_ids: user.assigned_hub_ids || [],
    email: user.email,
  };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_OAUTH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    const timeoutMessage = error.name === 'AbortError'
      ? `Google OAuth request timed out after ${GOOGLE_OAUTH_TIMEOUT_MS}ms`
      : 'Google OAuth request failed';
    throw new AppError(timeoutMessage, 502);
  } finally {
    clearTimeout(timeout);
  }
};

const exchangeGoogleCode = async (code) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getGoogleCallbackUrl();

  if (!clientId || !clientSecret) {
    throw new AppError('Google login is not configured on the backend', 503);
  }

  const response = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new AppError(payload.error_description || payload.error || 'Google token exchange failed', 502);
  }

  return payload;
};

const fetchGoogleProfile = async (accessToken) => {
  const response = await fetchWithTimeout(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const profile = await response.json();
  if (!response.ok) {
    throw new AppError(profile.error_description || profile.error || 'Google profile lookup failed', 502);
  }

  if (!profile.email || profile.email_verified === false) {
    throw new AppError('Google account email must be verified before login', 403);
  }

  return {
    email: String(profile.email).trim().toLowerCase(),
    name: profile.name,
    picture: profile.picture,
    google_id: profile.sub,
  };
};

const buildDeviceRequest = (req, device = {}) => ({
  ...req,
  headers: {
    ...req.headers,
    'x-wolan-device-id': device.device_id || req.headers['x-wolan-device-id'],
    'x-wolan-device-label': device.device_label || req.headers['x-wolan-device-label'],
    'x-wolan-device-platform': device.device_platform || req.headers['x-wolan-device-platform'],
    'x-wolan-device-compromised': device.device_compromised || req.headers['x-wolan-device-compromised'],
    'x-wolan-device-rooted': device.device_rooted || req.headers['x-wolan-device-rooted'],
    'x-wolan-device-jailbroken': device.device_jailbroken || req.headers['x-wolan-device-jailbroken'],
  },
});

const loginGoogleMerchant = async ({ profile, res }) => {
  const merchant = await Merchant.findOne({ email: profile.email }).select('+refresh_token_hash');
  if (!merchant) {
    throw new AppError('No merchant account exists for this Google email. Register first or use the merchant account email.', 404);
  }

  if (merchant.status !== 'active') {
    throw new AppError('Merchant account is not active', 403);
  }

  assertAccountCanLogin(merchant, 'Merchant account');
  clearFailedLogin(merchant);
  merchant.last_login = new Date();

  const { accessToken, refreshToken } = createMerchantTokens(merchant);
  merchant.refresh_token_hash = hashMerchantToken(refreshToken);
  await merchant.save({ validateBeforeSave: false });

  setMerchantAuthCookies(res, accessToken, refreshToken);
  return { merchant, accessToken, refreshToken };
};

const loginGoogleUser = async ({ profile, accountType, req, res, device }) => {
  const roleQuery = accountType === 'driver'
    ? { role: 'rider' }
    : { role: { $in: STAFF_ROLES } };

  const user = await User.findOne({ email: profile.email, ...roleQuery }).select('+refresh_token_hash');
  if (!user) {
    throw new AppError(
      accountType === 'driver'
        ? 'No rider account exists for this Google email. Register first or use the rider account email.'
        : 'No admin/staff account exists for this Google email.',
      404
    );
  }

  if (!user.is_active) {
    if (accountType !== 'driver') {
      throw new AppError('Account is inactive', 403);
    }

    const rider = await Rider.findOne({ user_id: user._id })
      .select('is_active suspension_reason suspended_at restriction_type restriction_reason restriction_started_at restriction_expires_at restriction_reinstatement_state');
    const restriction = rider ? getRiderRestrictionSnapshot(rider) : null;
    if (!restriction?.active) {
      throw new AppError('Account is inactive', 403);
    }
  }

  assertAccountCanLogin(user, 'Account');
  if (accountType === 'driver') {
    await ensureRiderDeviceAllowed({ user, req: buildDeviceRequest(req, device) });
  }

  clearFailedLogin(user);
  user.last_login = new Date();
  const { accessToken, refreshToken } = createUserTokens(user);
  user.refresh_token_hash = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  setUserAuthCookies(res, accessToken, refreshToken);
  return { user, accessToken, refreshToken };
};

const startGoogleLogin = (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return redirectWithOAuthError(res, normalizeAccountType(req.query.account), 'Google login is not configured yet.');
  }

  const accountType = normalizeAccountType(req.query.account);
  const returnTo = sanitizeRedirectPath(req.query.return_to, accountType);
  const state = buildState({
    accountType,
    returnTo,
    device: readDeviceState(req.query),
  });

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', getGoogleCallbackUrl());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  return res.redirect(authUrl.toString());
};

const googleCallback = async (req, res) => {
  let stateContext = { accountType: 'staff', returnTo: '/dashboard', device: {} };

  try {
    if (req.query.error) {
      throw new AppError(String(req.query.error_description || req.query.error), 400);
    }

    if (!req.query.code) {
      throw new AppError('Google authorization code is missing', 400);
    }

    stateContext = parseState(req.query.state);
    const googleTokens = await exchangeGoogleCode(String(req.query.code));
    const profile = await fetchGoogleProfile(googleTokens.access_token);

    let oauthSession;
    if (stateContext.accountType === 'merchant') {
      const { merchant, accessToken, refreshToken } = await loginGoogleMerchant({ profile, res });
      oauthSession = {
        accountType: stateContext.accountType,
        accessToken,
        refreshToken,
        merchant: buildOAuthMerchantResponse(merchant),
      };
    } else {
      const { user, accessToken, refreshToken } = await loginGoogleUser({
        profile,
        accountType: stateContext.accountType,
        req,
        res,
        device: stateContext.device,
      });
      oauthSession = {
        accountType: stateContext.accountType,
        accessToken,
        refreshToken,
        user: buildOAuthUserResponse(user),
      };
    }

    const oauthCode = createOAuthSessionCode(oauthSession);

    return redirectToFrontend(res, stateContext.returnTo, {
      oauth: 'google',
      account: stateContext.accountType,
      oauth_code: oauthCode,
    });
  } catch (error) {
    return redirectWithOAuthError(
      res,
      stateContext.accountType,
      error.message || 'Google login failed. Please try again.'
    );
  }
};

const exchangeGoogleSession = asyncHandler(async (req, res) => {
  const code = String(req.body.code || req.query.code || '').trim();
  const requestedAccountType = normalizeAccountType(req.body.account || req.query.account);

  if (!code) {
    throw new AppError('Google OAuth session code is required', 400);
  }

  pruneOAuthSessions();
  const session = oauthSessionStore.get(code);
  oauthSessionStore.delete(code);

  if (!session || session.expiresAt <= Date.now()) {
    throw new AppError('Google OAuth session expired. Please sign in again.', 401);
  }

  if (requestedAccountType && session.accountType !== requestedAccountType) {
    throw new AppError('Google OAuth session account type mismatch', 400);
  }

  if (session.accountType === 'merchant') {
    setMerchantAuthCookies(res, session.accessToken, session.refreshToken);
    return successResponse(res, 'Google session restored successfully', {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      merchant: session.merchant,
    });
  }

  setUserAuthCookies(res, session.accessToken, session.refreshToken);
  return successResponse(res, 'Google session restored successfully', {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: session.user,
  });
});

const googleStatus = (req, res) => successResponse(res, 'Google OAuth status', {
  configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  callback_url: getGoogleCallbackUrl(),
});

module.exports = {
  googleCallback,
  exchangeGoogleSession,
  googleStatus,
  startGoogleLogin,
};
