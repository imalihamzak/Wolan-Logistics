const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/token');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const Merchant = require('../models/Merchant');
const { isAccountLocked } = require('../utils/accountSecurity');
const { ensureRiderDeviceAllowed } = require('../services/deviceSecurityService');

const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.accessToken;

  let token = cookieToken || null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    throw new AppError('Not authorized, token missing', 401);
  }

  const decoded = verifyAccessToken(token);
  const account = decoded.role === 'merchant'
    ? await Merchant.findById(decoded.id).select('status account_locked locked_until')
    : await User.findById(decoded.id).select('is_active account_locked locked_until locked_reason role hub_id assigned_hub_ids kyc_status failed_login_attempts');

  if (!account) {
    throw new AppError('Not authorized, account not found', 401);
  }

  if (decoded.role === 'merchant' && account.status !== 'active') {
    throw new AppError('Merchant account is not active', 403);
  }

  if (decoded.role !== 'merchant' && !account.is_active) {
    throw new AppError('Account is inactive', 403);
  }

  if (isAccountLocked(account)) {
    throw new AppError('Account is locked. Contact admin to unlock this account.', 423);
  }

  if (decoded.role === 'rider') {
    await ensureRiderDeviceAllowed({ user: account, req });
  }

  req.user = decoded.role === 'merchant'
    ? decoded
    : {
      ...decoded,
      role: account.role,
      hub_id: account.hub_id || null,
      assigned_hub_ids: account.assigned_hub_ids || [],
    };
  next();
});

module.exports = protect;
