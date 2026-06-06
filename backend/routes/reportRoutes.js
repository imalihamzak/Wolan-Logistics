const router = require('express').Router();

const { getAdminReports } = require('../controllers/reportController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { ADMIN_ROLES } = require('../constants/roleConstants');

router.get(
  '/admin',
  protect,
  authorizeRoles(...ADMIN_ROLES),
  getAdminReports
);

module.exports = router;
