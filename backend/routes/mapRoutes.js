const router = require('express').Router();

const { lookupAddresses } = require('../controllers/mapController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { ADMIN_ROLES } = require('../constants/roleConstants');

router.get(
  '/geocode',
  protect,
  authorizeRoles(...[...ADMIN_ROLES, 'merchant', 'rider']),
  lookupAddresses
);

module.exports = router;
