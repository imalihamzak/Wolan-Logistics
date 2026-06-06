const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      required: true,
      trim: true,
      alias: 'name',
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: [
        'super_admin',
        'director',
        'general_manager',
        'coo',
        'regional_manager',
        'hub_manager',
        'ops_coordinator',
        'rider',
        'merchant',
      ],
      default: 'merchant',
      required: true,
    },
    hub_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      default: null,
      index: true,
    },
    assigned_hub_ids: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      index: true,
    }],
    profile_image: {
      type: String,
      default: null,
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    kyc_status: {
      type: String,
      enum: ['not_submitted', 'pending', 'verified', 'rejected'],
      default: 'verified',
      index: true,
    },
    kyc_verified_at: {
      type: Date,
      default: null,
    },
    kyc_verified_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    kyc_rejection_reason: {
      type: String,
      default: null,
      trim: true,
    },
    failed_login_attempts: {
      type: Number,
      default: 0,
    },
    account_locked: {
      type: Boolean,
      default: false,
      index: true,
    },
    locked_at: {
      type: Date,
      default: null,
    },
    locked_until: {
      type: Date,
      default: null,
    },
    locked_reason: {
      type: String,
      default: null,
      trim: true,
    },
    unlocked_at: {
      type: Date,
      default: null,
    },
    unlocked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    last_login: {
      type: Date,
      default: null,
    },
    refresh_token_hash: {
      type: String,
      default: null,
      select: false,
    },
    password_reset_token_hash: {
      type: String,
      default: null,
      select: false,
    },
    password_reset_expires: {
      type: Date,
      default: null,
      select: false,
    },
    login_otp_code: {
      type: String,
      default: null,
      select: false,
    },
    login_otp_expires: {
      type: Date,
      default: null,
      select: false,
    },
    password_changed_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.pre('save', async function savePassword(next) {
  if (!this.isModified('password')) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) {
    this.password_changed_at = new Date();
  }
  return next();
});

userSchema.methods.matchPassword = function matchPassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Compound indexes
userSchema.index({ role: 1, hub_id: 1 });
userSchema.index({ role: 1, assigned_hub_ids: 1 });
userSchema.index({ role: 1, is_active: 1 });
userSchema.index({ email: 1, role: 1 });
userSchema.index({ role: 1, kyc_status: 1, is_active: 1 });

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    full_name: this.full_name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    hub_id: this.hub_id,
    assigned_hub_ids: this.assigned_hub_ids || [],
    profile_image: this.profile_image,
    is_active: this.is_active,
    kyc_status: this.kyc_status,
    kyc_verified_at: this.kyc_verified_at,
    kyc_rejection_reason: this.kyc_rejection_reason,
    failed_login_attempts: this.failed_login_attempts,
    account_locked: this.account_locked,
    locked_at: this.locked_at,
    locked_reason: this.locked_reason,
    unlocked_at: this.unlocked_at,
    last_login: this.last_login,
  };
};

module.exports = mongoose.model('User', userSchema);
