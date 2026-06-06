const mongoose = require('mongoose');

const otpChallengeSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    phone_key: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    account_type: {
      type: String,
      enum: ['merchant', 'driver'],
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['login', 'register'],
      required: true,
      index: true,
    },
    otp_hash: {
      type: String,
      default: null,
      select: false,
    },
    otp_salt: {
      type: String,
      default: null,
      select: false,
    },
    expires_at: {
      type: Date,
      required: true,
      index: true,
    },
    resend_available_at: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    max_attempts: {
      type: Number,
      default: 5,
    },
    locked_until: {
      type: Date,
      default: null,
    },
    verified_at: {
      type: Date,
      default: null,
    },
    consumed_at: {
      type: Date,
      default: null,
      index: true,
    },
    verification_token_hash: {
      type: String,
      default: null,
      select: false,
    },
    verification_token_expires_at: {
      type: Date,
      default: null,
    },
    sent_count: {
      type: Number,
      default: 1,
    },
    requester_ip: {
      type: String,
      default: null,
      trim: true,
    },
    user_agent: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

otpChallengeSchema.index({
  phone_key: 1,
  account_type: 1,
  purpose: 1,
  consumed_at: 1,
  createdAt: -1,
});

otpChallengeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('OtpChallenge', otpChallengeSchema);
