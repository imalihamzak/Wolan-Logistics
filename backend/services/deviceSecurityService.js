const crypto = require('crypto');

const Rider = require('../models/Rider');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { isKycVerified, isRiderKycComplete } = require('../utils/accountSecurity');
const { emitToAdmin, emitToHub, emitToUser } = require('./realtimeService');

const DEVICE_FREEZE_REASON_PREFIX = 'Device security freeze';
const MAX_DEVICE_HISTORY = 25;

const readId = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return String(value._id || value.id || value);
  return String(value);
};

const sanitize = (value, maxLength = 180) => {
  if (value === undefined || value === null) return null;
  return String(value).trim().slice(0, maxLength) || null;
};

const parseBoolean = (value) => ['1', 'true', 'yes', 'y', 'rooted', 'jailbroken', 'compromised'].includes(
  String(value || '').trim().toLowerCase()
);

const hashDeviceId = (deviceId) => crypto
  .createHash('sha256')
  .update(String(deviceId || '').trim())
  .digest('hex');

const getRequestIp = (req = {}) => {
  const headers = req.headers || {};
  const forwardedFor = headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
};

const readDeviceContext = (req = {}) => {
  const headers = req.headers || {};
  const bodyDevice = req.body?.device || req.body?.device_security || {};
  const rooted = parseBoolean(headers['x-wolan-device-rooted'] || bodyDevice.rooted);
  const jailbroken = parseBoolean(headers['x-wolan-device-jailbroken'] || bodyDevice.jailbroken);
  const compromised = parseBoolean(headers['x-wolan-device-compromised'] || bodyDevice.compromised) || rooted || jailbroken;

  return {
    deviceId: sanitize(headers['x-wolan-device-id'] || bodyDevice.device_id || bodyDevice.deviceId, 256),
    deviceLabel: sanitize(headers['x-wolan-device-label'] || bodyDevice.device_label || bodyDevice.label, 120),
    platform: sanitize(headers['x-wolan-device-platform'] || bodyDevice.platform, 80),
    userAgent: sanitize(headers['user-agent'], 300),
    ipAddress: sanitize(getRequestIp(req), 80),
    rooted,
    jailbroken,
    compromised,
  };
};

const isDeviceFreezeReason = (value) => String(value || '').startsWith(DEVICE_FREEZE_REASON_PREFIX);

const ensureBindingDocument = (rider) => {
  if (!rider.device_binding) {
    rider.device_binding = { status: 'unbound' };
  }
  if (!Array.isArray(rider.device_binding_history)) {
    rider.device_binding_history = [];
  }
};

const pushDeviceHistory = ({ rider, event, reason, actor, deviceContext, deviceHash }) => {
  ensureBindingDocument(rider);
  rider.device_binding_history.push({
    event,
    reason: reason || null,
    actor_id: actor?.id || null,
    actor_role: actor?.role || 'system',
    device_id_hash: deviceHash || null,
    device_label: deviceContext?.deviceLabel || null,
    platform: deviceContext?.platform || null,
    ip_address: deviceContext?.ipAddress || null,
    occurred_at: new Date(),
  });

  if (rider.device_binding_history.length > MAX_DEVICE_HISTORY) {
    rider.device_binding_history = rider.device_binding_history.slice(-MAX_DEVICE_HISTORY);
  }
};

const emitDeviceBindingUpdate = (rider, user, eventName) => {
  const payload = {
    ...rider.toPublicJSON({ includeInternal: true }),
    account_locked: Boolean(user?.account_locked),
    locked_reason: user?.locked_reason || null,
    device_security_event: eventName,
  };

  emitToAdmin('rider:device-binding-updated', payload);
  emitToHub(readId(rider.hub_id), 'rider:device-binding-updated', payload);
  emitToUser(readId(rider.user_id), 'rider:device-binding-updated', rider.toPublicJSON());
};

const getRiderForDeviceBinding = (userId) => Rider.findOne({ user_id: userId })
  .select('+device_binding.device_id_hash +device_binding.mismatch_device_id_hash +device_binding_history')
  .populate('user_id', 'full_name email phone role hub_id is_active kyc_status account_locked failed_login_attempts locked_at locked_reason unlocked_at')
  .populate('hub_id', 'name code city coordinates');

