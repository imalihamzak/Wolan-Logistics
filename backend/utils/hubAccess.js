const mongoose = require('mongoose');

const AppError = require('./AppError');
const {
  ADMIN_ROLES,
  HUB_DASHBOARD_ROLES,
  REGIONAL_DASHBOARD_ROLES,
  HQ_DASHBOARD_ROLES,
  canAccessAllHubsByRole,
  canAccessAssignedHubsByRole,
  canAccessSingleHubByRole,
  getDashboardLevelForRole,
  isAdminRole,
} = require('../constants/roleConstants');

const toObjectId = (value, fieldName = 'hub_id') => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(`${fieldName} is invalid`, 400);
  }
  return new mongoose.Types.ObjectId(value);
};

const readId = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return String(value._id || value.id || value);
  return String(value);
};

const getAssignedHubIds = (actor = {}) => {
  const ids = [];
  const append = (value) => {
    const id = readId(value);
    if (id && mongoose.Types.ObjectId.isValid(id) && !ids.includes(id)) {
      ids.push(id);
    }
  };

  append(actor.hub_id);
  (actor.assigned_hub_ids || []).forEach(append);
  return ids;
};

const canAccessAllHubs = (actor = {}) => canAccessAllHubsByRole(actor.role);
const canAccessAssignedHubs = (actor = {}) => canAccessAssignedHubsByRole(actor.role);
const canAccessSingleHub = (actor = {}) => canAccessSingleHubByRole(actor.role);

const assertAdminAccess = (actor = {}, actionName = 'Admin access') => {
  if (!isAdminRole(actor.role)) {
    throw new AppError(`${actionName} requires admin permission`, 403);
  }
};

const assertDashboardLevel = (actor = {}, level = null) => {
  if (!level || level === 'auto' || level === 'admin') {
    return;
  }

  const actualLevel = getDashboardLevelForRole(actor.role);
  if (level !== actualLevel) {
    throw new AppError(`${level} dashboard access is not allowed for this role`, 403);
  }
};

const buildHubScopedMatch = (actor = {}, query = {}, options = {}) => {
  const {
    field = 'hub_id',
    required = true,
    actionName = 'Hub data access',
    level = null,
  } = options;
  const match = {};
  const requestedHubId = query.hub_id || query[field] || null;

  assertAdminAccess(actor, actionName);
  assertDashboardLevel(actor, level);

  if (requestedHubId) {
    toObjectId(requestedHubId, 'hub_id');
  }

  if (canAccessAllHubs(actor)) {
    if (requestedHubId) {
      match[field] = toObjectId(requestedHubId, 'hub_id');
    }
    return match;
  }

  const assignedHubIds = getAssignedHubIds(actor);
  if (assignedHubIds.length === 0) {
    if (!required) {
      return { _id: null };
    }
    throw new AppError(`${actionName} requires an assigned hub`, 403);
  }

  if (requestedHubId) {
    if (!assignedHubIds.includes(String(requestedHubId))) {
      throw new AppError('Forbidden', 403);
    }
    match[field] = toObjectId(requestedHubId, 'hub_id');
    return match;
  }

  if (canAccessAssignedHubs(actor)) {
    match[field] = { $in: assignedHubIds.map((id) => toObjectId(id, 'hub_id')) };
    return match;
  }

  if (canAccessSingleHub(actor)) {
    match[field] = toObjectId(assignedHubIds[0], 'hub_id');
    return match;
  }

  throw new AppError('Forbidden', 403);
};

const buildHubDocumentFilter = (actor = {}, query = {}, options = {}) => {
  const scoped = buildHubScopedMatch(actor, query, { ...options, field: '_id' });
  return scoped._id === undefined ? {} : { _id: scoped._id };
};

const assertHubAccess = (actor = {}, targetHubId, actionName = 'Hub access') => {
  if (!targetHubId) {
    throw new AppError(`${actionName} requires a hub`, 400);
  }

  buildHubScopedMatch(actor, { hub_id: targetHubId }, { actionName });
  return true;
};

const canUseHub = (actor = {}, targetHubId) => {
  try {
    assertHubAccess(actor, targetHubId);
    return true;
  } catch (error) {
    return false;
  }
};

const describeHubScope = (actor = {}, scopedMatch = {}) => {
  const level = getDashboardLevelForRole(actor.role);
  const hubValue = scopedMatch.hub_id;
  const hubIds = hubValue?.$in
    ? hubValue.$in.map(String)
    : hubValue
      ? [String(hubValue)]
      : [];

  return {
    actor_role: actor.role,
    level,
    hub_id: hubIds.length === 1 ? hubIds[0] : null,
    hub_ids: hubIds,
    can_access_all_hubs: canAccessAllHubs(actor),
    can_access_assigned_hubs: canAccessAssignedHubs(actor),
    cross_hub_access:
      level === 'hq' ? 'all_hubs'
        : level === 'regional' ? 'assigned_hubs_only'
          : level === 'hub' ? 'assigned_hub_only'
            : 'none',
  };
};

module.exports = {
  ADMIN_ROLES,
  HUB_DASHBOARD_ROLES,
  REGIONAL_DASHBOARD_ROLES,
  HQ_DASHBOARD_ROLES,
  canAccessAllHubs,
  canAccessAssignedHubs,
  canAccessSingleHub,
  isAdminRole,
  getDashboardLevelForRole,
  getAssignedHubIds,
  toObjectId,
  readId,
  assertAdminAccess,
  assertDashboardLevel,
  buildHubScopedMatch,
  buildHubDocumentFilter,
  assertHubAccess,
  canUseHub,
  describeHubScope,
};
