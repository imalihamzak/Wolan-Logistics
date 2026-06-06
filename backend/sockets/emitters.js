const { getIO } = require('../config/socket');

/**
 * Scalable emit helpers for realtime updates
 * Supports different rooms and event types
 */

const SCALES = {
  SMALL: 10,
  MEDIUM: 100,
  LARGE: 1000,
};

/**
 * Get scaling factor based on order volume
 */
const getScaleFactor = () => {
  // In production, calculate based on actual order volume
  return SCALES.MEDIUM;
};

/**
 * Emit to a specific room
 */
const emitToRoom = (room, event, data) => {
  const io = getIO();
  if (!io || !room) return false;

  io.to(room).emit(event, {
    ...data,
    timestamp: new Date(),
  });
  return true;
};

/**
 * Emit to multiple rooms
 */
const emitToRooms = (rooms, event, data) => {
  if (!Array.isArray(rooms) || rooms.length === 0) return false;

  const io = getIO();
  if (!io) return false;

  const payload = {
    ...data,
    timestamp: new Date(),
  };

  rooms.forEach((room) => {
    io.to(room).emit(event, payload);
  });

  return true;
};

/**
 * Emit to all connected clients
 */
const broadcast = (event, data) => {
  const io = getIO();
  if (!io) return false;

  io.emit(event, {
    ...data,
    timestamp: new Date(),
  });
  return true;
};

// ==================== Rider Events ====================

/**
 * Emit rider location update
 */
const emitRiderLocation = (riderId, locationData) => {
  return emitToRoom(`rider:${riderId}`, 'rider-location-update', locationData);
};

/**
 * Broadcast rider online status
 */
const emitRiderOnline = (riderId, hubId) => {
  broadcast('rider-online', { rider_id: riderId, hub_id: hubId });
  if (hubId) {
    emitToRoom(`hub:${hubId}`, 'rider-online', { rider_id: riderId, hub_id: hubId });
  }
};

/**
 * Broadcast rider offline status
 */
const emitRiderOffline = (riderId, hubId) => {
  broadcast('rider-offline', { rider_id: riderId, hub_id: hubId });
  if (hubId) {
    emitToRoom(`hub:${hubId}`, 'rider-offline', { rider_id: riderId, hub_id: hubId });
  }
};

/**
 * Alert when rider goes offline during delivery
 */
const emitRiderGoneOffline = (riderId, hubId, activeOrderId) => {
  const alertData = {
    rider_id: riderId,
    active_order_id: activeOrderId,
    message: 'Rider went offline during active delivery',
    severity: 'high',
  };
  emitToRoom('admin', 'rider-gone-offline', alertData);
  if (hubId) {
    emitToRoom(`hub:${hubId}`, 'rider-gone-offline', alertData);
  }
};

// ==================== Order Events ====================

/**
 * Emit new order created
 */
const emitNewOrder = (orderData) => {
  broadcast('new-order', orderData);

  if (orderData.hub_id) {
    emitToRoom(`hub:${orderData.hub_id}`, 'new-order', orderData);
  }
  if (orderData.merchant_id) {
    emitToRoom(`merchant:${orderData.merchant_id}`, 'new-order', orderData);
  }
  if (orderData.rider_id) {
    emitToRoom(`rider:${orderData.rider_id}`, 'new-order', orderData);
  }
};

/**
 * Emit order status update
 */
const emitOrderStatus = (orderData, previousStatus) => {
  const payload = {
    ...orderData,
    previous_status: previousStatus,
  };

  broadcast('order-status-update', payload);
  emitToRoom('admin', 'order-status-update', payload);

  if (orderData.hub_id) {
    emitToRoom(`hub:${orderData.hub_id}`, 'order-status-update', payload);
  }
  if (orderData.merchant_id) {
    emitToRoom(`merchant:${orderData.merchant_id}`, 'order-status-update', payload);
  }
};

/**
 * Emit order delivered
 */
const emitOrderDelivered = (orderData) => {
  const payload = { type: 'delivered', ...orderData };
  emitToRoom('admin', 'delivery-notification', payload);

  if (orderData.merchant_id) {
    emitToRoom(`merchant:${orderData.merchant_id}`, 'order-delivered', orderData);
  }
};

/**
 * Emit rider assigned to order
 */
const emitRiderAssigned = (orderData) => {
  emitToRoom('admin', 'rider-assigned', orderData);

  if (orderData.hub_id) {
    emitToRoom(`hub:${orderData.hub_id}`, 'rider-assigned', orderData);
  }
  if (orderData.rider_id) {
    emitToRoom(`rider:${orderData.rider_id}`, 'rider-assigned', orderData);
  }
};

// ==================== Admin Events ====================

/**
 * Emit dashboard counters
 */
const emitDashboardCounters = (counters) => {
  emitToRoom('admin', 'dashboard-counters', counters);
};

/**
 * Emit package alert
 */
const emitPackageAlert = (alertData) => {
  const payload = { ...alertData };
  emitToRoom('admin', 'package-alert', payload);

  if (alertData.hub_id) {
    emitToRoom(`hub:${alertData.hub_id}`, 'package-alert', payload);
  }
};

/**
 * Emit delivery notification
 */
const emitDeliveryNotification = (notificationData) => {
  const payload = { ...notificationData };
  emitToRoom('admin', 'delivery-notification', payload);

  if (notificationData.merchant_id) {
    emitToRoom(`merchant:${notificationData.merchant_id}`, 'delivery-notification', payload);
  }
};

// ==================== Zone Events ====================

/**
 * Emit zone update
 */
const emitZoneUpdate = (zoneData) => {
  emitToRoom('admin', 'zone-update', zoneData);

  if (zoneData.hub_id) {
    emitToRoom(`hub:${zoneData.hub_id}`, 'zone-update', zoneData);
  }
};

// ==================== Hub Events ====================

/**
 * Emit to hub room
 */
const emitToHub = (hubId, event, data) => {
  if (!hubId) return false;
  return emitToRoom(`hub:${hubId}`, event, data);
};

/**
 * Emit to merchant room
 */
const emitToMerchant = (merchantId, event, data) => {
  if (!merchantId) return false;
  return emitToRoom(`merchant:${merchantId}`, event, data);
};

/**
 * Emit to rider room
 */
const emitToRider = (riderId, event, data) => {
  if (!riderId) return false;
  return emitToRoom(`rider:${riderId}`, event, data);
};

/**
 * Emit to specific user (by user ID)
 */
const emitToUser = (userId, event, data) => {
  if (!userId) return false;
  return emitToRoom(`user:${userId}`, event, data);
};

/**
 * Emit to admin room
 */
const emitToAdmin = (event, data) => {
  return emitToRoom('admin', event, data);
};

module.exports = {
  SCALES,
  getScaleFactor,
  emitToRoom,
  emitToRooms,
  broadcast,
  emitRiderLocation,
  emitRiderOnline,
  emitRiderOffline,
  emitRiderGoneOffline,
  emitNewOrder,
  emitOrderStatus,
  emitOrderDelivered,
  emitRiderAssigned,
  emitDashboardCounters,
  emitPackageAlert,
  emitDeliveryNotification,
  emitZoneUpdate,
  emitToHub,
  emitToMerchant,
  emitToRider,
  emitToUser,
  emitToAdmin,
};