const bindRiderDevice = async ({ rider, user, deviceContext, deviceHash }) => {
  ensureBindingDocument(rider);
  const now = new Date();

  rider.device_binding.status = 'bound';
  rider.device_binding.device_id_hash = deviceHash;
  rider.device_binding.device_label = deviceContext.deviceLabel || 'Verified rider device';
  rider.device_binding.platform = deviceContext.platform || 'unknown';
  rider.device_binding.user_agent = deviceContext.userAgent;
  rider.device_binding.bound_at = rider.device_binding.bound_at || now;
  rider.device_binding.last_seen_at = now;
  rider.device_binding.last_ip = deviceContext.ipAddress;
  rider.device_binding.frozen_at = null;
  rider.device_binding.freeze_reason = null;
  rider.device_binding.mismatch_device_id_hash = null;
  rider.device_binding.mismatch_device_label = null;

  pushDeviceHistory({
    rider,
    event: 'bound',
    reason: 'Verified rider device bound',
    actor: { id: readId(user._id), role: 'rider' },
    deviceContext,
    deviceHash,
  });

  await rider.save({ validateBeforeSave: false });
  emitDeviceBindingUpdate(rider, user, 'bound');
};

const touchRiderDevice = async ({ rider, user, deviceContext, deviceHash }) => {
  ensureBindingDocument(rider);
  const lastSeen = rider.device_binding.last_seen_at ? new Date(rider.device_binding.last_seen_at).getTime() : 0;
  const shouldPersist = Date.now() - lastSeen > 60 * 1000;

  if (!shouldPersist) {
    return;
  }

  rider.device_binding.status = 'bound';
  rider.device_binding.last_seen_at = new Date();
  rider.device_binding.last_ip = deviceContext.ipAddress;
  rider.device_binding.user_agent = deviceContext.userAgent;

  pushDeviceHistory({
    rider,
    event: 'verified',
    reason: 'Bound rider device verified',
    actor: { id: readId(user._id), role: 'rider' },
    deviceContext,
    deviceHash,
  });

  await rider.save({ validateBeforeSave: false });
};

const freezeRiderForDeviceSecurity = async ({ rider, user, deviceContext, reason, mismatchHash }) => {
  ensureBindingDocument(rider);
  const now = new Date();
  const normalizedReason = `${DEVICE_FREEZE_REASON_PREFIX}: ${reason}`;

  rider.device_binding.status = 'frozen';
  rider.device_binding.frozen_at = now;
  rider.device_binding.freeze_reason = normalizedReason;
  rider.device_binding.mismatch_device_id_hash = mismatchHash || null;
  rider.device_binding.mismatch_device_label = deviceContext.deviceLabel || null;
  rider.is_active = false;
  rider.current_status = 'offline';
  rider.suspension_reason = normalizedReason;
  rider.suspended_at = now;
  rider.suspended_by = null;

  pushDeviceHistory({
    rider,
    event: 'frozen',
    reason: normalizedReason,
    actor: { id: readId(user._id), role: 'rider' },
    deviceContext,
    deviceHash: mismatchHash || null,
  });

  user.account_locked = true;
  user.locked_at = now;
  user.locked_reason = normalizedReason;
  user.unlocked_at = null;
  user.unlocked_by = null;
  user.refresh_token_hash = null;

  await Promise.all([
    rider.save({ validateBeforeSave: false }),
    user.save({ validateBeforeSave: false }),
  ]);

  emitDeviceBindingUpdate(rider, user, 'frozen');
  throw new AppError(`${normalizedReason}. Admin device unbinding is required before this rider can continue.`, 423);
};

const ensureRiderDeviceAllowed = async ({ user, req }) => {
  if (!user || user.role !== 'rider') {
    return null;
  }

  const rider = await getRiderForDeviceBinding(user._id);
  if (!rider) {
    return null;
  }

  const deviceContext = readDeviceContext(req);
  const riderVerified = isKycVerified(user) && isRiderKycComplete(rider);
  ensureBindingDocument(rider);

  if (deviceContext.compromised) {
    await freezeRiderForDeviceSecurity({
      rider,
      user,
      deviceContext,
      reason: deviceContext.rooted || deviceContext.jailbroken
        ? 'Rooted or jailbroken device detected'
        : 'Compromised device detected',
      mismatchHash: deviceContext.deviceId ? hashDeviceId(deviceContext.deviceId) : null,
    });
  }

  if (rider.device_binding.status === 'frozen') {
    throw new AppError(`${rider.device_binding.freeze_reason || DEVICE_FREEZE_REASON_PREFIX}. Admin device unbinding is required.`, 423);
  }

  if (!riderVerified) {
    return rider;
  }

  if (!deviceContext.deviceId) {
    throw new AppError('Verified rider login requires a trusted device identity', 400);
  }

  const deviceHash = hashDeviceId(deviceContext.deviceId);

  if (!rider.device_binding.device_id_hash || rider.device_binding.status === 'unbound') {
    await bindRiderDevice({ rider, user, deviceContext, deviceHash });
    return rider;
  }

  if (rider.device_binding.device_id_hash !== deviceHash) {
    await freezeRiderForDeviceSecurity({
      rider,
      user,
      deviceContext,
      reason: 'Login attempted from a different device',
      mismatchHash: deviceHash,
    });
  }

  await touchRiderDevice({ rider, user, deviceContext, deviceHash });
  return rider;
};

