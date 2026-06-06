const { getIO } = require('../../config/socket');
const Order = require('../../models/Order');
const User = require('../../models/User');

/**
 * Admin dashboard counters cache
 */
const dashboardCounters = {
  total_orders: 0,
  pending_orders: 0,
  in_transit: 0,
  delivered: 0,
  failed: 0,
  returned: 0,
  active_riders: 0,
  online_riders: 0,
  total_merchants: 0,
  last_updated: null,
};

/**
 * Update dashboard counters
 * Called periodically or on significant events
 */
const updateDashboardCounters = async () => {
  try {
    const [
      totalOrders,
      pendingOrders,
      inTransit,
      delivered,
      failed,
      returned,
      activeRiders,
      totalMerchants,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ order_status: 'pending' }),
      Order.countDocuments({ order_status: { $in: ['picked_up', 'at_hub', 'out_for_delivery'] } }),
      Order.countDocuments({ order_status: 'delivered' }),
      Order.countDocuments({ order_status: 'failed' }),
      Order.countDocuments({ order_status: 'returned' }),
      User.countDocuments({ role: 'rider', is_active: true }),
      User.countDocuments({ role: 'merchant', is_active: true }),
    ]);

    // Online riders would come from socket connections
    // For now, use active riders as proxy
    dashboardCounters.total_orders = totalOrders;
    dashboardCounters.pending_orders = pendingOrders;
    dashboardCounters.in_transit = inTransit;
    dashboardCounters.delivered = delivered;
    dashboardCounters.failed = failed;
    dashboardCounters.returned = returned;
    dashboardCounters.active_riders = activeRiders;
    dashboardCounters.online_riders = activeRiders; // Simplified
    dashboardCounters.total_merchants = totalMerchants;
    dashboardCounters.last_updated = new Date();

    // Emit to admin
    const io = getIO();
    if (io) {
      io.to('admin').emit('dashboard-counters', dashboardCounters);
    }

    return dashboardCounters;
  } catch (error) {
    console.error('Error updating dashboard counters:', error);
    return dashboardCounters;
  }
};

/**
 * Get hub-specific counters
 */
const getHubCounters = async (hubId) => {
  try {
    const [
      totalOrders,
      pendingOrders,
      inTransit,
      delivered,
      failed,
      returned,
      activeRiders,
    ] = await Promise.all([
      Order.countDocuments({ hub_id: hubId }),
      Order.countDocuments({ hub_id: hubId, order_status: 'pending' }),
      Order.countDocuments({ hub_id: hubId, order_status: { $in: ['picked_up', 'at_hub', 'out_for_delivery'] } }),
      Order.countDocuments({ hub_id: hubId, order_status: 'delivered' }),
      Order.countDocuments({ hub_id: hubId, order_status: 'failed' }),
      Order.countDocuments({ hub_id: hubId, order_status: 'returned' }),
      User.countDocuments({ role: 'rider', is_active: true, hub_id: hubId }),
    ]);

    return {
      total_orders: totalOrders,
      pending_orders: pendingOrders,
      in_transit: inTransit,
      delivered: delivered,
      failed: failed,
      returned: returned,
      active_riders: activeRiders,
      last_updated: new Date(),
    };
  } catch (error) {
    console.error('Error getting hub counters:', error);
    return null;
  }
};

/**
 * Handle package alert
 * Emits high-priority alerts to admin
 */
const emitPackageAlert = (alertData) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    ...alertData,
    id: `alert-${Date.now()}`,
    timestamp: new Date(),
  };

  io.to('admin').emit('package-alert', payload);

  // Also emit to hub if applicable
  if (alertData.hub_id) {
    io.to(`hub:${alertData.hub_id}`).emit('package-alert', payload);
  }
};

/**
 * Handle delivery notification
 * Sends push-style notifications
 */
const emitDeliveryNotification = (notificationData) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    ...notificationData,
    id: `notif-${Date.now()}`,
    timestamp: new Date(),
  };

  // To admin
  io.to('admin').emit('delivery-notification', payload);

  // To specific rooms
  if (notificationData.merchant_id) {
    io.to(`merchant:${notificationData.merchant_id}`).emit('delivery-notification', payload);
  }

  if (notificationData.hub_id) {
    io.to(`hub:${notificationData.hub_id}`).emit('delivery-notification', payload);
  }
};

/**
 * Broadcast order batch created
 */
const handleBatchCreated = async (batchData) => {
  const io = getIO();
  if (!io) return;

  const payload = {
    batch_id: batchData.batch_id,
    total_orders: batchData.total_orders,
    hub_id: batchData.hub_id,
    timestamp: new Date(),
  };

  io.to('admin').emit('batch-created', payload);

  if (batchData.hub_id) {
    io.to(`hub:${batchData.hub_id}`).emit('batch-created', payload);
  }
};

/**
 * Get live statistics for dashboard
 */
const getLiveStats = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await Order.aggregate([
      { $match: { createdAt: { $gte: today } } },
      {
        $group: {
          _id: '$order_status',
          count: { $sum: 1 },
        },
      },
    ]);

    const statsByStatus = todayStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    return {
      today: {
        created: statsByStatus.pending || 0,
        delivered: statsByStatus.delivered || 0,
        failed: statsByStatus.failed || 0,
        returned: statsByStatus.returned || 0,
      },
      last_updated: new Date(),
    };
  } catch (error) {
    console.error('Error getting live stats:', error);
    return null;
  }
};

/**
 * Send zone-based sorting updates
 */
const emitZoneUpdate = (zoneData) => {
  const io = getIO();
  if (!io) return;

  io.to('admin').emit('zone-update', {
    ...zoneData,
    timestamp: new Date(),
  });

  if (zoneData.hub_id) {
    io.to(`hub:${zoneData.hub_id}`).emit('zone-update', {
      ...zoneData,
      timestamp: new Date(),
    });
  }
};

module.exports = {
  updateDashboardCounters,
  getHubCounters,
  emitPackageAlert,
  emitDeliveryNotification,
  handleBatchCreated,
  getLiveStats,
  emitZoneUpdate,
  dashboardCounters,
};
