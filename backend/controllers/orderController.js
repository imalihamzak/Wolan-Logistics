const mongoose = require('mongoose');

const Order = require('../models/Order');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const {
  createOrderRecord,
  createOrderBatch,
  listOrders,
  findOrderById,
  findOrderByPackageTrackingId,
  findOrderByRiderTrackingId,
  assertOrderAccess,
  transitionOrderStatus,
  assignRiderToOrder,
  confirmMerchantHandover,
  respondToAssignedOrder,
  confirmOrderCustody,
  confirmHubScanIn,
  verifyOrderOtp,
  manualOverrideOrderOtp,
  submitOrderRating,
  updateOrderDeliveryIssue,
  emitOrderEvent,
  serializeOrderForActor,
  findNearestRider,
  getOrderDispatchTargetCoordinates,
} = require('../services/orderService');
const notificationService = require('../services/notificationService');
const { calculateDeliveryPricing } = require('../services/pricingService');

const DEFAULT_ORDER_POPULATE = [
  { path: 'merchant_id', select: 'merchant_name shop_name email phone referral_code hub_id status' },
  { path: 'rider_id', select: 'full_name email phone profile_image role hub_id' },
  { path: 'hub_id', select: 'name code city state' },
];

const getOrderActorContext = (req) => ({
  id: req.user.id,
  role: req.user.role,
  hub_id: req.user.hub_id,
  assigned_hub_ids: req.user.assigned_hub_ids || [],
});

const serializeOrderForRequest = (order, req) => (
  serializeOrderForActor(order, req.user ? getOrderActorContext(req) : { role: 'public' })
);

const serializeOrderForPublicTracking = (order) => {
  const payload = order.toPublicJSON();
  const hub = payload.hub_id && typeof payload.hub_id === 'object'
    ? {
      name: payload.hub_id.name,
      code: payload.hub_id.code,
      city: payload.hub_id.city,
      state: payload.hub_id.state,
    }
    : null;

  return {
    order_id: payload.order_id,
    package_tracking_id: payload.package_tracking_id,
    order_status: payload.order_status,
    merchant_status: payload.merchant_status,
    merchant_status_key: payload.merchant_status_key,
    package_size: payload.package_size,
    delivery_zone: payload.delivery_zone,
    hub,
    status_history: (payload.status_history || []).map((entry) => ({
      status: entry.status,
      updated_at: entry.updated_at,
    })),
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    picked_up_at: payload.picked_up_at,
    at_hub_at: payload.at_hub_at,
    hub_scan_in: payload.hub_scan_in,
    out_for_delivery_at: payload.out_for_delivery_at,
    delivered_at: payload.delivered_at,
    failed_at: payload.failed_at,
    returned_at: payload.returned_at,
  };
};

const logOrderNotifications = async (order, event, actor) => {
  try {
    await notificationService.logOrderLifecycleNotifications(order, event, actor);
  } catch (error) {
    console.warn(`Order notification log failed for ${event}:`, error.message);
  }
};

const shouldIncludeDevOtp = () => process.env.NODE_ENV !== 'production';

const resolveMerchantId = async (req, fallbackMerchantId = null) => {
  if (fallbackMerchantId) {
    return fallbackMerchantId;
  }

  if (req.user.role === 'merchant') {
    return req.user.id;
  }

  throw new AppError('merchant_id is required', 400);
};

const shouldUseTransactions = () => process.env.MONGODB_TRANSACTIONS === 'true';