const unbindRiderDevice = async ({ rider, reason, actor }) => {
  const normalizedReason = sanitize(reason, 300);
  if (!normalizedReason || normalizedReason.length < 3) {
    throw new AppError('A device unbinding reason is required', 400);
  }

  const user = await User.findById(readId(rider.user_id)).select('+refresh_token_hash');
  if (!user) {
    throw new AppError('Linked rider user account was not found', 404);
  }

  ensureBindingDocument(rider);
  const hasDeviceBinding = Boolean(
    rider.device_binding.status === 'bound'
    || rider.device_binding.status === 'frozen'
    || rider.device_binding.device_id_hash
  );

  if (!hasDeviceBinding) {
    throw new AppError('This rider does not have a device binding to clear', 400);
  }

  const wasFrozenByDevice = rider.device_binding.status === 'frozen'
    || isDeviceFreezeReason(rider.suspension_reason)
    || isDeviceFreezeReason(user.locked_reason);
  const hasManualSuspension = user.is_active === false
    || (
      rider.is_active === false
      && rider.suspension_reason
      && !isDeviceFreezeReason(rider.suspension_reason)
    );

  const previousHash = rider.device_binding.device_id_hash || null;

  rider.device_binding.status = 'unbound';
  rider.device_binding.device_id_hash = null;
  rider.device_binding.device_label = null;
  rider.device_binding.platform = null;
  rider.device_binding.user_agent = null;
  rider.device_binding.bound_at = null;
  rider.device_binding.last_seen_at = null;
  rider.device_binding.last_ip = null;
  rider.device_binding.frozen_at = null;
  rider.device_binding.freeze_reason = null;
  rider.device_binding.mismatch_device_id_hash = null;
  rider.device_binding.mismatch_device_label = null;
  rider.device_binding.unbound_at = new Date();
  rider.device_binding.unbound_by = actor?.id || null;
  rider.device_binding.unbind_reason = normalizedReason;

  pushDeviceHistory({
    rider,
    event: 'unbound',
    reason: normalizedReason,
    actor,
    deviceContext: {
      deviceLabel: 'Admin override',
      platform: actor?.role || 'admin',
      ipAddress: null,
    },
    deviceHash: previousHash,
  });

  if (wasFrozenByDevice && !hasManualSuspension) {
    rider.is_active = true;
    rider.current_status = 'offline';
    rider.suspension_reason = null;
    rider.suspended_at = null;
    rider.suspended_by = null;
    rider.reinstated_at = new Date();
    rider.reinstated_by = actor?.id || null;
  } else if (wasFrozenByDevice) {
    rider.current_status = 'offline';
    rider.reinstated_at = null;
    rider.reinstated_by = null;
  }

  if (wasFrozenByDevice) {
    user.account_locked = false;
    user.failed_login_attempts = 0;
    user.locked_at = null;
    user.locked_until = null;
    user.locked_reason = null;
    user.unlocked_at = new Date();
    user.unlocked_by = actor?.id || null;
  }

  await Promise.all([
    rider.save({ validateBeforeSave: false }),
    user.save({ validateBeforeSave: false }),
  ]);

  const hydratedRider = await getRiderForDeviceBinding(readId(user._id));
  emitDeviceBindingUpdate(hydratedRider || rider, user, 'unbound');
  return hydratedRider || rider;
};

module.exports = {
  DEVICE_FREEZE_REASON_PREFIX,
  ensureRiderDeviceAllowed,
  readDeviceContext,
  unbindRiderDevice,
};
