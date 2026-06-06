const { createSocketServer } = require('../config/socket');
const mongoose = require('mongoose');
const { verifyAccessToken } = require('../utils/token');
const User = require('../models/User');
const Merchant = require('../models/Merchant');
const Order = require('../models/Order');
const { isAccountLocked } = require('../utils/accountSecurity');
const { ensureRiderDeviceAllowed } = require('../services/deviceSecurityService');
const {
  ADMIN_ROLES,
  canAccessAllHubs,
  getAssignedHubIds,
} = require('../utils/hubAccess');

const ADMIN_SOCKET_ROLES = [...ADMIN_ROLES];

const readId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return String(value._id || value.id || value);
};

const buildSocketDeviceRequest = (socket) => ({
  headers: socket.handshake.headers || {},
  body: { device: socket.handshake.auth?.device || {} },
  ip: socket.handshake.address,
  socket: { remoteAddress: socket.handshake.address },
});

const assertFreshRiderSocketSecurity = async (socket) => {
  if (socket.user?.role !== 'rider') {
    return;
  }

  const user = await User.findById(socket.user.id).select('role hub_id is_active account_locked locked_until locked_reason kyc_status failed_login_attempts');

  if (!user || !user.is_active || isAccountLocked(user)) {
    throw new Error('Rider account is inactive or locked');
  }

  await ensureRiderDeviceAllowed({
    user,
    req: buildSocketDeviceRequest(socket),
  });

  socket.user.hub_id = user.hub_id?.toString() || socket.user.hub_id || null;
};

const socketCanAccessHub = (socket, hubId) => {
  if (canAccessAllHubs(socket.user)) {
    return true;
  }

  return getAssignedHubIds(socket.user).includes(String(hubId || ''));
};

const canAccessOrderRoom = async (socket, orderId) => {
  if (!socket.user?.id || !mongoose.Types.ObjectId.isValid(orderId)) {
    return false;
  }

  const order = await Order.findById(orderId).select('hub_id merchant_id rider_id').lean();
  if (!order) {
    return false;
  }

  if (canAccessAllHubs(socket.user)) {
    return true;
  }

  if (ADMIN_SOCKET_ROLES.includes(socket.user.role)) {
    return socketCanAccessHub(socket, readId(order.hub_id));
  }

  if (socket.user.role === 'merchant') {
    return readId(order.merchant_id) === socket.user.id;
  }

  if (socket.user.role === 'rider') {
    return readId(order.rider_id) === socket.user.id;
  }

  return false;
};

// Handler imports
const { 
  handleRiderLocationUpdate, 
  handleRiderOnline, 
  handleRiderOffline,
  cleanupRiderData 
} = require('./handlers/riderHandlers');

/**
 * Main socket initialization
 * Sets up all event handlers and room management
 */
