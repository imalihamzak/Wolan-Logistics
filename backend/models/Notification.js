const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['in_app', 'sms', 'whatsapp', 'email', 'push'],
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        'order_dispatch',
        'otp',
        'delay',
        'cod',
        'rider',
        'daily_report',
        'merchant',
        'system',
      ],
      required: true,
      index: true,
    },
    recipient_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    recipient_phone: {
      type: String,
      trim: true,
    },
    recipient_email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    recipient_fcm_token: {
      type: String,
      trim: true,
    },
    template_key: {
      type: String,
      required: true,
      trim: true,
    },
    variables: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'queued', 'sent', 'delivered', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['high', 'normal', 'low'],
      default: 'normal',
    },
    attempts: {
      type: Number,
      default: 0,
    },
    max_attempts: {
      type: Number,
      default: 3,
    },
    sent_at: {
      type: Date,
      default: null,
    },
    delivered_at: {
      type: Date,
      default: null,
    },
    failed_at: {
      type: Date,
      default: null,
    },
    failure_reason: {
      type: String,
      trim: true,
    },
    provider_response: {
      type: mongoose.Schema.Types.Mixed,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    scheduled_at: {
      type: Date,
      default: null,
    },
    sent_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    related_type: {
      type: String,
      enum: ['order', 'hub', 'rider', 'merchant', 'user', null],
      default: null,
    },
    related_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
notificationSchema.index({ status: 1, scheduled_at: 1 });
notificationSchema.index({ recipient_id: 1, category: 1 });
notificationSchema.index({ createdAt: 1, status: 1 });
notificationSchema.index({ related_type: 1, related_id: 1 });

// Virtual for display
notificationSchema.virtual('is_pending').get(function () {
  return ['pending', 'queued'].includes(this.status);
});

notificationSchema.virtual('is_completed').get(function () {
  return ['sent', 'delivered'].includes(this.status);
});

notificationSchema.virtual('is_failed').get(function () {
  return this.status === 'failed';
});

module.exports = mongoose.model('Notification', notificationSchema);
