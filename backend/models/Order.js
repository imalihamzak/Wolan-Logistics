const crypto = require('crypto');

const mongoose = require('mongoose');

const { PACKAGE_SIZES, DEFAULT_PACKAGE_SIZE } = require('../constants/dispatchConstants');

const PICKUP_KEY_ATTEMPTS = 250;

const generatePickupKeyCandidate = () => String(crypto.randomInt(1000, 10000));

const generateUniquePickupKey = async (OrderModel, excludeId = null, reservedKeys = null) => {
  for (let attempt = 0; attempt < PICKUP_KEY_ATTEMPTS; attempt += 1) {
    const candidate = generatePickupKeyCandidate();
    if (reservedKeys?.has(candidate)) {
      continue;
    }

    const query = { pickup_key: candidate };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    // eslint-disable-next-line no-await-in-loop
    const exists = await OrderModel.exists(query);
    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique pickup key');
};

const updateObjectHasPickupKey = (value = {}) => (
  Object.prototype.hasOwnProperty.call(value, 'pickup_key')
);

const pricingFields = [
  'delivery_fee',
  'pricing_currency',
  'pricing_distance_km',
  'pricing_distance_meters',
  'pricing_duration_seconds',
  'pricing_source',
  'pricing_tier_label',
  'pricing_calculated_at',
  'route_geometry',
  'service_level',
  'express_requested',
];

const pricingUpdateOperators = [
  '$set',
  '$setOnInsert',
  '$unset',
  '$rename',
  '$inc',
  '$mul',
  '$min',
  '$max',
];

const updateTouchesPickupKey = (update = {}) => (
  updateObjectHasPickupKey(update)
  || updateObjectHasPickupKey(update.$set)
  || updateObjectHasPickupKey(update.$setOnInsert)
  || updateObjectHasPickupKey(update.$unset)
  || updateObjectHasPickupKey(update.$rename)
  || Object.values(update.$rename || {}).includes('pickup_key')
);

const updateTouchesPricing = (update = {}) => {
  const isPricingPath = (path = '') => pricingFields.some((field) => (
    path === field || path.startsWith(`${field}.`)
  ));
  const hasPricingField = (value = {}) => Object.keys(value || {}).some(isPricingPath);

  return hasPricingField(update)
    || pricingUpdateOperators.some((operator) => hasPricingField(update[operator]))
    || Object.values(update.$rename || {}).some(isPricingPath);
};

const pricingIsComplete = (order) => (
  Number.isFinite(Number(order.delivery_fee))
  && Number(order.delivery_fee) > 0
  && Number.isFinite(Number(order.pricing_distance_km))
  && Number.isFinite(Number(order.pricing_distance_meters))
  && Boolean(order.pricing_source)
  && Boolean(order.pricing_tier_label)
  && Boolean(order.pricing_calculated_at)
  && Boolean(order.pricing_currency)
  && ['standard', 'express'].includes(order.service_level)
);

const buildMerchantStatus = (order) => {
  if (order.order_status === 'delivered') {
    return { key: 'delivered', label: 'Delivered' };
  }

  if (order.order_status === 'failed') {
    return { key: 'failed', label: 'Failed' };
  }

  if (order.order_status === 'returned') {
    return { key: 'returned', label: 'Returned' };
  }

  if (order.order_status === 'out_for_delivery') {
    return { key: 'out_for_delivery', label: 'Out for Delivery' };
  }

  if (order.hub_scan_in || order.order_status === 'at_hub') {
    return { key: 'package_at_hub', label: 'Package at Hub' };
  }

  if (order.assignment_response_status === 'accepted') {
    return { key: 'out_for_delivery', label: 'Out for Delivery' };
  }

  if (order.rider_id || order.assigned_at) {
    return { key: 'heading_to_hub', label: 'Heading to Hub' };
  }

  return { key: 'pending', label: 'Pending' };
};

const orderHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    updated_by_role: {
      type: String,
      default: 'system',
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const activityLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
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

// GPS Location schema (shared with Rider)
const gpsLocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [0, 0],
    },
  },
  { _id: false }
);

const routeGeometrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['LineString'],
      required: true,
    },
    coordinates: {
      type: [[Number]],
      required: true,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    merchant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    rider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    customer_name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    customer_phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    delivery_address: {
      type: String,
      required: true,
      trim: true,
    },
    pickup_address: {
      type: String,
      default: null,
      trim: true,
    },
    dropoff_address: {
      type: String,
      default: null,
      trim: true,
    },
    pickup_coordinates: {
      type: gpsLocationSchema,
      default: null,
    },
    dropoff_coordinates: {
      type: gpsLocationSchema,
      default: null,
    },
    item_description: {
      type: String,
      required: true,
      trim: true,
    },
    declared_value: {
      type: Number,
      default: 0,
    },
    package_size: {
      type: String,
      enum: PACKAGE_SIZES,
      default: DEFAULT_PACKAGE_SIZE,
      lowercase: true,
      trim: true,
      index: true,
    },
    order_status: {
      type: String,
      enum: ['pending', 'picked_up', 'at_hub', 'out_for_delivery', 'delivered', 'failed', 'returned'],
      default: 'pending',
      index: true,
    },
    otp_code: {
      type: String,
      default: null,
      select: false,
    },
    pickup_key: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      match: [/^\d{4}$/, 'pickup_key must be a 4 digit code'],
    },
    package_tracking_id: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    physical_tracker_id: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      index: true,
    },
    physical_tracker_linked_at: {
      type: Date,
      default: null,
    },
    tracker_last_location: {
  latitude: {
    type: Number,
    default: null,
  },
  longitude: {
    type: Number,
    default: null,
  },
  updated_at: {
    type: Date,
    default: null,
  },
},

tracker_divergence_alert: {
  type: Boolean,
  default: false,
},

