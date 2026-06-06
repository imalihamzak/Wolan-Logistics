const router = require('express').Router();

const {
  publicRegisterRider,
  registerRider,
  getMyRiderProfile,
  getRiderByIdController,
  listAllRiders,
  updateStatus,
  updateVehicleType,
  updateOperationalProfile,
  updateKycStatus,
  updateOperationalState,
  unbindDeviceBinding,
  updateGpsLocation,
  scanPackageTracker,
  updateTrackerLocation,
  uploadDocument,
  verifyDocument,
  registerBond,
  updateBond,
  updatePerformance,
  issueFine,
  payFineController,
  getFines,
  createIncident,
  resolveIncidentController,
  getIncidents,
  getDailySummary,
  getEarnings,
  getRiderEarnings,
  requestWithdrawal,
  listSettlementHistory,
  updateSettlementStatusController,
  recordCodSettlement,
} = require('../controllers/riderController');

const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { ADMIN_ROLES } = require('../constants/roleConstants');

const {
  validateRegisterRider,
  validateRiderQuery,
  validateUpdateStatus,
  validateVehicleTypeUpdate,
  validateRiderKycUpdate,
  validateOperationalStateUpdate,
  validateDeviceUnbind,
  validateOperationalProfileUpdate,
  validateGpsLocation,
  validateDocumentUpload,
  validateVerifyDocument,
  validateRegisterBond,
  validateRiderBondUpdate,
  validateIssueFine,
  validateIncident,
  validateResolveIncident,
  validateEarningsQuery,
  validateWithdrawalRequest,
  validateSettlementQuery,
  validateSettlementStatusUpdate,
  validateCodSettlement,
} = require('../validation/riderValidation');

const adminRoles = [...ADMIN_ROLES];

const managerRoles = [
  ...ADMIN_ROLES,
  'merchant',
];

const riderRoles = [
  ...ADMIN_ROLES,
  'rider',
];

/* =========================
   PUBLIC
========================= */

router.post(
  '/register',
  validateRequest(validateRegisterRider),
  publicRegisterRider
);

/* =========================
   RIDER SELF
========================= */

router.get(
  '/me',
  protect,
  authorizeRoles('rider'),
  getMyRiderProfile
);

router.get(
  '/me/fines',
  protect,
  authorizeRoles('rider'),
  getFines
);

router.get(
  '/me/incidents',
  protect,
  authorizeRoles('rider'),
  getIncidents
);

router.get(
  '/me/daily-summary',
  protect,
  authorizeRoles('rider'),
  getDailySummary
);

router.get(
  '/me/earnings',
  protect,
  authorizeRoles('rider'),
  validateRequest(validateEarningsQuery),
  getEarnings
);

router.post(
  '/me/status',
  protect,
  authorizeRoles('rider'),
  validateRequest(validateUpdateStatus),
  updateStatus
);

router.post(
  '/me/location',
  protect,
  authorizeRoles('rider'),
  validateRequest(validateGpsLocation),
  updateGpsLocation
);

router.post(
  '/me/document',
  protect,
  authorizeRoles('rider'),
  validateRequest(validateDocumentUpload),
  uploadDocument
);

router.post(
  '/me/bond',
  protect,
  authorizeRoles('rider'),
  validateRequest(validateRegisterBond),
  registerBond
);

router.post(
  '/me/fines/:fineId/pay',
  protect,
  authorizeRoles('rider'),
  payFineController
);

router.post(
  '/me/incident',
  protect,
  authorizeRoles('rider'),
  validateRequest(validateIncident),
  createIncident
);

router.post(
  '/me/withdrawals',
  protect,
  authorizeRoles('rider'),
  validateRequest(validateWithdrawalRequest),
  requestWithdrawal
);

/* =========================
   PACKAGE TRACKER SCAN
========================= */

router.post(
  '/orders/:orderId/scan-package-tracker',
  protect,
  authorizeRoles('rider'),
  scanPackageTracker
);

router.post(
  '/orders/:orderId/tracker-location',
  protect,
  authorizeRoles('rider'),
  validateRequest(validateGpsLocation),
  updateTrackerLocation
);

/* =========================
   SETTLEMENTS / WITHDRAWALS
========================= */

router.get(
  '/settlements',
  protect,
  authorizeRoles(...riderRoles),
  validateRequest(validateSettlementQuery),
  listSettlementHistory
);

router.patch(
  '/settlements/:settlementId/status',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateSettlementStatusUpdate),
  updateSettlementStatusController
);

/* =========================
   ADMIN / MANAGER
========================= */

router.get(
  '/',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateRiderQuery),
  listAllRiders
);

router.get(
  '/:id',
  protect,
  authorizeRoles(...adminRoles),
  getRiderByIdController
);

router.get(
  '/:id/earnings',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateEarningsQuery),
  getRiderEarnings
);

router.get(
  '/:id/incidents',
  protect,
  authorizeRoles(...adminRoles),
  getIncidents
);

router.patch(
  '/:id/status',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateUpdateStatus),
  updateStatus
);

router.patch(
  '/:id/vehicle-type',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateVehicleTypeUpdate),
  updateVehicleType
);

router.patch(
  '/:id/operational-profile',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateOperationalProfileUpdate),
  updateOperationalProfile
);

router.patch(
  '/:id/kyc',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateRiderKycUpdate),
  updateKycStatus
);

router.patch(
  '/:id/operational-state',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateOperationalStateUpdate),
  updateOperationalState
);

router.patch(
  '/:id/device-binding/unbind',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateDeviceUnbind),
  unbindDeviceBinding
);

router.patch(
  '/:id/document',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateVerifyDocument),
  verifyDocument
);

router.patch(
  '/:id/bond',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateRiderBondUpdate),
  updateBond
);

router.patch(
  '/:id/performance',
  protect,
  authorizeRoles(...adminRoles),
  updatePerformance
);

router.patch(
  '/:id/incident/:incidentId/resolve',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateResolveIncident),
  resolveIncidentController
);

router.patch(
  '/:id/incident/:incidentId/status',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateResolveIncident),
  resolveIncidentController
);

router.post(
  '/:id/fine',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateIssueFine),
  issueFine
);

router.post(
  '/:id/cod-settlement',
  protect,
  authorizeRoles(...adminRoles),
  validateRequest(validateCodSettlement),
  recordCodSettlement
);

module.exports = router;
