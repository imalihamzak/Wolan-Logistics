const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const escalationActionSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    from_status: {
      type: String,
      default: null,
      trim: true,
    },
    to_status: {
      type: String,
      default: null,
      trim: true,
    },
    priority: {
      type: String,
      default: null,
      trim: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actor_role: {
      type: String,
      default: 'system',
      trim: true,
    },
    sla_due_at: {
      type: Date,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const merchantKycSubmissionSchema = new mongoose.Schema(
  {
    legal_business_name: {
      type: String,
      required: true,
      trim: true,
    },
    business_registration_number: {
      type: String,
      required: true,
      trim: true,
    },
    tin_number: {
      type: String,
      required: true,
      trim: true,
    },
    owner_full_name: {
      type: String,
      required: true,
      trim: true,
    },
    owner_id_number: {
      type: String,
      required: true,
      trim: true,
    },
    owner_phone: {
      type: String,
      required: true,
      trim: true,
    },
    document_links: {
      type: [String],
      default: [],
    },
    document_uploads: {
      type: [
        new mongoose.Schema(
          {
            type: {
              type: String,
              required: true,
              trim: true,
            },
            label: {
              type: String,
              required: true,
              trim: true,
            },
            upload_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Upload',
              default: null,
            },
            file_name: {
              type: String,
              default: null,
              trim: true,
            },
            url: {
              type: String,
              default: null,
              trim: true,
            },
            uploaded_at: {
              type: Date,
              default: Date.now,
            },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    document_notes: {
      type: String,
      default: null,
      trim: true,
    },
    submitted_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { _id: false }
);

const policyAcceptanceSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    audience: {
      type: String,
      enum: ['merchant', 'rider'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    version: {
      type: String,
      required: true,
      trim: true,
    },
    file_name: {
      type: String,
      required: true,
      trim: true,
    },
    accepted_at: {
      type: Date,
      required: true,
    },
    accepted_ip: {
      type: String,
      default: null,
      trim: true,
    },
    accepted_user_agent: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: false }
);

const merchantSchema = new mongoose.Schema(
  {
    merchant_name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    shop_name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    building_name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    referral_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    referred_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      default: null,
      index: true,
    },
    tier_level: {
      type: String,
      enum: ['Starter', 'Active', 'Priority', 'Elite'],
      default: 'Starter',
      index: true,
    },
    tier_manually_set: {
      type: Boolean,
      default: false,
    },
    tier_updated_at: {
      type: Date,
      default: null,
    },
    tier_updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    escalation_status: {
      type: String,
      enum: ['none', 'open', 'in_progress', 'resolved', 'dismissed'],
      default: 'none',
      index: true,
    },
    escalation_priority: {
      type: String,
      enum: ['normal', 'high', 'urgent'],
      default: 'normal',
      index: true,
    },
    escalation_reason: {
      type: String,
      default: null,
      trim: true,
    },
    escalation_sla_due_at: {
      type: Date,
      default: null,
      index: true,
    },
    escalation_opened_at: {
      type: Date,
      default: null,
    },
    escalation_resolved_at: {
      type: Date,
      default: null,
    },
    escalation_updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    escalation_action_trail: {
      type: [escalationActionSchema],
      default: [],
    },
    total_deliveries: {
      type: Number,
      default: 0,
    },
    cod_balance: {
      type: Number,
      default: 0,
    },
    earnings: {
      type: Number,
      default: 0,
    },
    qr_code: {
      type: String,
      default: null,
    },
    hub_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended'],
      default: 'active',
      index: true,
    },
    kyc_status: {
      type: String,
      enum: ['unverified', 'not_submitted', 'pending', 'pending_review', 'verified', 'rejected'],
      default: 'unverified',
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
    kyc_submission: {
      type: merchantKycSubmissionSchema,
      default: null,
    },
    policy_acceptances: {
      type: [policyAcceptanceSchema],
      default: [],
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

merchantSchema.index({ tier_level: 1, escalation_status: 1, escalation_priority: 1, escalation_sla_due_at: 1 });

merchantSchema.pre('save', async function hashMerchantPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 12);

  if (!this.isNew) {
    this.password_changed_at = new Date();
  }

  return next();
});

merchantSchema.methods.matchPassword = function matchPassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

merchantSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    merchant_name: this.merchant_name,
    shop_name: this.shop_name,
    building_name: this.building_name,
    phone: this.phone,
    email: this.email,
    address: this.address,
    referral_code: this.referral_code,
    referred_by: this.referred_by,
    tier_level: this.tier_level,
    tier_manually_set: this.tier_manually_set,
    tier_updated_at: this.tier_updated_at,
    tier_updated_by: this.tier_updated_by,
    escalation_status: this.escalation_status,
    escalation_priority: this.escalation_priority,
    escalation_reason: this.escalation_reason,
    escalation_sla_due_at: this.escalation_sla_due_at,
    escalation_opened_at: this.escalation_opened_at,
    escalation_resolved_at: this.escalation_resolved_at,
    escalation_updated_by: this.escalation_updated_by,
    escalation_action_trail: this.escalation_action_trail,
    escalation_sla_breached: Boolean(
      ['open', 'in_progress'].includes(this.escalation_status)
      && this.escalation_sla_due_at
      && this.escalation_sla_due_at < new Date()
    ),
    total_deliveries: this.total_deliveries,
    cod_balance: this.cod_balance,
    earnings: this.earnings,
    qr_code: this.qr_code,
    hub_id: this.hub_id,
    status: this.status,
    kyc_status: this.kyc_status,
    kyc_verified_at: this.kyc_verified_at,
    kyc_rejection_reason: this.kyc_rejection_reason,
    kyc_submission: this.kyc_submission,
    policy_acceptances: (this.policy_acceptances || []).map((acceptance) => ({
      key: acceptance.key,
      audience: acceptance.audience,
      title: acceptance.title,
      version: acceptance.version,
      file_name: acceptance.file_name,
      accepted_at: acceptance.accepted_at,
    })),
    failed_login_attempts: this.failed_login_attempts,
    account_locked: this.account_locked,
    locked_at: this.locked_at,
    locked_reason: this.locked_reason,
    unlocked_at: this.unlocked_at,
    last_login: this.last_login,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Merchant', merchantSchema);
