const router = require('express').Router();

const {
  createHub,
  listHubs,
  getHubById,
  updateHub,
  suspendHub,
  assignManager,
  getHubAnalytics,
  getHQDashboard,
  listAvailableHubManagers,
  getHubDeliveryReport,
  getHubRiderReport,
  getHubTimeSeries,
} = require('../controllers/hubController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const enforceHubIsolation = require('../middleware/hubMiddleware');
const {
  ADMIN_ROLES,
  HUB_DASHBOARD_ROLES,
  REGIONAL_DASHBOARD_ROLES,
  HQ_DASHBOARD_ROLES,
} = require('../constants/roleConstants');
const validateRequest = require('../middleware/validateRequest');
const {
  validateCreateHub,
  validateUpdateHub,
  validateSuspendHub,
  validateAssignManager,
  validateHubQuery,
  validateAnalyticsQuery,
} = require('../validation/hubValidation');

// Hub management routes
router.route('/hubs')
  .get(protect, authorizeRoles(...ADMIN_ROLES), validateRequest(validateHubQuery), listHubs)
  .post(protect, authorizeRoles(...HQ_DASHBOARD_ROLES), validateRequest(validateCreateHub), createHub);

router.route('/hubs/managers/available')
  .get(protect, authorizeRoles(...HQ_DASHBOARD_ROLES), listAvailableHubManagers);

router.route('/hubs/:id')
  .get(protect, authorizeRoles(...ADMIN_ROLES), getHubById)
  .patch(protect, authorizeRoles(...HQ_DASHBOARD_ROLES, 'hub_manager'), validateRequest(validateUpdateHub), updateHub);

router.route('/hubs/:id/suspend')
  .post(protect, authorizeRoles(...HQ_DASHBOARD_ROLES), validateRequest(validateSuspendHub), suspendHub);

router.route('/hubs/:id/assign-manager')
  .post(protect, authorizeRoles(...HQ_DASHBOARD_ROLES), validateRequest(validateAssignManager), assignManager);

// Analytics & reports
router.route('/hubs/:id/analytics')
  .get(protect, authorizeRoles(...ADMIN_ROLES), validateRequest(validateAnalyticsQuery), getHubAnalytics);

router.route('/hubs/:id/delivery-report')
  .get(protect, authorizeRoles(...ADMIN_ROLES), validateRequest(validateAnalyticsQuery), getHubDeliveryReport);

router.route('/hubs/:id/rider-report')
  .get(protect, authorizeRoles(...ADMIN_ROLES), getHubRiderReport);

router.route('/hubs/:id/time-series')
  .get(protect, authorizeRoles(...ADMIN_ROLES), getHubTimeSeries);

// HQ Dashboard (all hubs)
router.route('/hq/dashboard')
  .get(protect, authorizeRoles(...HQ_DASHBOARD_ROLES), getHQDashboard);

module.exports = router;
