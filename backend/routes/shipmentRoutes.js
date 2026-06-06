const router = require('express').Router();

const {
  createShipment,
  listShipments,
  getShipmentById,
  updateShipmentStatus,
} = require('../controllers/shipmentController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { ADMIN_ROLES } = require('../constants/roleConstants');

router.route('/shipments')
  .get(protect, authorizeRoles(...[...ADMIN_ROLES, 'merchant', 'rider']), listShipments)
  .post(protect, authorizeRoles(...[...ADMIN_ROLES, 'merchant']), createShipment);

router.route('/shipments/:id')
  .get(protect, authorizeRoles(...[...ADMIN_ROLES, 'merchant', 'rider']), getShipmentById)
  .patch(protect, authorizeRoles(...[...ADMIN_ROLES, 'rider']), updateShipmentStatus);

module.exports = router;
