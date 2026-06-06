const router = require('express').Router();

const {
  createOrder,
  createBatchOrders,
  estimateOrderPricing,
  listAllOrders,
  getOrderById,
  getOrderByPackageTrackingId,
  getOrderByRiderTrackingId,
  assignRider,
  respondToOrderAssignment,
  confirmOrderHandover,
  confirmPackageCustody,
  scanOrderIntoHub,
  updateOrderStatus,
  verifyOrderDeliveryOtp,
  manualOverrideDeliveryOtp,
  submitOrderRatingController,
  markOrderFailed,
  returnOrderToMerchant,
  trackOrder,
} = require('../controllers/orderController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { ADMIN_ROLES } = require('../constants/roleConstants');
const {
  validateCreateOrder,
  validateBatchOrders,
  validatePricingEstimate,
  validateOrderQuery,
  validateOrderStatusUpdate,
  validateAssignRider,
  validateAssignmentResponse,
  validateCustodyConfirmation,
  validatePickupKeyConfirmation,
  validateHubScanIn,
  validateOtpVerification,
  validateManualOtpOverride,
  validateDeliveryIssue,
  validateOrderRating,
} = require('../validation/orderValidation');

const managerRoles = [...ADMIN_ROLES, 'merchant'];
const dispatchRoles = [...ADMIN_ROLES, 'rider'];
const orderViewerRoles = [...ADMIN_ROLES, 'merchant', 'rider'];

router.post('/batch', protect, authorizeRoles(...managerRoles), validateRequest(validateBatchOrders), createBatchOrders);
router.post('/pricing-estimate', protect, authorizeRoles(...managerRoles), validateRequest(validatePricingEstimate), estimateOrderPricing);
router.post('/', protect, authorizeRoles(...managerRoles), validateRequest(validateCreateOrder), createOrder);

router.get('/track/:packageTrackingId', trackOrder);
router.get('/', protect, authorizeRoles(...orderViewerRoles), validateRequest(validateOrderQuery), listAllOrders);
router.get('/track/:packageTrackingId/details', protect, authorizeRoles(...orderViewerRoles), getOrderByPackageTrackingId);
router.get('/rider-tracking/:riderTrackingId', protect, authorizeRoles(...orderViewerRoles), getOrderByRiderTrackingId);
router.get('/:id', protect, authorizeRoles(...orderViewerRoles), getOrderById);

router.patch('/:id/assign-rider', protect, authorizeRoles(...ADMIN_ROLES), validateRequest(validateAssignRider), assignRider);
router.post('/:id/respond', protect, authorizeRoles('rider'), validateRequest(validateAssignmentResponse), respondToOrderAssignment);
router.post('/:id/confirm-handover', protect, authorizeRoles('merchant'), validateRequest(validatePickupKeyConfirmation), confirmOrderHandover);
router.post('/:id/confirm-custody', protect, authorizeRoles('rider'), validateRequest(validateCustodyConfirmation), confirmPackageCustody);
router.post('/:id/hub-scan-in', protect, authorizeRoles(...ADMIN_ROLES), validateRequest(validateHubScanIn), scanOrderIntoHub);
router.patch('/:id/status', protect, authorizeRoles(...dispatchRoles), validateRequest(validateOrderStatusUpdate), updateOrderStatus);
router.post('/:id/verify-otp', protect, authorizeRoles('rider'), validateRequest(validateOtpVerification), verifyOrderDeliveryOtp);
router.post('/:id/manual-otp-override', protect, authorizeRoles('super_admin', 'director', 'general_manager', 'hub_manager'), validateRequest(validateManualOtpOverride), manualOverrideDeliveryOtp);
router.post('/:id/rating', protect, authorizeRoles(...[...ADMIN_ROLES, 'merchant']), validateRequest(validateOrderRating), submitOrderRatingController);
router.post('/:id/failed', protect, authorizeRoles(...dispatchRoles), validateRequest(validateDeliveryIssue), markOrderFailed);
router.post('/:id/return-to-merchant', protect, authorizeRoles(...orderViewerRoles), validateRequest(validateDeliveryIssue), returnOrderToMerchant);

module.exports = router;
