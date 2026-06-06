const { getIO } = require('../../config/socket');
const Order = require('../../models/Order');

/**
 * Handle new order creation events
 * Emits to relevant rooms
 */
const handleNewOrder = async (orderData) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    merchant_id: orderData.merchant_id,
    hub_id: orderData.hub_id,
    delivery_zone: orderData.delivery_zone,
    order_status: orderData.order_status,
    customer_name: orderData.customer_name,
    customer_phone: orderData.customer_phone,
    delivery_address: orderData.delivery_address,
    createdAt: orderData.createdAt,
    timestamp: new Date(),
  };

  // Emit to relevant rooms
  io.to('admin').emit('new-order', payload);

  if (orderData.hub_id) {
    io.to(`hub:${orderData.hub_id}`).emit('new-order', payload);
  }

  if (orderData.merchant_id) {
    io.to(`merchant:${orderData.merchant_id}`).emit('new-order', payload);
  }

  if (orderData.rider_id) {
    io.to(`rider:${orderData.rider_id}`).emit('new-order', payload);
  }
};

/**
 * Handle order status update events
 */
const handleOrderStatusUpdate = async (orderData, previousStatus) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    merchant_id: orderData.merchant_id,
    hub_id: orderData.hub_id,
    rider_id: orderData.rider_id,
    order_status: orderData.order_status,
    previous_status: previousStatus,
    timestamp: new Date(),
  };

  // Emit to all relevant rooms
  io.to('admin').emit('order-status-update', payload);

  if (orderData.hub_id) {
    io.to(`hub:${orderData.hub_id}`).emit('order-status-update', payload);
  }

  if (orderData.merchant_id) {
    io.to(`merchant:${orderData.merchant_id}`).emit('order-status-update', payload);
  }

  if (orderData.rider_id) {
    io.to(`rider:${orderData.rider_id}`).emit('order-status-update', payload);
  }

  // Emit specific events for important status changes
  if (orderData.order_status === 'delivered') {
    io.to('admin').emit('order-delivered', payload);
    if (orderData.merchant_id) {
      io.to(`merchant:${orderData.merchant_id}`).emit('order-delivered', payload);
    }
  } else if (orderData.order_status === 'failed') {
    io.to('admin').emit('order-failed', payload);
    if (orderData.hub_id) {
      io.to(`hub:${orderData.hub_id}`).emit('order-failed', payload);
    }
  } else if (orderData.order_status === 'out_for_delivery') {
    io.to('admin').emit('order-out-for-delivery', payload);
    if (orderData.merchant_id) {
      io.to(`merchant:${orderData.merchant_id}`).emit('order-out-for-delivery', payload);
    }
  }
};

/**
 * Handle rider assignment events
 */
const handleRiderAssigned = async (orderData) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    rider_id: orderData.rider_id,
    assigned_at: orderData.assigned_at,
    timestamp: new Date(),
  };

  io.to('admin').emit('rider-assigned', payload);

  if (orderData.hub_id) {
    io.to(`hub:${orderData.hub_id}`).emit('rider-assigned', payload);
  }

  if (orderData.rider_id) {
    io.to(`rider:${orderData.rider_id}`).emit('rider-assigned', payload);
  }

  if (orderData.merchant_id) {
    io.to(`merchant:${orderData.merchant_id}`).emit('rider-assigned', payload);
  }
};

/**
 * Handle OTP verified events
 */
const handleOtpVerified = async (orderData) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    delivered_at: orderData.delivered_at,
    otp_verified_at: orderData.otp_verified_at,
    timestamp: new Date(),
  };

  io.to('admin').emit('order-delivered', payload);

  if (orderData.merchant_id) {
    io.to(`merchant:${orderData.merchant_id}`).emit('order-delivered', payload);
  }

  if (orderData.hub_id) {
    io.to(`hub:${orderData.hub_id}`).emit('order-delivered', payload);
  }

  // Delivery notification
  io.to('admin').emit('delivery-notification', {
    type: 'delivered',
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    customer: orderData.customer_name,
    message: 'Package delivered successfully',
    timestamp: new Date(),
  });
};

/**
 * Handle delivery failed events
 */
const handleDeliveryFailed = async (orderData, reason) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    rider_id: orderData.rider_id,
    failed_reason: reason,
    delivery_attempts: orderData.delivery_attempts,
    timestamp: new Date(),
  };

  io.to('admin').emit('order-failed', payload);

  if (orderData.hub_id) {
    io.to(`hub:${orderData.hub_id}`).emit('order-failed', payload);
  }

  if (orderData.merchant_id) {
    io.to(`merchant:${orderData.merchant_id}`).emit('order-failed', payload);
  }

  // Alert for admin dashboard
  io.to('admin').emit('package-alert', {
    type: 'delivery_failed',
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    message: `Delivery failed: ${reason}`,
    severity: 'high',
    timestamp: new Date(),
  });
};

/**
 * Handle package return events
 */
const handlePackageReturned = async (orderData) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    returned_at: orderData.returned_at,
    timestamp: new Date(),
  };

  io.to('admin').emit('order-returned', payload);

  if (orderData.merchant_id) {
    io.to(`merchant:${orderData.merchant_id}`).emit('order-returned', payload);
  }

  if (orderData.hub_id) {
    io.to(`hub:${orderData.hub_id}`).emit('order-returned', payload);
  }
};

/**
 * Handle order return to merchant events
 */
const handleReturnToMerchant = async (orderData) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    rider_id: orderData.rider_id,
    return_reason: orderData.return_reason,
    timestamp: new Date(),
  };

  io.to('admin').emit('order-returned', payload);

  if (orderData.merchant_id) {
    io.to(`merchant:${orderData.merchant_id}`).emit('order-returned', payload);
  }

  // Alert for admin
  io.to('admin').emit('package-alert', {
    type: 'returned_to_merchant',
    order_id: orderData.order_id,
    package_tracking_id: orderData.package_tracking_id,
    message: 'Package returned to merchant',
    severity: 'medium',
    timestamp: new Date(),
  });
};

/**
 * Emit live order tracking updates
 */
const emitLiveTracking = (orderId, updates) => {
  const io = getIO();
  if (!io || !orderId) return;

  io.to(`order:${orderId}`).emit('live-tracking-update', {
    order_id: orderId,
    ...updates,
    timestamp: new Date(),
  });
};

/**
 * Check for rider-package mismatch
 */
const checkMismatch = async (orderData) => {
  const io = getIO();
  if (!io) return;

  // Check if rider has too many active orders
  const activeCount = await Order.countDocuments({
    rider_id: orderData.rider_id,
    order_status: { $in: ['pending', 'picked_up', 'at_hub', 'out_for_delivery'] },
  });

  if (activeCount > 10) {
    io.to('admin').emit('package-alert', {
      type: 'rider_overload',
      rider_id: orderData.rider_id,
      active_orders: activeCount,
      message: `Rider has ${activeCount} active orders - may cause delays`,
      severity: 'medium',
      timestamp: new Date(),
    });
  }
};

module.exports = {
  handleNewOrder,
  handleOrderStatusUpdate,
  handleRiderAssigned,
  handleOtpVerified,
  handleDeliveryFailed,
  handlePackageReturned,
  handleReturnToMerchant,
  emitLiveTracking,
  checkMismatch,
};
