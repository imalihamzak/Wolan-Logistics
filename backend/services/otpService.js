const crypto = require('crypto');

const OtpChallenge = require('../models/OtpChallenge');
const AppError = require('../utils/AppError');
const notificationService = require('./notificationService');
const { hashToken } = require('../utils/token');

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const OTP_REGISTRATION_TOKEN_MINUTES = Number(process.env.OTP_REGISTRATION_TOKEN_MINUTES || 15);

const ACCOUNT_LABELS = {
  merchant: 'merchant',
  driver: 'driver',
};

const PURPOSE_LABELS = {
  login: 'login',
  register: 'registration',
};

const normalizePhoneKey = (phone) => String(phone || '').replace(/[^0-9]/g, '');

const phoneCandidates = (phone) => {
  const raw = String(phone || '').trim();
  const normalized = normalizePhoneKey(raw);
  return [...new Set([raw, normalized, normalized ? `+${normalized}` : null].filter(Boolean))];
};

const secondsUntil = (date, now = new Date()) => Math.max(
  0,
  Math.ceil((new Date(date).getTime() - now.getTime()) / 1000)
);

const createOtpError = (message, statusCode, details = null) => {
  const error = new AppError(message, statusCode);
  if (details) {
    error.errors = details;
  }
  return error;
};

const generateOtp = () => crypto.randomInt(1000, 10000).toString();

const generateVerificationToken = () => crypto.randomBytes(32).toString('hex');

const hashOtp = ({ otp, salt, phoneKey, accountType, purpose }) => (
  hashToken(`${salt}:${phoneKey}:${accountType}:${purpose}:${otp}`)
);

const isSameHash = (left, right) => {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
};

const assertOtpScope = (accountType, purpose) => {
  if (!ACCOUNT_LABELS[accountType]) {
    throw new AppError('account_type is invalid', 400);
  }

  if (!PURPOSE_LABELS[purpose]) {
    throw new AppError('purpose is invalid', 400);
  }
};

const sendOtpChallenge = async ({
  phone,
  accountType,
  purpose,
  recipient = {},
  request = null,
}) => {
  assertOtpScope(accountType, purpose);

  const now = new Date();
  const phoneKey = normalizePhoneKey(phone);
  if (phoneKey.length < 8) {
    throw new AppError('phone is invalid', 400);
  }

  const activeFilter = {
    phone_key: phoneKey,
    account_type: accountType,
    purpose,
    consumed_at: null,
    expires_at: { $gt: now },
  };

  const activeChallenge = await OtpChallenge.findOne(activeFilter).sort({ createdAt: -1 });
  if (activeChallenge?.locked_until && activeChallenge.locked_until > now) {
    throw createOtpError('Too many wrong OTP attempts. Request a new code after the lock expires.', 429, {
      retry_after_seconds: secondsUntil(activeChallenge.locked_until, now),
      reason: 'attempt_limit',
    });
  }

  if (activeChallenge?.resend_available_at && activeChallenge.resend_available_at > now) {
    throw createOtpError('Please wait before requesting another OTP.', 429, {
      retry_after_seconds: secondsUntil(activeChallenge.resend_available_at, now),
      reason: 'resend_cooldown',
    });
  }

  await OtpChallenge.updateMany(
    {
      phone_key: phoneKey,
      account_type: accountType,
      purpose,
      consumed_at: null,
    },
    { $set: { consumed_at: now } }
  );

  const otp = generateOtp();
  const salt = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const resendAvailableAt = new Date(now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000);

  const challenge = await OtpChallenge.create({
    phone: String(phone).trim(),
    phone_key: phoneKey,
    account_type: accountType,
    purpose,
    otp_hash: hashOtp({ otp, salt, phoneKey, accountType, purpose }),
    otp_salt: salt,
    expires_at: expiresAt,
    resend_available_at: resendAvailableAt,
    max_attempts: OTP_MAX_ATTEMPTS,
    requester_ip: request?.ip || null,
    user_agent: request?.headers?.['user-agent'] || null,
  });

  try {
    await notificationService.send(
      'sms',
      'otp',
      {
        id: recipient.id || recipient._id || challenge._id,
        phone: String(phone).trim(),
        email: recipient.email,
      },
      'auth_otp',
      {
        otp,
        account_type: ACCOUNT_LABELS[accountType],
        purpose: PURPOSE_LABELS[purpose],
        expires_minutes: OTP_EXPIRY_MINUTES,
      },
      {
        priority: 'high',
        related_type: recipient.related_type || null,
        related_id: recipient.related_id || null,
        metadata: {
          account_type: accountType,
          purpose,
          challenge_id: String(challenge._id),
        },
        wait_for_provider: true,
      }
    );
  } catch (error) {
    challenge.consumed_at = new Date();
    await challenge.save({ validateBeforeSave: false });
    throw createOtpError('OTP could not be sent. Please try again.', 502, [error.message]);
  }

  return {
    challenge,
    otp,
    response: {
      expires_in: OTP_EXPIRY_MINUTES * 60,
      resend_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
      max_attempts: OTP_MAX_ATTEMPTS,
      challenge_id: challenge._id,
    },
  };
};

