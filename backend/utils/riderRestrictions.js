const {
  RIDER_RESTRICTION_TYPES,
  RIDER_RESTRICTION_TYPE_LABELS,
} = require('../constants/riderRestrictionConstants');

const DEVICE_FREEZE_REASON_PREFIX = 'Device security freeze';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const normalizeRestrictionType = (type) => {
  const normalized = String(type || '').trim();
  return RIDER_RESTRICTION_TYPES.includes(normalized) ? normalized : null;
};

const isTemporaryRestriction = (type) => ['soft_block', 'hard_block'].includes(type);

const readDate = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildRestrictionSchedule = ({ type, durationHours, durationDays, now = new Date() }) => {
  const normalizedType = normalizeRestrictionType(type);

  if (!normalizedType) {
    return {
      type: null,
      startedAt: now,
      expiresAt: null,
    };
  }

  if (normalizedType === 'soft_block') {
    return {
      type: normalizedType,
      startedAt: now,
      expiresAt: new Date(now.getTime() + Number(durationHours) * HOUR_MS),
    };
  }

  if (normalizedType === 'hard_block') {
    return {
      type: normalizedType,
      startedAt: now,
      expiresAt: new Date(now.getTime() + Number(durationDays) * DAY_MS),
    };
  }

  return {
    type: normalizedType,
    startedAt: now,
    expiresAt: null,
  };
};

const getRestrictionLabel = (type) => RIDER_RESTRICTION_TYPE_LABELS[type] || 'Restriction';

const buildRemainingLabel = (remainingMs) => {
  const safeRemaining = Math.max(0, Number(remainingMs || 0));

  if (!safeRemaining) {
    return '00:00:00';
  }

  const totalSeconds = Math.ceil(safeRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getRiderRestrictionSnapshot = (rider, now = new Date()) => {
  const normalizedType = normalizeRestrictionType(rider?.restriction_type);
  const reason = rider?.restriction_reason || rider?.suspension_reason || null;
  const inactive = rider?.is_active === false;

  if (!inactive && !normalizedType) {
    return {
      active: false,
      type: 'none',
      label: getRestrictionLabel('none'),
      reason: null,
      started_at: null,
      expires_at: null,
      remaining_ms: 0,
      remaining_label: 'No active restriction',
      reinstatement_state: 'operational',
      reinstatement_label: 'Operational access active',
    };
  }

  const type = normalizedType
    || (String(reason || '').startsWith(DEVICE_FREEZE_REASON_PREFIX) ? 'security_freeze' : 'manual_suspension');
  const startedAt = readDate(rider?.restriction_started_at || rider?.suspended_at);
  const expiresAt = readDate(rider?.restriction_expires_at);
  const expiresTime = expiresAt ? expiresAt.getTime() : Number.NaN;
  const nowTime = readDate(now)?.getTime() || Date.now();
  const remainingMs = Number.isFinite(expiresTime) ? Math.max(0, expiresTime - nowTime) : 0;

  let reinstatementState = 'admin_review_required';
  let reinstatementLabel = 'Admin review is required before reinstatement';

  if (!inactive) {
    reinstatementState = 'operational';
    reinstatementLabel = 'Operational access active';
  } else if (type === 'permanent_suspension') {
    reinstatementState = 'permanent_review_required';
    reinstatementLabel = 'Permanent suspension remains until admin reinstatement';
  } else if (isTemporaryRestriction(type) && expiresAt) {
    if (remainingMs > 0) {
      reinstatementState = 'restricted';
      reinstatementLabel = `Reinstatement locked for ${buildRemainingLabel(remainingMs)}`;
    } else {
      reinstatementState = 'eligible_for_reinstatement';
      reinstatementLabel = 'Penalty window ended; admin reinstatement is available';
    }
  } else if (type === 'security_freeze') {
    reinstatementState = 'admin_review_required';
    reinstatementLabel = 'Device security review and admin unbinding are required';
  }

  return {
    active: inactive,
    type,
    label: getRestrictionLabel(type),
    reason,
    started_at: startedAt,
    expires_at: expiresAt,
    remaining_ms: remainingMs,
    remaining_label: buildRemainingLabel(remainingMs),
    reinstatement_state: reinstatementState,
    reinstatement_label: reinstatementLabel,
  };
};

module.exports = {
  buildRestrictionSchedule,
  getRiderRestrictionSnapshot,
  getRestrictionLabel,
  isTemporaryRestriction,
  normalizeRestrictionType,
};