tracker_divergence_distance: {
  type: Number,
  default: 0,
},
    rider_tracking_id: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    qr_code: {
      type: String,
      default: null,
    },
    hub_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
      index: true,
    },
    delivery_zone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    delivery_fee: {
      type: Number,
      default: 0,
      immutable: true,
    },
    pricing_currency: {
      type: String,
      default: 'UGX',
      immutable: true,
      trim: true,
    },
    pricing_distance_km: {
      type: Number,
      default: null,
      immutable: true,
    },
    pricing_distance_meters: {
      type: Number,
      default: null,
      immutable: true,
    },
    pricing_duration_seconds: {
      type: Number,
      default: null,
      immutable: true,
    },
    pricing_source: {
      type: String,
      enum: [
        'google_distance_matrix',
        'haversine_fallback',
        'openrouteservice_directions_driving-car',
        null,
      ],
      default: null,
      immutable: true,
    },
    pricing_tier_label: {
      type: String,
      default: null,
      immutable: true,
      trim: true,
    },
    pricing_calculated_at: {
      type: Date,
      default: null,
      immutable: true,
    },
    service_level: {
      type: String,
      enum: ['standard', 'express'],
      default: 'standard',
      immutable: true,
      lowercase: true,
      trim: true,
    },
    express_requested: {
      type: Boolean,
      default: false,
      immutable: true,
    },
    route_geometry: {
      type: routeGeometrySchema,
      default: null,
      immutable: true,
    },
    cod_amount: {
      type: Number,
      default: 0,
    },
    batch_id: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    delivery_attempts: {
      type: Number,
      default: 0,
    },
    assignment_response_status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired', null],
      default: null,
    },
    assignment_response_due_at: {
      type: Date,
      default: null,
    },
    accepted_at: {
      type: Date,
      default: null,
    },
    rejected_at: {
      type: Date,
      default: null,
    },
    rejected_reason: {
      type: String,
      default: null,
      trim: true,
    },
    custody_confirmed_at: {
      type: Date,
      default: null,
    },
    handover_verified: {
      type: Boolean,
      default: false,
    },
    custody_scan_payload: {
      type: String,
      default: null,
      trim: true,
    },
    failed_reason: {
      type: String,
      default: null,
      trim: true,
    },
    return_reason: {
      type: String,
      default: null,
      trim: true,
    },
    return_fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    return_fee_currency: {
      type: String,
      default: 'UGX',
      uppercase: true,
      trim: true,
    },
    return_fee_rule: {
      type: String,
      default: null,
      trim: true,
    },
    return_fee_recorded_at: {
      type: Date,
      default: null,
    },
    assigned_at: {
      type: Date,
      default: null,
    },
    picked_up_at: {
      type: Date,
      default: null,
    },
    at_hub_at: {
      type: Date,
      default: null,
    },
    hub_scan_in: {
      type: Date,
      default: null,
    },
    out_for_delivery_at: {
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
    returned_at: {
      type: Date,
      default: null,
    },
    customer_rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    customer_rating_note: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    customer_rating_at: {
      type: Date,
      default: null,
    },
    otp_verified_at: {
      type: Date,
      default: null,
    },
    manual_otp_override: {
      type: Boolean,
      default: false,
    },
    manual_otp_override_reason: {
      type: String,
      default: null,
      trim: true,
    },
    manual_otp_override_at: {
      type: Date,
      default: null,
    },
    manual_otp_override_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    delivery_proof_upload_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Upload',
      default: null,
    },
    delivery_proof_uploaded_at: {
      type: Date,
      default: null,
    },
    return_proof_upload_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Upload',
      default: null,
    },
    return_proof_uploaded_at: {
      type: Date,
      default: null,
    },
    rider_finance_recorded_at: {
      type: Date,
      default: null,
    },
    rider_finance_recorded_status: {
      type: String,
      enum: ['delivered', 'failed', 'returned', null],
      default: null,
    },
    rider_finance_payout_amount: {
      type: Number,
      default: 0,
    },
    rider_finance_cod_amount: {
      type: Number,
      default: 0,
    },
    package_gps_location: {
      type: gpsLocationSchema,
      default: { type: 'Point', coordinates: [0, 0] },
    },
    package_last_update: {
      type: Date,
      default: null,
    },
    status_history: {
      type: [orderHistorySchema],
      default: [],
    },
    activity_logs: {
      type: [activityLogSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for optimized queries
orderSchema.index({ hub_id: 1, delivery_zone: 1, order_status: 1, createdAt: -1 });
orderSchema.index({ merchant_id: 1, order_status: 1 });
orderSchema.index({ rider_id: 1, order_status: 1 });
orderSchema.index({ batch_id: 1, createdAt: -1 });
orderSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // 90 days TTL
orderSchema.index({ 'package_gps_location': '2dsphere' });
orderSchema.index({ pickup_key: 1 }, { unique: true, sparse: true });

// Text indexes for search
orderSchema.index({ customer_name: 'text', delivery_address: 'text', package_tracking_id: 'text' });

orderSchema.statics.generatePickupKey = function generatePickupKey({ excludeId = null, reservedKeys = null } = {}) {
  return generateUniquePickupKey(this, excludeId, reservedKeys);
};

orderSchema.pre('validate', async function assignPickupKey(next) {
  try {
    if (!this.pickup_key) {
      const pickupKey = await this.constructor.generatePickupKey({ excludeId: this._id });
      this.set('pickup_key', pickupKey, undefined, { overwriteImmutable: true });
      this.$locals.generatedPickupKey = true;
    }

    next();
  } catch (error) {
    next(error);
  }
});

orderSchema.pre('validate', function requireCalculatedPricingForNewOrders(next) {
  if (this.isNew && !pricingIsComplete(this)) {
    return next(new Error('new orders must include backend-calculated delivery pricing'));
  }

  return next();
});

orderSchema.pre('save', function preventPickupKeyMutation(next) {
  if (!this.isNew && this.isModified('pickup_key') && !this.$locals.generatedPickupKey) {
    return next(new Error('pickup_key cannot be modified after generation'));
  }

  return next();
});

orderSchema.pre('save', function preventPricingMutation(next) {
  if (!this.isNew && pricingFields.some((field) => this.isModified(field))) {
    return next(new Error('delivery pricing is calculated automatically and cannot be modified after order creation'));
  }

  return next();
});

orderSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function preventPickupKeyUpdates(next) {
  if (updateTouchesPickupKey(this.getUpdate())) {
    return next(new Error('pickup_key cannot be modified after generation'));
  }

  return next();
});

orderSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function preventPricingUpdates(next) {
  if (updateTouchesPricing(this.getUpdate())) {
    return next(new Error('delivery pricing is calculated automatically and cannot be modified after order creation'));
  }

  return next();
});

orderSchema.pre(['replaceOne', 'findOneAndReplace'], function preventImmutableReplacement(next) {
  return next(new Error('orders cannot be replaced because pickup key and delivery pricing fields are immutable'));
});

