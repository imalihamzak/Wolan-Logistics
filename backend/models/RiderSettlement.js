const mongoose = require('mongoose');

const {
  SETTLEMENT_TYPES,
  SETTLEMENT_STATUSES,
  SETTLEMENT_METHODS,
} = require('../constants/settlementConstants');

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: SETTLEMENT_STATUSES,
      required: true,
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
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const riderSettlementSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    rider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider',
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    hub_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: SETTLEMENT_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: SETTLEMENT_STATUSES,
      default: 'requested',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    payout_amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    cod_amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    method: {
      type: String,
      enum: SETTLEMENT_METHODS,
      default: 'mobile_money',
    },
    account_name: {
      type: String,
      default: null,
      trim: true,
    },
    account_phone: {
      type: String,
      default: null,
      trim: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    admin_note: {
      type: String,
      default: null,
      trim: true,
    },
    rejection_reason: {
      type: String,
      default: null,
      trim: true,
    },
    requested_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    requested_by_role: {
      type: String,
      default: 'rider',
      trim: true,
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approved_at: {
      type: Date,
      default: null,
    },
    rejected_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejected_at: {
      type: Date,
      default: null,
    },
    completed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    completed_at: {
      type: Date,
      default: null,
    },
    completion_reference: {
      type: String,
      default: null,
      trim: true,
    },
    status_history: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

riderSettlementSchema.index({ hub_id: 1, status: 1, createdAt: -1 });
riderSettlementSchema.index({ rider_id: 1, status: 1, createdAt: -1 });
riderSettlementSchema.index({ type: 1, status: 1 });
riderSettlementSchema.index(
  { rider_id: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: 'withdrawal',
      $or: [
        { status: 'requested' },
        { status: 'approved' },
      ],
    },
    name: 'one_active_withdrawal_per_rider',
  }
);

riderSettlementSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    reference: this.reference,
    rider_id: this.rider_id,
    user_id: this.user_id,
    hub_id: this.hub_id,
    type: this.type,
    status: this.status,
    amount: this.amount,
    payout_amount: this.payout_amount,
    cod_amount: this.cod_amount,
    method: this.method,
    account_name: this.account_name,
    account_phone: this.account_phone,
    note: this.note,
    admin_note: this.admin_note,
    rejection_reason: this.rejection_reason,
    requested_by: this.requested_by,
    requested_by_role: this.requested_by_role,
    approved_by: this.approved_by,
    approved_at: this.approved_at,
    rejected_by: this.rejected_by,
    rejected_at: this.rejected_at,
    completed_by: this.completed_by,
    completed_at: this.completed_at,
    completion_reference: this.completion_reference,
    status_history: this.status_history,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('RiderSettlement', riderSettlementSchema);
