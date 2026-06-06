const router = require('express').Router();

const {
  registerMerchant,
  createMerchant,
  loginMerchant,
  sendMerchantOtp,
  verifyMerchantOtp,
  refreshMerchantToken,
  logoutMerchant,
  forgotPassword,
  resetPassword,
  changePassword,
  getCurrentMerchant,
  updateCurrentMerchant,
  submitCurrentMerchantKyc,
  listAllMerchants,
  getMerchantById,
  updateMerchant,
  updateMerchantKyc,
  unlockMerchantAccount,
  listMerchantEscalationQueue,
  updateMerchantEscalation,
  deleteMerchant,
  getMerchantDashboard,
  getMerchantDashboardById,
  getReferralEarnings,
  getCodReports,
  getPayoutHistory,
  getMerchantQrCode,
  regenerateMerchantQrCode,
} = require('../controllers/merchantController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { ADMIN_ROLES } = require('../constants/roleConstants');
const {
  validateMerchantRegister,
  validateMerchantLogin,
  validateMerchantSendOtp,
  validateMerchantVerifyOtp,
  validateMerchantForgotPassword,
  validateMerchantUpdate,
  validateMerchantKycUpdate,
  validateMerchantKycSubmission,
  validateMerchantEscalationUpdate,
  validateMerchantQuery,
  validateMerchantPasswordReset,
  validateMerchantChangePassword,
} = require('../validation/merchantValidation');

const adminRoles = [...ADMIN_ROLES];
const anyMerchantRole = [...ADMIN_ROLES, 'merchant'];

router.post('/register', validateRequest(validateMerchantRegister), registerMerchant);
router.post('/login', validateRequest(validateMerchantLogin), loginMerchant);
router.post('/send-otp', validateRequest(validateMerchantSendOtp), sendMerchantOtp);
router.post('/verify-otp', validateRequest(validateMerchantVerifyOtp), verifyMerchantOtp);
router.post('/refresh-token', refreshMerchantToken);
router.post('/logout', logoutMerchant);
router.post('/forgot-password', validateRequest(validateMerchantForgotPassword), forgotPassword);
router.post('/reset-password/:resetToken', validateRequest(validateMerchantPasswordReset), resetPassword);
router.patch('/change-password', protect, authorizeRoles(...anyMerchantRole), validateRequest(validateMerchantChangePassword), changePassword);

router.get('/me', protect, authorizeRoles(...anyMerchantRole), getCurrentMerchant);
router.patch('/me', protect, authorizeRoles(...anyMerchantRole), validateRequest(validateMerchantUpdate), updateCurrentMerchant);
router.patch('/me/kyc', protect, authorizeRoles('merchant'), validateRequest(validateMerchantKycSubmission), submitCurrentMerchantKyc);
router.get('/dashboard', protect, authorizeRoles(...anyMerchantRole), getMerchantDashboard);
router.get('/referral-earnings', protect, authorizeRoles(...anyMerchantRole), getReferralEarnings);
router.get('/cod-reports', protect, authorizeRoles(...anyMerchantRole), getCodReports);
router.get('/payout-history', protect, authorizeRoles(...anyMerchantRole), getPayoutHistory);
router.get('/qr-code', protect, authorizeRoles('merchant'), getMerchantQrCode);
router.post('/qr-code', protect, authorizeRoles('merchant'), regenerateMerchantQrCode);

router.get('/', protect, authorizeRoles(...adminRoles), validateRequest(validateMerchantQuery), listAllMerchants);
router.post('/', protect, authorizeRoles(...adminRoles), validateRequest(validateMerchantRegister), createMerchant);
router.get('/escalations/queue', protect, authorizeRoles(...adminRoles), listMerchantEscalationQueue);
router.get('/:id', protect, authorizeRoles(...adminRoles), getMerchantById);
router.patch('/:id', protect, authorizeRoles(...adminRoles), validateRequest(validateMerchantUpdate), updateMerchant);
router.patch('/:id/kyc', protect, authorizeRoles(...adminRoles), validateRequest(validateMerchantKycUpdate), updateMerchantKyc);
router.patch('/:id/unlock', protect, authorizeRoles(...adminRoles), unlockMerchantAccount);
router.patch('/:id/escalation', protect, authorizeRoles(...adminRoles), validateRequest(validateMerchantEscalationUpdate), updateMerchantEscalation);
router.delete('/:id', protect, authorizeRoles(...adminRoles), deleteMerchant);
router.get('/:id/dashboard', protect, authorizeRoles(...adminRoles), getMerchantDashboardById);
router.get('/:id/qr-code', protect, authorizeRoles(...adminRoles), getMerchantQrCode);
router.post('/:id/qr-code', protect, authorizeRoles(...adminRoles), regenerateMerchantQrCode);

module.exports = router;
