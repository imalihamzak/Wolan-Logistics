const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const accessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const signAccessToken = (payload) => jwt.sign(payload, accessSecret, {
  expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m',
});

const signRefreshToken = (payload) => jwt.sign(payload, refreshSecret, {
  expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
});

const verifyAccessToken = (token) => jwt.verify(token, accessSecret);

const verifyRefreshToken = (token) => jwt.verify(token, refreshSecret);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const generatePasswordResetToken = () => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  return {
    resetToken,
    resetTokenHash: hashToken(resetToken),
    resetTokenExpires: Date.now() + Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 15) * 60 * 1000,
  };
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  generatePasswordResetToken,
};