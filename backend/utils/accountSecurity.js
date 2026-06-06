const AppError = require('./AppError');
const { RIDER_REQUIRED_DOCUMENT_TYPES } = require('../constants/riderConstants');

const KYC_STATUSES = ['unverified', 'not_submitted', 'pending', 'pending_review', 'verified', 'rejected'];
const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS || 3);

const normalizeKycStatus = (value) => (
  KYC_STATUSES.includes(value) ? value : 'unverified'
);

const isKycVerified = (account) => normalizeKycStatus(account?.kyc_status) === 'verified';
const hasRequiredVerifiedRiderDocuments = (riderProfile) => RIDER_REQUIRED_DOCUMENT_TYPES.every((type) =>
  riderProfile?.documents?.some((document) => document?.type === type && document?.verified === true)
);

const isRiderKycComplete = (riderProfile) => (
  isKycVerified(riderProfile)
  && riderProfile?.all_documents_verified === true
  && Boolean(String(riderProfile?.stage_chairman_phone || '').trim())
  && hasRequiredVerifiedRiderDocuments(riderProfile)
);

const isAccountLocked = (account) => (
  Boolean(account?.account_locked)
  || Boolean(account?.locked_until && account.locked_until > new Date())
);

const assertAccountCanLogin = (account, label = 'Account') => {
  if (isAccountLocked(account)) {
    throw new AppError(`${label} is locked. Contact admin to unlock this account.`, 423);
  }
};

const recordFailedLogin = async (account, reason = 'Invalid credentials') => {
  account.failed_login_attempts = Number(account.failed_login_attempts || 0) + 1;

  if (account.failed_login_attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    account.account_locked = true;
    account.locked_at = new Date();
    account.locked_reason = reason;
    account.unlocked_at = null;
    account.unlocked_by = null;
  }

  await account.save({ validateBeforeSave: false });
};

const clearFailedLogin = (account) => {
  account.failed_login_attempts = 0;
  account.account_locked = false;
  account.locked_at = null;
  account.locked_until = null;
  account.locked_reason = null;
};

const unlockAccount = async (account, actorId) => {
  clearFailedLogin(account);
  account.unlocked_at = new Date();
  account.unlocked_by = actorId || null;
  await account.save({ validateBeforeSave: false });
};

const applyKycDecision = async (account, status, actorId, reason = null) => {
  const nextStatus = normalizeKycStatus(status);

  account.kyc_status = nextStatus;
  account.kyc_verified_at = nextStatus === 'verified' ? new Date() : null;
  account.kyc_verified_by = nextStatus === 'verified' ? actorId || null : null;
  account.kyc_rejection_reason = nextStatus === 'rejected' ? reason || 'KYC rejected by admin' : null;

  await account.save({ validateBeforeSave: false });
};

module.exports = {
  KYC_STATUSES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  normalizeKycStatus,
  isKycVerified,
  hasRequiredVerifiedRiderDocuments,
  isRiderKycComplete,
  isAccountLocked,
  assertAccountCanLogin,
  recordFailedLogin,
  clearFailedLogin,
  unlockAccount,
  applyKycDecision,
};
