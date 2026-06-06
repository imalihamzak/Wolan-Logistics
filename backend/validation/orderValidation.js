const mongoose = require('mongoose');

const { PACKAGE_SIZES, DEFAULT_PACKAGE_SIZE } = require('../constants/dispatchConstants');
const { DELIVERY_SERVICE_LEVELS } = require('../constants/pricingConstants');

const allowedStatuses = ['pending', 'picked_up', 'at_hub', 'out_for_delivery', 'delivered', 'failed', 'returned'];
const deliveryIssueStatuses = ['failed', 'returned'];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+\-()\s]{7,20}$/;

const buildResult = (value, errors) => ({ value, errors });

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const toBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';
const hasOwn = (source, field) => Object.prototype.hasOwnProperty.call(source || {}, field);
const manualDeliveryFeeFields = [
  'delivery_fee',
  'deliveryFee',
  'delivery_charge',
  'deliveryCharge',
  'delivery_price',
  'deliveryPrice',
  'delivery_cost',
  'deliveryCost',
  'delivery_amount',
  'deliveryAmount',
  'shipping_fee',
  'shippingFee',
  'transport_fee',
  'transportFee',
  'rider_fee',
  'riderFee',
  'admin_fee',
  'adminFee',
  'computed_fee',
  'computedFee',
  'total_delivery_fee',
  'totalDeliveryFee',
  'order_fee',
  'orderFee',
  'distance_fee',
  'distanceFee',
  'fare',
  'fee',
  'price',
];
const hasManualDeliveryFee = (source = {}, depth = 0) => {
  if (!source || typeof source !== 'object' || depth > 3) {
    return false;
  }

  return manualDeliveryFeeFields.some((field) => hasOwn(source, field))
    || Object.values(source).some((value) => (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && hasManualDeliveryFee(value, depth + 1)
    ));
};
const readText = (value) => String(value || '').trim();
const readId = (value) => {
  if (!value) return null;
  if (typeof value === 'object') {
    return String(value._id || value.id || value.value || '').trim() || null;
  }
  return String(value).trim() || null;
};
const readLocationText = (...values) => {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'object') {
      const nestedValue = readText(value.address || value.formatted_address || value.label || value.name);
      if (nestedValue) return nestedValue;
      continue;
    }
    const textValue = readText(value);
    if (textValue) return textValue;
  }
  return '';
};
const readCoordinates = (source = {}) => {
  if (!source || typeof source !== 'object') {
    return null;
  }

  if (Array.isArray(source.coordinates)) {
    const [longitude, latitude] = source.coordinates.map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return { latitude, longitude };
  }

  const latitude = Number(source.latitude ?? source.lat);
  const longitude = Number(source.longitude ?? source.lng ?? source.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
};

const validateCoordinates = (value, label, errors) => {
  if (!value) {
    return;
  }

  if (!Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90) {
    errors.push(`${label}.latitude must be between -90 and 90`);
  }
  if (!Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180) {
    errors.push(`${label}.longitude must be between -180 and 180`);
  }
  if (value.latitude === 0 && value.longitude === 0) {
    errors.push(`${label} cannot be 0,0`);
  }
};

const validateOptionalCoordinates = (value, label, errors) => {
  if (!value) {
    return;
  }
  validateCoordinates(value, label, errors);
};

const validateCreateOrder = (req) => {
  const errors = [];
  const pickupAddress = readLocationText(req.body.pickup_address, req.body.pickup_location);
  const dropoffAddress = readLocationText(req.body.dropoff_address, req.body.dropoff_location, req.body.delivery_address);
  const value = {
    merchant_id: readId(req.body.merchant_id),
    rider_id: readId(req.body.rider_id),
    customer_name: String(req.body.customer_name || '').trim(),
    customer_phone: String(req.body.customer_phone || '').trim(),
    pickup_address: pickupAddress,
    dropoff_address: dropoffAddress,
    delivery_address: dropoffAddress,
    item_description: String(req.body.item_description || '').trim(),
    declared_value: req.body.declared_value !== undefined ? Number(req.body.declared_value) : 0,
    package_size: req.body.package_size ? String(req.body.package_size).trim().toLowerCase() : DEFAULT_PACKAGE_SIZE,
    service_level: req.body.service_level ? String(req.body.service_level).trim().toLowerCase() : 'standard',
    hub_id: readId(req.body.hub_id),
    delivery_zone: String(req.body.delivery_zone || '').trim(),
    cod_amount: req.body.cod_amount !== undefined ? Number(req.body.cod_amount) : 0,
    auto_assign: toBoolean(req.body.auto_assign),
    batch_id: req.body.batch_id ? String(req.body.batch_id).trim() : null,
    pickup_coordinates: readCoordinates(req.body.pickup_coordinates || req.body.pickup_location),
    dropoff_coordinates: readCoordinates(req.body.dropoff_coordinates || req.body.delivery_coordinates || req.body.customer_coordinates),
  };

  if (value.merchant_id && !isObjectId(value.merchant_id)) errors.push('merchant_id must be a valid ObjectId');
  if (value.rider_id && !isObjectId(value.rider_id)) errors.push('rider_id must be a valid ObjectId');
  if (value.customer_name.length < 2) errors.push('customer_name is required');
  if (!phonePattern.test(value.customer_phone)) errors.push('customer_phone is invalid');
  if (value.pickup_address.length < 3) errors.push('pickup_address is required');
  if (value.dropoff_address.length < 5) errors.push('dropoff_address is required');
  if (value.item_description.length < 2) errors.push('item_description is required');
  if (Number.isNaN(value.declared_value) || value.declared_value < 0) errors.push('declared_value must be a positive number');
  if (!PACKAGE_SIZES.includes(value.package_size)) errors.push('package_size must be one of small, medium, large, oversized');
  if (!DELIVERY_SERVICE_LEVELS.includes(value.service_level)) errors.push('service_level must be standard or express');
  if (value.hub_id && !isObjectId(value.hub_id)) errors.push('hub_id must be a valid ObjectId');
  if (value.delivery_zone.length < 2) errors.push('delivery_zone is required');
  if (hasManualDeliveryFee(req.body)) errors.push('delivery_fee is automatically calculated from GPS distance and cannot be submitted manually');
  if (Number.isNaN(value.cod_amount) || value.cod_amount < 0) errors.push('cod_amount must be a positive number');
  if (value.batch_id && value.batch_id.length < 2) errors.push('batch_id is invalid');
  validateOptionalCoordinates(value.pickup_coordinates, 'pickup_coordinates', errors);
  validateOptionalCoordinates(value.dropoff_coordinates, 'dropoff_coordinates', errors);

  return buildResult(value, errors);
};

const validateBatchOrders = (req) => {
  const errors = [];
  const orders = Array.isArray(req.body.orders) ? req.body.orders : [];

  if (orders.length === 0) {
    errors.push('orders array is required');
  }

  const value = {
    orders: orders.map((order) => ({
      merchant_id: readId(order.merchant_id),
      rider_id: readId(order.rider_id),
      customer_name: String(order.customer_name || '').trim(),
      customer_phone: String(order.customer_phone || '').trim(),
      pickup_address: readLocationText(order.pickup_address, order.pickup_location),
      dropoff_address: readLocationText(order.dropoff_address, order.dropoff_location, order.delivery_address),
      delivery_address: readLocationText(order.dropoff_address, order.dropoff_location, order.delivery_address),
      item_description: String(order.item_description || '').trim(),
      declared_value: order.declared_value !== undefined ? Number(order.declared_value) : 0,
      package_size: order.package_size ? String(order.package_size).trim().toLowerCase() : DEFAULT_PACKAGE_SIZE,
      service_level: order.service_level ? String(order.service_level).trim().toLowerCase() : 'standard',
      hub_id: readId(order.hub_id),
      delivery_zone: String(order.delivery_zone || '').trim(),
      cod_amount: order.cod_amount !== undefined ? Number(order.cod_amount) : 0,
      auto_assign: toBoolean(order.auto_assign),
      pickup_coordinates: readCoordinates(order.pickup_coordinates || order.pickup_location),
      dropoff_coordinates: readCoordinates(order.dropoff_coordinates || order.delivery_coordinates || order.customer_coordinates),
      submitted_delivery_fee: hasManualDeliveryFee(order),
    })),
  };

  value.orders.forEach((order, index) => {
    if (order.merchant_id && !isObjectId(order.merchant_id)) errors.push(`orders[${index}].merchant_id must be a valid ObjectId`);
    if (order.rider_id && !isObjectId(order.rider_id)) errors.push(`orders[${index}].rider_id must be a valid ObjectId`);
    if (order.customer_name.length < 2) errors.push(`orders[${index}].customer_name is required`);
    if (!phonePattern.test(order.customer_phone)) errors.push(`orders[${index}].customer_phone is invalid`);
    if (order.pickup_address.length < 3) errors.push(`orders[${index}].pickup_address is required`);
    if (order.dropoff_address.length < 5) errors.push(`orders[${index}].dropoff_address is required`);
    if (order.item_description.length < 2) errors.push(`orders[${index}].item_description is required`);
    if (Number.isNaN(order.declared_value) || order.declared_value < 0) errors.push(`orders[${index}].declared_value must be a positive number`);
    if (!PACKAGE_SIZES.includes(order.package_size)) errors.push(`orders[${index}].package_size must be one of small, medium, large, oversized`);
    if (!DELIVERY_SERVICE_LEVELS.includes(order.service_level)) errors.push(`orders[${index}].service_level must be standard or express`);
    if (order.hub_id && !isObjectId(order.hub_id)) errors.push(`orders[${index}].hub_id must be a valid ObjectId`);
    if (order.delivery_zone.length < 2) errors.push(`orders[${index}].delivery_zone is required`);
    if (order.submitted_delivery_fee) errors.push(`orders[${index}].delivery_fee is automatically calculated from GPS distance and cannot be submitted manually`);
    if (Number.isNaN(order.cod_amount) || order.cod_amount < 0) errors.push(`orders[${index}].cod_amount must be a positive number`);
    validateOptionalCoordinates(order.pickup_coordinates, `orders[${index}].pickup_coordinates`, errors);
    validateOptionalCoordinates(order.dropoff_coordinates, `orders[${index}].dropoff_coordinates`, errors);
  });

  return buildResult(value, errors);
};

const validatePricingEstimate = (req) => {
  const errors = [];
  const value = {
    pickup_address: readLocationText(req.body.pickup_address, req.body.pickup_location),
    dropoff_address: readLocationText(req.body.dropoff_address, req.body.dropoff_location, req.body.delivery_address),
    pickup_coordinates: readCoordinates(req.body.pickup_coordinates || req.body.pickup_location),
    dropoff_coordinates: readCoordinates(req.body.dropoff_coordinates || req.body.delivery_coordinates || req.body.customer_coordinates),
    service_level: req.body.service_level ? String(req.body.service_level).trim().toLowerCase() : 'standard',
  };

  if (!DELIVERY_SERVICE_LEVELS.includes(value.service_level)) errors.push('service_level must be standard or express');
  if (hasManualDeliveryFee(req.body)) errors.push('delivery_fee is automatically calculated from GPS distance and cannot be submitted manually');
  if (!value.pickup_coordinates && value.pickup_address.length < 3) {
    errors.push('pickup_address or pickup_coordinates is required for automatic delivery pricing');
  }
  if (!value.dropoff_coordinates && value.dropoff_address.length < 5) {
    errors.push('dropoff_address or dropoff_coordinates is required for automatic delivery pricing');
  }
  validateOptionalCoordinates(value.pickup_coordinates, 'pickup_coordinates', errors);
  validateOptionalCoordinates(value.dropoff_coordinates, 'dropoff_coordinates', errors);

  return buildResult(value, errors);
};

const validateOrderQuery = (req) => {
  const value = {
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search ? String(req.query.search).trim() : undefined,
    status: req.query.status ? String(req.query.status).trim() : undefined,
    merchant_id: req.query.merchant_id ? String(req.query.merchant_id).trim() : undefined,
    rider_id: req.query.rider_id ? String(req.query.rider_id).trim() : undefined,
    hub_id: req.query.hub_id ? String(req.query.hub_id).trim() : undefined,
    delivery_zone: req.query.delivery_zone ? String(req.query.delivery_zone).trim() : undefined,
    batch_id: req.query.batch_id ? String(req.query.batch_id).trim() : undefined,
    sort: req.query.sort ? String(req.query.sort).trim() : undefined,
    from: req.query.from ? String(req.query.from).trim() : undefined,
    to: req.query.to ? String(req.query.to).trim() : undefined,
  };

  return buildResult(value, []);
};

const validateOrderStatusUpdate = (req) => {
  const errors = [];
  const value = {
    order_status: String(req.body.order_status || '').trim(),
    note: req.body.note ? String(req.body.note).trim() : null,
  };

  if (!allowedStatuses.includes(value.order_status)) errors.push('order_status is invalid');
  if (value.order_status === 'delivered') errors.push('Use OTP verification to mark an order as delivered');
  if (deliveryIssueStatuses.includes(value.order_status)) {
    errors.push('Use failed delivery or return endpoints so proof_upload_id is required');
  }

  return buildResult(value, errors);
};

const validateAssignRider = (req) => {
  const errors = [];
  const value = {
    rider_id: req.body.rider_id ? String(req.body.rider_id).trim() : null,
    auto_assign: toBoolean(req.body.auto_assign),
    note: req.body.note ? String(req.body.note).trim() : null,
  };

  if (!value.rider_id && !value.auto_assign) errors.push('Either rider_id or auto_assign is required');
  if (value.rider_id && !isObjectId(value.rider_id)) errors.push('rider_id must be a valid ObjectId');

  return buildResult(value, errors);
};

const validateOtpVerification = (req) => {
  const errors = [];
  const value = {
    otp_code: String(req.body.otp_code || '').trim(),
    proof_upload_id: req.body.proof_upload_id ? String(req.body.proof_upload_id).trim() : null,
    note: req.body.note ? String(req.body.note).trim() : null,
  };

  if (value.otp_code.length !== 4) errors.push('otp_code must be a 4 digit code');
  if (!value.proof_upload_id || !isObjectId(value.proof_upload_id)) errors.push('proof_upload_id is required');

  return buildResult(value, errors);
};

const validateManualOtpOverride = (req) => {
  const errors = [];
  const value = {
    reason: String(req.body.reason || '').trim(),
    proof_upload_id: req.body.proof_upload_id ? String(req.body.proof_upload_id).trim() : null,
  };

  if (value.reason.length < 5) errors.push('reason is required for manual OTP override');
  if (!value.proof_upload_id || !isObjectId(value.proof_upload_id)) errors.push('proof_upload_id is required for manual OTP override');

  return buildResult(value, errors);
};

const validateDeliveryIssue = (req) => {
  const errors = [];
  const value = {
    reason: String(req.body.reason || '').trim(),
    proof_upload_id: req.body.proof_upload_id ? String(req.body.proof_upload_id).trim() : null,
  };

  if (value.reason.length < 3) errors.push('reason is required');
  if (!value.proof_upload_id || !isObjectId(value.proof_upload_id)) errors.push('proof_upload_id is required');

  return buildResult(value, errors);
};

const validateOrderRating = (req) => {
  const errors = [];
  const value = {
    rating: Number(req.body.rating),
    note: req.body.note ? String(req.body.note).trim() : null,
  };

  if (!Number.isFinite(value.rating) || value.rating < 1 || value.rating > 5) {
    errors.push('rating must be between 1 and 5');
  }
  if (value.note && value.note.length > 500) {
    errors.push('note must be 500 characters or fewer');
  }

  return buildResult(value, errors);
};

const validateAssignmentResponse = (req) => {
  const errors = [];
  const value = {
    action: String(req.body.action || '').trim(),
    reason: req.body.reason ? String(req.body.reason).trim() : null,
  };

  if (!['accept', 'reject'].includes(value.action)) errors.push('action must be accept or reject');
  if (value.action === 'reject' && (!value.reason || value.reason.length < 3)) errors.push('reason is required when rejecting');

  return buildResult(value, errors);
};

const validateCustodyConfirmation = (req) => {
  const errors = [];
  const value = {
    scanned_code: String(req.body.scanned_code || '').trim(),
  };

  if (value.scanned_code.length < 3) errors.push('scanned_code is required');

  return buildResult(value, errors);
};

const validatePickupKeyConfirmation = (req) => {
  const errors = [];
  const value = {
    pickup_key: String(req.body.pickup_key || '').trim(),
  };

  if (!/^\d{4}$/.test(value.pickup_key)) errors.push('pickup_key must be a 4 digit code');

  return buildResult(value, errors);
};

const validateHubScanIn = (req) => {
  const errors = [];
  const value = {
    scanned_code: String(req.body.scanned_code || '').trim(),
  };

  if (value.scanned_code.length < 3) errors.push('scanned_code is required');

  return buildResult(value, errors);
};

const validateTrackLookup = (req) => {
  const value = {
    package_tracking_id: String(req.params.packageTrackingId || '').trim().toUpperCase(),
  };

  return buildResult(value, []);
};

const validateRiderTrackingLookup = (req) => {
  const value = {
    rider_tracking_id: String(req.params.riderTrackingId || '').trim().toUpperCase(),
  };

  return buildResult(value, []);
};

module.exports = {
  validateCreateOrder,
  validateBatchOrders,
  validatePricingEstimate,
  validateOrderQuery,
  validateOrderStatusUpdate,
  validateAssignRider,
  validateAssignmentResponse,
  validateCustodyConfirmation,
  validatePickupKeyConfirmation,
  validateHubScanIn,
  validateOtpVerification,
  validateManualOtpOverride,
  validateDeliveryIssue,
  validateOrderRating,
  validateTrackLookup,
  validateRiderTrackingLookup,
};