orderSchema.methods.toPublicJSON = function toPublicJSON() {
  const merchantStatus = buildMerchantStatus(this);

  return {
    id: this._id,
    order_id: this.order_id,
    merchant_id: this.merchant_id,
    rider_id: this.rider_id,
    customer_name: this.customer_name,
    customer_phone: this.customer_phone,
    delivery_address: this.delivery_address,
    pickup_address: this.pickup_address,
    dropoff_address: this.dropoff_address,
    pickup_coordinates: this.pickup_coordinates,
    dropoff_coordinates: this.dropoff_coordinates,
    item_description: this.item_description,
    declared_value: this.declared_value,
    package_size: this.package_size,
    order_status: this.order_status,
    merchant_status: merchantStatus.label,
    merchant_status_key: merchantStatus.key,
    pickup_key: this.pickup_key,
    package_tracking_id: this.package_tracking_id,
    physical_tracker_id: this.physical_tracker_id,
    physical_tracker_linked_at: this.physical_tracker_linked_at,
    rider_tracking_id: this.rider_tracking_id,
    qr_code: this.qr_code,
    hub_id: this.hub_id,
    delivery_zone: this.delivery_zone,
    delivery_fee: this.delivery_fee,
    pricing_currency: this.pricing_currency,
    pricing_distance_km: this.pricing_distance_km,
    pricing_distance_meters: this.pricing_distance_meters,
    pricing_duration_seconds: this.pricing_duration_seconds,
    pricing_source: this.pricing_source,
    pricing_tier_label: this.pricing_tier_label,
    pricing_calculated_at: this.pricing_calculated_at,
    route_geometry: this.route_geometry,
    service_level: this.service_level,
    express_requested: this.express_requested,
    cod_amount: this.cod_amount,
    batch_id: this.batch_id,
    delivery_attempts: this.delivery_attempts,
    assignment_response_status: this.assignment_response_status,
    assignment_response_due_at: this.assignment_response_due_at,
    accepted_at: this.accepted_at,
    rejected_at: this.rejected_at,
    rejected_reason: this.rejected_reason,
    custody_confirmed_at: this.custody_confirmed_at,
    handover_verified: this.handover_verified,
    custody_scan_payload: this.custody_scan_payload,
    failed_reason: this.failed_reason,
    return_reason: this.return_reason,
    return_fee: this.return_fee,
    return_fee_currency: this.return_fee_currency,
    return_fee_rule: this.return_fee_rule,
    return_fee_recorded_at: this.return_fee_recorded_at,
    assigned_at: this.assigned_at,
    picked_up_at: this.picked_up_at,
    at_hub_at: this.at_hub_at,
    hub_scan_in: this.hub_scan_in,
    out_for_delivery_at: this.out_for_delivery_at,
    delivered_at: this.delivered_at,
    failed_at: this.failed_at,
    returned_at: this.returned_at,
    customer_rating: this.customer_rating,
    customer_rating_note: this.customer_rating_note,
    customer_rating_at: this.customer_rating_at,
    otp_verified_at: this.otp_verified_at,
    manual_otp_override: this.manual_otp_override,
    manual_otp_override_reason: this.manual_otp_override_reason,
    manual_otp_override_at: this.manual_otp_override_at,
    manual_otp_override_by: this.manual_otp_override_by,
    delivery_proof_upload_id: this.delivery_proof_upload_id,
    delivery_proof_uploaded_at: this.delivery_proof_uploaded_at,
    return_proof_upload_id: this.return_proof_upload_id,
    return_proof_uploaded_at: this.return_proof_uploaded_at,
    rider_finance_recorded_at: this.rider_finance_recorded_at,
    rider_finance_recorded_status: this.rider_finance_recorded_status,
    rider_finance_payout_amount: this.rider_finance_payout_amount,
    rider_finance_cod_amount: this.rider_finance_cod_amount,
    tracker_last_location: this.tracker_last_location,
    tracker_divergence_alert: this.tracker_divergence_alert,
    tracker_divergence_distance: this.tracker_divergence_distance,
    package_gps_location: this.package_gps_location,
    package_last_update: this.package_last_update,
    status_history: this.status_history,
    activity_logs: this.activity_logs,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Order', orderSchema);
