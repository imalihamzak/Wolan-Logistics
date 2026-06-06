const mongoose = require('mongoose');

const hubSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    address: {
      type: String,
      trim: true,
      required: true,
    },
    city: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    state: {
      type: String,
      trim: true,
      index: true,
    },
    country: {
      type: String,
      trim: true,
      required: true,
      default: 'India',
    },
    zone: {
      type: String,
      trim: true,
      index: true,
    },
    manager_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    total_orders: {
      type: Number,
      default: 0,
    },
    total_revenue: {
      type: Number,
      default: 0,
    },
    contact_phone: {
      type: String,
      trim: true,
    },
    contact_email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    operating_hours: {
      open: { type: String, default: '08:00' },
      close: { type: String, default: '20:00' },
    },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

hubSchema.index({ city: 1, is_active: 1 });
hubSchema.index({ zone: 1, city: 1 });

// Virtual for order count
hubSchema.virtual('order_count').get(function () {
  return this.total_orders || 0;
});

module.exports = mongoose.model('Hub', hubSchema);
