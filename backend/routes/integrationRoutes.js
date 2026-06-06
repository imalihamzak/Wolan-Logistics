const router = require('express').Router();

const { getIntegrationStatus } = require('../controllers/integrationController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { ADMIN_ROLES } = require('../constants/roleConstants');

router.get(
  '/',
  protect,
  authorizeRoles(...ADMIN_ROLES),
  getIntegrationStatus
);

module.exports = router;
