const router = require('express').Router();

const {
  getAdminDashboard,
  getHubDashboard,
  getRegionalDashboard,
  getHQDashboard,
  getLiveMap,
} = require('../controllers/dashboardController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const {
  ADMIN_ROLES,
  HUB_DASHBOARD_ROLES,
  REGIONAL_DASHBOARD_ROLES,
  HQ_DASHBOARD_ROLES,
} = require('../constants/roleConstants');

router.get(
  '/admin',
  protect,
  authorizeRoles(...ADMIN_ROLES),
  getAdminDashboard
);

router.get(
  '/hub',
  protect,
  authorizeRoles(...HUB_DASHBOARD_ROLES),
  getHubDashboard
);

router.get(
  '/regional',
  protect,
  authorizeRoles(...REGIONAL_DASHBOARD_ROLES),
  getRegionalDashboard
);

router.get(
  '/hq',
  protect,
  authorizeRoles(...HQ_DASHBOARD_ROLES),
  getHQDashboard
);

router.get(
  '/live-map',
  protect,
  authorizeRoles(...ADMIN_ROLES),
  getLiveMap
);

module.exports = router;
