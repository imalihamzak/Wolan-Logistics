const router = require('express').Router();

const {
	register,
	createStaffUser,
	login,
	sendLoginOtp,
	verifyLoginOtp,
	refreshToken,
	logout,
	forgotPassword,
	resetPassword,
	changePassword,
	me,
	listUsers,
	unlockUserAccount,
	updateUserHubScope,
} = require('../controllers/authController');
const {
	googleCallback,
	exchangeGoogleSession,
	googleStatus,
	startGoogleLogin,
} = require('../controllers/oauthController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { ADMIN_ROLES, HQ_DASHBOARD_ROLES } = require('../constants/roleConstants');
const {
	validateRegister,
	validateLogin,
	validateSendOtp,
	validateVerifyOtp,
	validateForgotPassword,
	validateResetPassword,
	validateChangePassword,
} = require('../validation/authValidation');



router.get('/google', startGoogleLogin);
router.get('/google/callback', googleCallback);
router.post('/google/session', exchangeGoogleSession);
router.get('/google/status', googleStatus);
router.post('/register', validateRequest(validateRegister), register);
router.post('/login', validateRequest(validateLogin), login);
router.post('/send-otp', validateRequest(validateSendOtp), sendLoginOtp);
router.post('/verify-otp', validateRequest(validateVerifyOtp), verifyLoginOtp);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.post('/forgot-password', validateRequest(validateForgotPassword), forgotPassword);
router.post('/reset-password/:resetToken', validateRequest(validateResetPassword), resetPassword);
router.patch('/change-password', protect, validateRequest(validateChangePassword), changePassword);
router.get('/me', protect, me);
router.get('/users', protect, authorizeRoles(...ADMIN_ROLES), listUsers);
router.post('/users', protect, authorizeRoles(...HQ_DASHBOARD_ROLES), validateRequest(validateRegister), createStaffUser);
router.patch('/users/:id/unlock', protect, authorizeRoles(...ADMIN_ROLES), unlockUserAccount);
router.patch('/users/:id/hub-scope', protect, authorizeRoles(...HQ_DASHBOARD_ROLES), updateUserHubScope);

module.exports = router;