const runOrderMutation = async (operation) => {
  if (!shouldUseTransactions()) {
    return operation(null);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const createOrder = asyncHandler(async (req, res) => {
  const order = await runOrderMutation(async (session) => {
    const payload = req.validatedBody || req.body;
    payload.merchant_id = await resolveMerchantId(req, payload.merchant_id);

    return createOrderRecord({
      payload,
      actor: getOrderActorContext(req),
      session,
    });
  });

  const populatedOrder = await order.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:created');
  if (populatedOrder.rider_id && populatedOrder.assignment_response_status === 'pending') {
    emitOrderEvent(populatedOrder, 'order:pickup-agent-assigned');
    await logOrderNotifications(populatedOrder, 'assigned', getOrderActorContext(req));
  }

  return successResponse(res, 'Order created successfully', { order: serializeOrderForRequest(populatedOrder, req) }, 201);
});

const estimateOrderPricing = asyncHandler(async (req, res) => {
  const payload = req.validatedBody || req.body;
  const pricing = await calculateDeliveryPricing({
    pickupCoordinates: payload.pickup_coordinates || payload.pickup_location,
    dropoffCoordinates: payload.dropoff_coordinates || payload.delivery_coordinates || payload.customer_coordinates,
    pickupAddress: payload.pickup_address || payload.pickup_location?.address || payload.pickup_location?.label,
    dropoffAddress: payload.dropoff_address || payload.dropoff_location?.address || payload.dropoff_location?.label || payload.delivery_address,
    serviceLevel: payload.service_level,
  });

  return successResponse(res, 'Delivery pricing calculated successfully', { pricing });
});

const createBatchOrders = asyncHandler(async (req, res) => {
  const { batchId, createdOrders } = await runOrderMutation(async (session) => {
    const payload = req.validatedBody || req.body;
    const ordersPayload = await Promise.all(payload.orders.map(async (orderPayload) => ({
      ...orderPayload,
      merchant_id: await resolveMerchantId(req, orderPayload.merchant_id),
    })));

    return createOrderBatch({
      orders: ordersPayload,
      actor: getOrderActorContext(req),
      session,
    });
  });

  const populatedOrders = [];
  for (const order of createdOrders) {
    // eslint-disable-next-line no-await-in-loop
    populatedOrders.push(await order.populate(DEFAULT_ORDER_POPULATE));
  }

  populatedOrders.forEach((order) => emitOrderEvent(order, 'order:created'));
  for (const order of populatedOrders) {
    if (order.rider_id && order.assignment_response_status === 'pending') {
      emitOrderEvent(order, 'order:pickup-agent-assigned');
      // eslint-disable-next-line no-await-in-loop
      await logOrderNotifications(order, 'assigned', getOrderActorContext(req));
    }
  }
  emitOrderEvent(populatedOrders[0], 'order:batch-created', {
    batch_id: batchId,
    total_orders: populatedOrders.length,
    orders: populatedOrders.map((order) => serializeOrderForRequest(order, req)),
  });

  return successResponse(res, 'Batch orders created successfully', {
    batch_id: batchId,
    orders: populatedOrders.map((order) => serializeOrderForRequest(order, req)),
  }, 201);
});

const listAllOrders = asyncHandler(async (req, res) => {
  const result = await listOrders({ query: req.query, actor: getOrderActorContext(req) });
  const includeDevOtp = shouldIncludeDevOtp();

  return successResponse(res, 'Orders fetched successfully', {
    orders: result.items.map((order) => {
      const orderData = serializeOrderForRequest(order, req);
      if (includeDevOtp) {
        orderData.dev_otp_code = order.otp_code || null;
      }

      return orderData;
    }),
  }, 200, result.pagination);
});

const getOrderById = asyncHandler(async (req, res) => {
  const order = await findOrderById(req.params.id);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  assertOrderAccess(order, getOrderActorContext(req));

  const orderData = serializeOrderForRequest(order, req);
  if (shouldIncludeDevOtp()) {
    orderData.dev_otp_code = order.otp_code || null;
  }

  return successResponse(res, 'Order fetched successfully', { order: orderData });
});

const getOrderByPackageTrackingId = asyncHandler(async (req, res) => {
  const trackingId = req.validatedBody?.package_tracking_id || req.params.packageTrackingId;
  const order = await findOrderByPackageTrackingId(trackingId);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  assertOrderAccess(order, getOrderActorContext(req));

  return successResponse(res, 'Order tracking fetched successfully', { order: serializeOrderForRequest(order, req) });
});

const getOrderByRiderTrackingId = asyncHandler(async (req, res) => {
  const trackingId = req.validatedBody?.rider_tracking_id || req.params.riderTrackingId;
  const order = await findOrderByRiderTrackingId(trackingId);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  assertOrderAccess(order, getOrderActorContext(req));

  return successResponse(res, 'Order rider tracking fetched successfully', { order: serializeOrderForRequest(order, req) });
});

const assignRider = asyncHandler(async (req, res) => {
  const result = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    const payload = req.validatedBody || req.body;
    const riderId = payload.auto_assign
      ? (await findNearestRider({
        hubId: order.hub_id,
        deliveryZone: order.delivery_zone,
        packageSize: order.package_size,
        codAmount: order.cod_amount || 0,
        targetCoordinates: getOrderDispatchTargetCoordinates(order),
        session,
      }))?._id
      : payload.rider_id;

    if (!riderId) {
      throw new AppError('No compatible rider available for assignment', 404);
    }

    return assignRiderToOrder({
      order,
      riderId,
      actor,
      session,
      autoAssigned: Boolean(payload.auto_assign),
    });
  });

  const populatedOrder = await result.order.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:assigned');
  emitOrderEvent(populatedOrder, 'order:pickup-agent-assigned');
  await logOrderNotifications(populatedOrder, 'assigned', getOrderActorContext(req));

  return successResponse(res, 'Rider assigned successfully', { order: serializeOrderForRequest(populatedOrder, req) });
});