const initSockets = (server) => {
  const io = createSocketServer(server);

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      // Allow unauthenticated connections for public tracking
      return next();
    }

    try {
      const decoded = verifyAccessToken(token);

      if (decoded.role === 'merchant') {
        const merchant = await Merchant.findById(decoded.id).select('hub_id status');

        if (!merchant) {
          return next(new Error('Merchant not found'));
        }

        socket.user = {
          id: merchant._id.toString(),
          role: 'merchant',
          hub_id: merchant.hub_id?.toString() || null,
          merchant_id: merchant._id.toString(),
        };

        return next();
      }

      const user = await User.findById(decoded.id).select('role hub_id assigned_hub_ids is_active account_locked locked_until locked_reason kyc_status failed_login_attempts');

      if (!user) {
        return next(new Error('User not found'));
      }

      if (!user.is_active || isAccountLocked(user)) {
        return next(new Error('User account is inactive or locked'));
      }

      if (user.role === 'rider') {
        await ensureRiderDeviceAllowed({
          user,
          req: buildSocketDeviceRequest(socket),
        });
      }

      socket.user = {
        id: user._id.toString(),
        role: user.role,
        hub_id: user.hub_id?.toString() || null,
        assigned_hub_ids: (user.assigned_hub_ids || []).map((hubId) => hubId.toString()),
        merchant_id: null,
      };

      return next();
    } catch (error) {
      return next(new Error('Unauthorized socket connection'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}, User: ${socket.user?.id || 'anonymous'}, Role: ${socket.user?.role || 'none'}`);

    const runRiderSocketAction = async (action) => {
      try {
        await assertFreshRiderSocketSecurity(socket);
        await action();
      } catch (error) {
        socket.emit('rider-security-blocked', {
          error: error.message || 'Rider device security blocked this action',
        });
        socket.disconnect(true);
      }
    };

    // Join user-specific room
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }

    // Join role-based rooms
    if (socket.user?.role) {
      // Riders join rider room
      if (socket.user.role === 'rider') {
        socket.join('riders');
        
        // Auto-announce online
        handleRiderOnline(socket);
      }
      
      // Merchants join merchant room
      if (socket.user.role === 'merchant') {
        socket.join('merchants');
        if (socket.user.merchant_id) {
          socket.join(`merchant:${socket.user.merchant_id}`);
        }
      }
      
      // HQ users join the global admin room. Regional/hub admins receive scoped hub-room events.
      if (canAccessAllHubs(socket.user)) {
        socket.join('admin');
      }
    }

    // Hub rooms carry operational broadcasts and are limited to admin command-center roles.
    if (ADMIN_SOCKET_ROLES.includes(socket.user?.role)) {
      getAssignedHubIds(socket.user).forEach((hubId) => socket.join(`hub:${hubId}`));
    }

    // ========== Rider Event Handlers ==========
    
    // Rider updates location
    socket.on('rider:update-location', (data) => {
      runRiderSocketAction(() => handleRiderLocationUpdate(socket, data));
    });

    // Rider announces online
    socket.on('rider:online', () => {
      runRiderSocketAction(() => handleRiderOnline(socket));
    });

    // Rider announces offline
    socket.on('rider:offline', () => {
      runRiderSocketAction(() => handleRiderOffline(socket));
    });

    // ========== Room Management ==========

    // Join specific hub room
    socket.on('join:hub', (hubId) => {
      if (hubId && ADMIN_SOCKET_ROLES.includes(socket.user?.role) && socketCanAccessHub(socket, hubId)) {
        socket.join(`hub:${hubId}`);
        socket.emit('joined-hub', { hub_id: hubId, success: true });
      }
    });

    // Join specific merchant room
    socket.on('join:merchant', (merchantId) => {
      if (merchantId && socket.user?.merchant_id === merchantId) {
        socket.join(`merchant:${merchantId}`);
        socket.emit('joined-merchant', { merchant_id: merchantId, success: true });
      }
    });

    // Join specific rider room
    socket.on('join:rider', (riderId) => {
      runRiderSocketAction(() => {
        if (riderId && socket.user?.id === riderId) {
          socket.join(`rider:${riderId}`);
          socket.emit('joined-rider', { rider_id: riderId, success: true });
        }
      });
    });

    // Subscribe to order tracking
    socket.on('subscribe:order', async (orderId) => {
      if (socket.user?.role === 'rider') {
        try {
          await assertFreshRiderSocketSecurity(socket);
        } catch (error) {
          socket.emit('subscribed-order', { order_id: orderId, success: false, error: error.message || 'Rider device security blocked this action' });
          socket.disconnect(true);
          return;
        }
      }

      if (orderId && await canAccessOrderRoom(socket, orderId)) {
        socket.join(`order:${orderId}`);
        socket.emit('subscribed-order', { order_id: orderId, success: true });
      } else {
        socket.emit('subscribed-order', { order_id: orderId, success: false, error: 'Unauthorized' });
      }
    });

    // Unsubscribe from order tracking
    socket.on('unsubscribe:order', (orderId) => {
      if (orderId) {
        socket.leave(`order:${orderId}`);
      }
    });

    // ========== Request Handlers ==========

    // Get rider locations for hub
    socket.on('request:hub-riders', (hubId, callback) => {
      if (!socketCanAccessHub(socket, hubId)) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }
      
      // Import handlers dynamically to avoid circular dependency
      const { getHubActiveRiders } = require('./handlers/riderHandlers');
      const riders = getHubActiveRiders(hubId);
      
      if (callback) callback({ success: true, riders });
    });

    // Request dashboard data
    socket.on('request:dashboard', async (callback) => {
      if (!socket.user?.role || !ADMIN_SOCKET_ROLES.includes(socket.user.role)) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }

      if (!canAccessAllHubs(socket.user) && getAssignedHubIds(socket.user).length === 0) {
        if (callback) callback({ error: 'Hub access required' });
        return;
      }

      const { updateDashboardCounters, getHubCounters } = require('./handlers/adminHandlers');
      const assignedHubIds = getAssignedHubIds(socket.user);
      const counters = canAccessAllHubs(socket.user)
        ? await updateDashboardCounters()
        : await getHubCounters(assignedHubIds[0]);
      
      if (callback) callback({ success: true, counters });
    });

    // ========== Ping/Pong for Keep-alive ==========
    
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

    // ========== Disconnect Handler ==========
    
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id}, Reason: ${reason}`);
      
      // Cleanup rider data
      if (socket.user?.role === 'rider') {
        cleanupRiderData(socket);
      }
    });
  });

  return io;
};

module.exports = {
  initSockets,
};
