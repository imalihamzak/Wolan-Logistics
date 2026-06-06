const mongoose = require('mongoose');

const { getIO } = require('../../config/socket');
const Order = require('../../models/Order');
const Rider = require('../../models/Rider');
const { refreshRiderDispatchPerformance } = require('../../services/dispatchPerformanceService');
const { haversineDistance, shouldAlert, formatDistance } = require('../../utils/geodistance');

/**
 * Rider location tracking data (in-memory for fast access).
 * In production, use Redis for scaling.
 */
const riderLocations = new Map();
const riderGpsPersistedAt = new Map();
const RIDER_SOCKET_GPS_SYNC_INTERVAL_MS = Math.max(
  Number(process.env.RIDER_SOCKET_GPS_SYNC_INTERVAL_MS || 60000),
  5000
);

/**
 * Track rider online/offline status.
 */
const riderStatus = new Map();

const normalizeTimestamp = (timestamp) => {
  const date = timestamp ? new Date(timestamp) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const readCoordinates = (data = {}) => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const latitude = Number(data.latitude ?? data.lat);
  const longitude = Number(data.longitude ?? data.lng ?? data.lon);
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
    || (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  return { latitude, longitude };
};

const isValidGeoPoint = (location) => {
  const [longitude, latitude] = Array.isArray(location?.coordinates) ? location.coordinates.map(Number) : [];
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
};

const persistRiderSocketLocation = async ({ socket, coordinates, timestamp }) => {
  const riderId = socket.user?.id;
  if (!riderId) {
    return;
  }

  const now = Date.now();
  const lastPersistedAt = riderGpsPersistedAt.get(riderId) || 0;
  if (now - lastPersistedAt < RIDER_SOCKET_GPS_SYNC_INTERVAL_MS) {
    return;
  }

  riderGpsPersistedAt.set(riderId, now);

  try {
    const rider = await Rider.findOne({ user_id: riderId, is_active: true })
      .select('user_id hub_id gps_location last_location_update')
      .exec();

    if (!rider) {
      return;
    }

    rider.gps_location = {
      type: 'Point',
      coordinates: [coordinates.longitude, coordinates.latitude],
    };
    rider.last_location_update = timestamp;
    await rider.save({ validateBeforeSave: false });

    await refreshRiderDispatchPerformance({ riderUserId: rider.user_id, hubId: rider.hub_id });
  } catch (error) {
    riderGpsPersistedAt.delete(riderId);
    console.warn(`Socket rider GPS persistence failed: ${error.message}`);
  }
};

/**
 * Handle rider location update.
 */
const handleRiderLocationUpdate = async (socket, data = {}) => {
  if (!socket.user?.id || socket.user.role !== 'rider') {
    return;
  }

  const coordinates = readCoordinates(data);
  if (!coordinates) {
    socket.emit('location-update-acknowledged', {
      success: false,
      error: 'Invalid GPS coordinates',
      timestamp: new Date(),
    });
    return;
  }

  const timestamp = normalizeTimestamp(data.timestamp);
  const locationData = {
    rider_id: socket.user.id,
    hub_id: socket.user.hub_id,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    coordinates: [coordinates.latitude, coordinates.longitude],
    accuracy: data.accuracy,
    timestamp,
  };

  riderLocations.set(socket.user.id, {
    ...locationData,
    socket_id: socket.id,
    updated_at: new Date(),
  });

  await persistRiderSocketLocation({ socket, coordinates, timestamp });
  await checkTrackerDivergence(socket.user.id, socket.user.hub_id);

  const io = getIO();
  if (io) {
    if (socket.user.hub_id) {
      io.to(`hub:${socket.user.hub_id}`).emit('rider-location-update', locationData);
    }
    io.to('admin').emit('rider-location-update', locationData);
  }

  socket.emit('location-update-acknowledged', {
    success: true,
    timestamp: locationData.timestamp,
  });
};

/**
 * Check GPS divergence between rider and package tracker for active deliveries.
 */
async function checkTrackerDivergence(riderId, hubId) {
  const riderLoc = riderLocations.get(riderId);
  if (!riderLoc) return;

  const activeOrder = await Order.findOne({
    rider_id: riderId,
    order_status: 'out_for_delivery',
    package_tracking_id: { $ne: null },
  });

  if (!activeOrder || !isValidGeoPoint(activeOrder.package_gps_location)) return;

  const riderLocation = readCoordinates(riderLoc);
  if (!riderLocation) return;

  const distance = haversineDistance(riderLocation, activeOrder.package_gps_location);

  if (shouldAlert(riderLocation, activeOrder.package_gps_location)) {
    const io = getIO();
    if (io) {
      const alert = {
        type: 'tracker-divergence',
        order_object_id: activeOrder._id,
        order_id: activeOrder.order_id,
        rider_id: riderId,
        rider_location: riderLoc,
        package_location: activeOrder.package_gps_location,
        distance: formatDistance(distance),
        hub_id: hubId,
        timestamp: new Date(),
      };

      if (hubId) {
        io.to(`hub:${hubId}`).emit('tracker-divergence-alert', alert);
      }
      io.to('admin').emit('tracker-divergence-alert', alert);

      console.log(`TRACKER ALERT: Rider ${riderId} diverged ${formatDistance(distance)} from package ${activeOrder.package_tracking_id}`);
    }
  }
}

/**
 * Handle package tracker location update from rider app.
 */
const handlePackageLocationUpdate = async (socket, data = {}) => {
  if (!socket.user?.id || socket.user.role !== 'rider') {
    return;
  }

  if (!data.orderId || !mongoose.Types.ObjectId.isValid(data.orderId)) {
    socket.emit('package-location-error', { error: 'A valid orderId is required' });
    return;
  }

  const coordinates = readCoordinates(data);
  if (!coordinates) {
    socket.emit('package-location-error', { error: 'Invalid package GPS coordinates' });
    return;
  }

  const order = await Order.findOne({
    _id: data.orderId,
    rider_id: socket.user.id,
    order_status: { $in: ['out_for_delivery', 'at_hub'] },
  });

  if (!order) {
    socket.emit('package-location-error', { error: 'Order not found or not active' });
    return;
  }

  order.package_gps_location = {
    type: 'Point',
    coordinates: [coordinates.longitude, coordinates.latitude],
  };
  order.package_last_update = normalizeTimestamp(data.timestamp);
  await order.save();

  socket.emit('package-location-acknowledged', {
    success: true,
    order_id: order._id,
    timestamp: order.package_last_update,
  });

  await checkTrackerDivergence(socket.user.id, socket.user.hub_id);

  const io = getIO();
  if (io && socket.user.hub_id) {
    io.to(`hub:${socket.user.hub_id}`).emit('package-location-update', {
      order_object_id: order._id,
      order_id: order.order_id,
      tracker_id: order.package_tracking_id,
      location: order.package_gps_location,
      accuracy: data.accuracy,
      timestamp: order.package_last_update,
    });
  }
};

/**
 * Handle rider online event.
 */
const handleRiderOnline = async (socket) => {
  if (!socket.user?.id || socket.user.role !== 'rider') {
    return;
  }

  const riderId = socket.user.id;
  const hubId = socket.user.hub_id;

  riderStatus.set(riderId, {
    status: 'online',
    hub_id: hubId,
    last_seen: new Date(),
  });

  socket.join(`rider:${riderId}`);

  const io = getIO();
  if (io) {
    io.to('admin').emit('rider-online', {
      rider_id: riderId,
      hub_id: hubId,
      timestamp: new Date(),
    });

    if (hubId) {
      io.to(`hub:${hubId}`).emit('rider-online', {
        rider_id: riderId,
        hub_id: hubId,
        timestamp: new Date(),
      });
    }
  }
};

/**
 * Handle rider offline event.
 */
const handleRiderOffline = async (socket) => {
  if (!socket.user?.id || socket.user.role !== 'rider') {
    return;
  }

  const riderId = socket.user.id;
  const hubId = socket.user.hub_id;

  riderStatus.set(riderId, {
    status: 'offline',
    hub_id: hubId,
    last_seen: new Date(),
  });

  riderLocations.delete(riderId);
  riderGpsPersistedAt.delete(riderId);

  const io = getIO();
  if (io) {
    io.to('admin').emit('rider-offline', {
      rider_id: riderId,
      hub_id: hubId,
      timestamp: new Date(),
    });

    if (hubId) {
      io.to(`hub:${hubId}`).emit('rider-gone-offline', {
        rider_id: riderId,
        hub_id: hubId,
        message: 'Rider went offline during active delivery',
        timestamp: new Date(),
      });
    }
  }
};

/**
 * Get rider's current location.
 */
const getRiderLocation = (riderId) => riderLocations.get(riderId) || null;

/**
 * Get all active riders at a hub.
 */
const getHubActiveRiders = (hubId) => {
  const activeRiders = [];
  for (const [riderId, data] of riderLocations) {
    if (data.hub_id === hubId) {
      activeRiders.push({
        rider_id: riderId,
        ...data,
      });
    }
  }
  return activeRiders;
};

/**
 * Get all rider statuses.
 */
const getAllRiderStatuses = () => Object.fromEntries(riderStatus);

/**
 * Cleanup rider data on disconnect.
 */
const cleanupRiderData = (socket) => {
  if (socket.user?.role === 'rider') {
    const riderId = socket.user.id;

    // In production, use Redis to track connections across instances.
    const hasOtherConnections = false;

    if (!hasOtherConnections) {
      riderGpsPersistedAt.delete(riderId);
      handleRiderOffline(socket);
    }
  }
};

module.exports = {
  handleRiderLocationUpdate,
  handlePackageLocationUpdate,
  handleRiderOnline,
  handleRiderOffline,
  getRiderLocation,
  getHubActiveRiders,
  getAllRiderStatuses,
  cleanupRiderData,
  riderLocations,
  riderStatus,
};