const respondToOrderAssignment = asyncHandler(async (req, res) => {
  const payload = req.validatedBody || req.body;
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    return respondToAssignedOrder({
      order,
      action: payload.action,
      reason: payload.reason,
      actor,
      session,
    });
  });

  if (updatedOrder.assignment_response_status === 'expired') {
    throw new AppError('Assignment response window has expired', 400);
  }

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:assignment-responded');
  if (payload.action === 'accept') {
    emitOrderEvent(populatedOrder, 'order:rider-accepted');
  }

  return successResponse(res, `Order ${payload.action}ed successfully`, { order: serializeOrderForRequest(populatedOrder, req) });
});

const confirmOrderHandover = asyncHandler(async (req, res) => {
  const payload = req.validatedBody || req.body;
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    return confirmMerchantHandover({
      order,
      pickupKey: payload.pickup_key,
      actor,
      session,
    });
  });

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:handover-verified');

  return successResponse(res, 'Merchant handover verified successfully', { order: serializeOrderForRequest(populatedOrder, req) });
});

const confirmPackageCustody = asyncHandler(async (req, res) => {
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    const payload = req.validatedBody || req.body;
    return confirmOrderCustody({
      order,
      scannedCode: payload.scanned_code,
      actor,
      session,
    });
  });

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:custody-confirmed');
  await logOrderNotifications(populatedOrder, 'picked_up', getOrderActorContext(req));

  return successResponse(res, 'Package custody confirmed successfully', { order: serializeOrderForRequest(populatedOrder, req) });
});

const scanOrderIntoHub = asyncHandler(async (req, res) => {
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    const payload = req.validatedBody || req.body;
    return confirmHubScanIn({
      order,
      scannedCode: payload.scanned_code,
      actor,
      session,
    });
  });

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:hub-scanned-in');
  emitOrderEvent(populatedOrder, 'order:package-at-hub');

  return successResponse(res, 'Package scanned into hub successfully', { order: serializeOrderForRequest(populatedOrder, req) });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    const payload = req.validatedBody || req.body;
    return transitionOrderStatus({
      order,
      nextStatus: payload.order_status,
      actor,
      note: payload.note,
      session,
    });
  });

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:status-updated');
  if (['picked_up', 'out_for_delivery', 'delivered', 'failed', 'returned'].includes(populatedOrder.order_status)) {
    await logOrderNotifications(populatedOrder, populatedOrder.order_status, getOrderActorContext(req));
  }

  return successResponse(res, 'Order status updated successfully', { order: serializeOrderForRequest(populatedOrder, req) });
});

