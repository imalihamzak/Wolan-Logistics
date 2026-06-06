const router = require('express').Router();

const {
  getOperationalSettings,
  updateOperationalSettings,
} = require('../controllers/settingsController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { ADMIN_ROLES, HQ_DASHBOARD_ROLES } = require('../constants/roleConstants');
const {
  validateOperationalSettingsUpdate,
} = require('../validation/settingsValidation');

router.get(
  '/operations',
  protect,
  authorizeRoles(...ADMIN_ROLES),
  getOperationalSettings
);

router.patch(
  '/operations',
  protect,
  authorizeRoles(...HQ_DASHBOARD_ROLES, 'ops_coordinator'),
  validateRequest(validateOperationalSettingsUpdate),
  updateOperationalSettings
);

module.exports = router;
