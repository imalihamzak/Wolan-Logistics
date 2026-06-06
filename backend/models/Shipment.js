const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema(
  {
    hub_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
      index: true,
    },
    merchant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    tracking_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['created', 'picked_up', 'in_transit', 'at_hub', 'out_for_delivery', 'delivered', 'cancelled'],
      default: 'created',
      index: true,
    },
    pickup_address: {
      type: String,
      required: true,
      trim: true,
    },
    dropoff_address: {
      type: String,
      required: true,
      trim: true,
    },
    package_details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status_history: [
      {
        status: String,
        note: String,
        updated_by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        updated_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Shipment', shipmentSchema);