const verifyOrderDeliveryOtp = asyncHandler(async (req, res) => {
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).select('+otp_code').session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    const payload = req.validatedBody || req.body;
    return verifyOrderOtp({
      order,
      otpCode: payload.otp_code,
      proofUploadId: payload.proof_upload_id,
      actor,
      session,
      note: payload.note,
    });
  });

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:otp-verified');
  await logOrderNotifications(populatedOrder, 'delivered', getOrderActorContext(req));

  return successResponse(res, 'OTP verified and order delivered successfully', { order: serializeOrderForRequest(populatedOrder, req) });
});

const manualOverrideDeliveryOtp = asyncHandler(async (req, res) => {
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).select('+otp_code').session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    const payload = req.validatedBody || req.body;
    return manualOverrideOrderOtp({
      order,
      reason: payload.reason,
      proofUploadId: payload.proof_upload_id,
      actor,
      session,
    });
  });

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:manual-otp-overridden');
  await logOrderNotifications(populatedOrder, 'delivered', getOrderActorContext(req));

  return successResponse(res, 'Manual OTP override applied and order delivered successfully', {
    order: serializeOrderForRequest(populatedOrder, req),
  });
});

const submitOrderRatingController = asyncHandler(async (req, res) => {
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    const payload = req.validatedBody || req.body;
    return submitOrderRating({
      order,
      rating: payload.rating,
      note: payload.note,
      actor,
      session,
    });
  });

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:rating-updated');

  return successResponse(res, 'Order rating recorded successfully', {
    order: serializeOrderForRequest(populatedOrder, req),
  });
});

const markOrderFailed = asyncHandler(async (req, res) => {
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    const payload = req.validatedBody || req.body;
    return updateOrderDeliveryIssue({
      order,
      nextStatus: 'failed',
      reason: payload.reason,
      proofUploadId: payload.proof_upload_id,
      actor,
      session,
    });
  });

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:failed');
  await logOrderNotifications(populatedOrder, 'failed', getOrderActorContext(req));

  return successResponse(res, 'Order marked as failed successfully', { order: serializeOrderForRequest(populatedOrder, req) });
});

const returnOrderToMerchant = asyncHandler(async (req, res) => {
  const updatedOrder = await runOrderMutation(async (session) => {
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const actor = getOrderActorContext(req);
    assertOrderAccess(order, actor);

    const payload = req.validatedBody || req.body;
    const returnedOrder = await updateOrderDeliveryIssue({
      order,
      nextStatus: 'returned',
      reason: payload.reason,
      proofUploadId: payload.proof_upload_id,
      actor,
      session,
    });

    returnedOrder.rider_id = null;
    returnedOrder.otp_code = null;
    await returnedOrder.save({ session });

    return returnedOrder;
  });

  const populatedOrder = await updatedOrder.populate(DEFAULT_ORDER_POPULATE);
  emitOrderEvent(populatedOrder, 'order:returned');
  await logOrderNotifications(populatedOrder, 'returned', getOrderActorContext(req));

  return successResponse(res, 'Order returned to merchant successfully', { order: serializeOrderForRequest(populatedOrder, req) });
});

const trackOrder = asyncHandler(async (req, res) => {
  const order = await findOrderByPackageTrackingId(req.params.packageTrackingId);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  return successResponse(res, 'Order tracking fetched successfully', { order: serializeOrderForPublicTracking(order) });
});

module.exports = {
  createOrder,
  createBatchOrders,
  estimateOrderPricing,
  listAllOrders,
  getOrderById,
  getOrderByPackageTrackingId,
  getOrderByRiderTrackingId,
  assignRider,
  respondToOrderAssignment,
  confirmOrderHandover,
  confirmPackageCustody,
  scanOrderIntoHub,
  updateOrderStatus,
  verifyOrderDeliveryOtp,
  manualOverrideDeliveryOtp,
  submitOrderRatingController,
  markOrderFailed,
  returnOrderToMerchant,
  trackOrder,
};