const verifyOtpChallenge = async ({
  phone,
  accountType,
  purpose,
  otp,
  consumeOnSuccess = true,
}) => {
  assertOtpScope(accountType, purpose);

  const now = new Date();
  const phoneKey = normalizePhoneKey(phone);
  const challenge = await OtpChallenge.findOne({
    phone_key: phoneKey,
    account_type: accountType,
    purpose,
    consumed_at: null,
  })
    .sort({ createdAt: -1 })
    .select('+otp_hash +otp_salt +verification_token_hash');

  if (!challenge) {
    throw new AppError('OTP not requested or already used', 400);
  }

  if (challenge.locked_until && challenge.locked_until > now) {
    throw createOtpError('Too many wrong OTP attempts. Request a new code after the lock expires.', 429, {
      retry_after_seconds: secondsUntil(challenge.locked_until, now),
      reason: 'attempt_limit',
    });
  }

  if (challenge.expires_at <= now) {
    challenge.consumed_at = now;
    await challenge.save({ validateBeforeSave: false });
    throw new AppError('OTP expired. Request a new code.', 400);
  }

  if (challenge.verified_at) {
    throw new AppError('OTP already verified. Continue registration or request a new code.', 400);
  }

  const candidateHash = hashOtp({
    otp: String(otp || '').trim(),
    salt: challenge.otp_salt,
    phoneKey,
    accountType,
    purpose,
  });

  if (!isSameHash(candidateHash, challenge.otp_hash)) {
    challenge.attempts += 1;

    const remainingAttempts = Math.max(challenge.max_attempts - challenge.attempts, 0);
    if (remainingAttempts === 0) {
      challenge.locked_until = challenge.expires_at;
    }

    await challenge.save({ validateBeforeSave: false });

    throw createOtpError('Invalid OTP code', 400, {
      remaining_attempts: remainingAttempts,
      reason: remainingAttempts === 0 ? 'attempt_limit' : 'invalid_otp',
    });
  }

  challenge.verified_at = now;
  challenge.otp_hash = null;
  challenge.otp_salt = null;

  let registrationToken = null;
  let registrationTokenExpiresAt = null;

  if (purpose === 'register') {
    registrationToken = generateVerificationToken();
    registrationTokenExpiresAt = new Date(now.getTime() + OTP_REGISTRATION_TOKEN_MINUTES * 60 * 1000);
    challenge.verification_token_hash = hashToken(registrationToken);
    challenge.verification_token_expires_at = registrationTokenExpiresAt;
  }

  if (consumeOnSuccess && purpose === 'login') {
    challenge.consumed_at = now;
  }

  await challenge.save({ validateBeforeSave: false });

  return {
    challenge,
    registrationToken,
    registrationTokenExpiresAt,
  };
};

const consumeRegistrationOtp = async ({ phone, accountType, verificationToken }) => {
  assertOtpScope(accountType, 'register');

  const now = new Date();
  const phoneKey = normalizePhoneKey(phone);
  const challenge = await OtpChallenge.findOne({
    phone_key: phoneKey,
    account_type: accountType,
    purpose: 'register',
    consumed_at: null,
    verified_at: { $ne: null },
    verification_token_hash: hashToken(String(verificationToken || '').trim()),
    verification_token_expires_at: { $gt: now },
  }).select('+verification_token_hash');

  if (!challenge) {
    throw new AppError('Phone OTP verification is required before registration', 400);
  }

  challenge.consumed_at = now;
  await challenge.save({ validateBeforeSave: false });

  return challenge;
};

module.exports = {
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_REGISTRATION_TOKEN_MINUTES,
  normalizePhoneKey,
  phoneCandidates,
  sendOtpChallenge,
  verifyOtpChallenge,
  consumeRegistrationOtp,
};
