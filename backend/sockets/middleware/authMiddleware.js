const { verifyAccessToken } = require('../../utils/token');
const User = require('../../models/User');

/**
 * Socket authentication middleware
 * Verifies JWT token and attaches user to socket
 */
const socketAuthMiddleware = async (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (!token) {
    // Allow unauthenticated connections for public tracking
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select('+role');

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.user = {
      id: user._id.toString(),
      role: user.role,
      hub_id: user.hub_id?.toString() || null,
      merchant_id: user.merchant_id?.toString() || null,
    };

    return next();
  } catch (error) {
    return next(new Error('Unauthorized socket connection'));
  }
};

/**
 * Require authenticated socket connection
 */
const requireAuth = (socket, next) => {
  if (!socket.user?.id) {
    return next(new Error('Authentication required'));
  }
  return next();
};

/**
 * Require specific role(s)
 */
const requireRole = (...roles) => {
  return (socket, next) => {
    if (!socket.user?.role) {
      return next(new Error('Role required'));
    }
    if (!roles.includes(socket.user.role)) {
      return next(new Error('Insufficient permissions'));
    }
    return next();
  };
};

module.exports = {
  socketAuthMiddleware,
  requireAuth,
  requireRole,
};
