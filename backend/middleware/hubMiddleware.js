const mongoose = require('mongoose');
const {
  ADMIN_ROLES,
  HUB_DASHBOARD_ROLES,
  HQ_DASHBOARD_ROLES,
  canAccessAllHubs,
  canAccessAssignedHubs,
  getAssignedHubIds,
  isAdminRole,
  buildHubScopedMatch,
  assertHubAccess,
} = require('../utils/hubAccess');

/**
 * Hub Middleware - Handles hub-based access control and data isolation
 */

const HUB_ADMIN_ROLES = [...HQ_DASHBOARD_ROLES, 'hub_manager'];
const HUB_OPS_ROLES = [...ADMIN_ROLES];
const ALL_MANAGEMENT_ROLES = [...ADMIN_ROLES, 'merchant'];

/**
 * Check if user has hub management role
 */
const hasHubManagementRole = (user) => {
  return HUB_ADMIN_ROLES.includes(user?.role);
};

/**
 * Check if user has hub operations role
 */
const hasHubOpsRole = (user) => {
  return HUB_OPS_ROLES.includes(user?.role);
};

/**
 * Get user's hub ID from context
 */
const getUserHubId = (user) => {
  if (!user) return null;
  
  // HQ users can see all, check if they have a specific hub filter
  if (canAccessAllHubs(user)) {
    return user.hub_id || null;
  }
  
  // Hub users must have hub_id
  if (user.hub_id) {
    return new mongoose.Types.ObjectId(user.hub_id);
  }
  
  return null;
};

/**
 * Build hub filter for queries based on user role
 */
const buildHubFilter = (user, additionalHubId = null) => {
  return buildHubScopedMatch(user, { hub_id: additionalHubId }, { actionName: 'Hub access' });
};

/**
 * Filter hub ID from request query/body
 */
const filterHubIdFromRequest = (req, fieldName = 'hub_id') => {
  // For HQ users, allow passing hub_id in request to filter
  if (canAccessAllHubs(req.user) && req.body?.[fieldName]) {
    return req.body[fieldName];
  }

  if (canAccessAssignedHubs(req.user) && req.body?.[fieldName]) {
    assertHubAccess(req.user, req.body[fieldName]);
    return req.body[fieldName];
  }
  
  // Other users can only use their assigned hub
  return req.user?.hub_id || null;
};

/**
 * Middleware to enforce hub isolation on requests
 */
const enforceHubIsolation = (req, res, next) => {
  try {
    // If no user, deny
    if (!req.user) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      return next(error);
    }
    
    // HQ and regional users can access their configured scope.
    if (canAccessAllHubs(req.user) || canAccessAssignedHubs(req.user)) {
      if (canAccessAssignedHubs(req.user) && getAssignedHubIds(req.user).length === 0) {
        const error = new Error('Assigned hubs are required for regional access.');
        error.statusCode = 403;
        return next(error);
      }
      return next();
    }
    
    // Hub users must have hub_id assigned
    if (!req.user.hub_id) {
      const error = new Error('Hub not assigned. Please contact administrator.');
      error.statusCode = 403;
      return next(error);
    }
    
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Middleware to allow only hub managers
 */
const requireHubManager = (req, res, next) => {
  if (!req.user || !HUB_ADMIN_ROLES.includes(req.user.role)) {
    const error = new Error('Hub manager access required');
    error.statusCode = 403;
    return next(error);
  }
  return next();
};

/**
 * Middleware to allow hub operations roles
 */
const requireHubOps = (req, res, next) => {
  if (!req.user || !HUB_OPS_ROLES.includes(req.user.role)) {
    const error = new Error('Hub operations access required');
    error.statusCode = 403;
    return next(error);
  }
  return next();
};

/**
 * Middleware to allow any management role
 */
const requireManagementRole = (req, res, next) => {
  if (!req.user || !ALL_MANAGEMENT_ROLES.includes(req.user.role)) {
    const error = new Error('Management access required');
    error.statusCode = 403;
    return next(error);
  }
  return next();
};

/**
 * Get hub context for aggregation pipelines
 */
const getHubAggregationContext = (user, hubIdFromQuery = null) => {
  const context = {
    userId: user?.id,
    userRole: user?.role,
    hubId: null,
    canAccessAll: canAccessAllHubs(user),
  };
  
  // Determine which hub to use
  if (hubIdFromQuery && (canAccessAllHubs(user) || canAccessAssignedHubs(user))) {
    assertHubAccess(user, hubIdFromQuery);
    context.hubId = hubIdFromQuery;
  } else if (user?.hub_id) {
    // Use assigned hub
    context.hubId = user.hub_id;
  }
  
  return context;
};

/**
 * Add hub filter to common query options
 */
const addHubFilterToQuery = (query, user, additionalHubId = null) => {
  const hubFilter = buildHubFilter(user, additionalHubId);
  return { ...query, ...hubFilter };
};

module.exports = {
  HUB_ADMIN_ROLES,
  HUB_OPS_ROLES,
  ALL_MANAGEMENT_ROLES,
  canAccessAllHubs,
  hasHubManagementRole,
  hasHubOpsRole,
  getUserHubId,
  buildHubFilter,
  assertHubAccess,
  filterHubIdFromRequest,
  enforceHubIsolation,
  requireHubManager,
  requireHubOps,
  requireManagementRole,
  getHubAggregationContext,
  addHubFilterToQuery,
};
