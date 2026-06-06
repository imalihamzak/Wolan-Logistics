const { getIO } = require('../config/socket');

const emitToHub = (hubId, eventName, payload) => {
  const io = getIO();

  if (!io || !hubId) {
    return false;
  }

  io.to(`hub:${hubId}`).emit(eventName, payload);
  return true;
};

const emitToUser = (userId, eventName, payload) => {
  const io = getIO();

  if (!io || !userId) {
    return false;
  }

  io.to(`user:${userId}`).emit(eventName, payload);
  return true;
};

const emitToMerchant = (merchantId, eventName, payload) => {
  const io = getIO();

  if (!io || !merchantId) {
    return false;
  }

  io.to(`merchant:${merchantId}`).emit(eventName, payload);
  return true;
};

const emitToAdmin = (eventName, payload) => {
  const io = getIO();

  if (!io) {
    return false;
  }

  io.to('admin').emit(eventName, payload);
  return true;
};

const emitToOrder = (orderId, eventName, payload) => {
  const io = getIO();

  if (!io || !orderId) {
    return false;
  }

  io.to(`order:${orderId}`).emit(eventName, payload);
  return true;
};

const emitGlobal = (eventName, payload) => {
  const io = getIO();

  if (!io) {
    return false;
  }

  io.emit(eventName, payload);
  return true;
};

module.exports = {
  emitToHub,
  emitToUser,
  emitToMerchant,
  emitToAdmin,
  emitToOrder,
  emitGlobal,
};
