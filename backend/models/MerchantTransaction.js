const mongoose = require('mongoose');

const merchantTransactionSchema = new mongoose.Schema(
  {
    merchant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    hub_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ['earning', 'referral', 'cod', 'payout'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
    balance_before: {
      type: Number,
      default: 0,
    },
    balance_after: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed',
    },
    reference: {
      type: String,
      trim: true,
      index: true,
    },
    note: {
      type: String,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MerchantTransaction', merchantTransactionSchema);