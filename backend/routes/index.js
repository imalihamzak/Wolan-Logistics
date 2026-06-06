const router = require('express').Router();

const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const hubRoutes = require('./hubRoutes');
const merchantRoutes = require('./merchantRoutes');
const orderRoutes = require('./orderRoutes');
const riderRoutes = require('./riderRoutes');
const shipmentRoutes = require('./shipmentRoutes');
const uploadRoutes = require('./uploadRoutes');
const notificationRoutes = require('./notificationRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const reportRoutes = require('./reportRoutes');
const policyRoutes = require('./policyRoutes');
const integrationRoutes = require('./integrationRoutes');
const supportRoutes = require('./supportRoutes');
const settingsRoutes = require('./settingsRoutes');
const mapRoutes = require('./mapRoutes');

router.use('/', healthRoutes);
router.use('/support', supportRoutes);
router.use('/auth', healthRoutes);
router.use('/auth', authRoutes);
router.use('/auth', hubRoutes);
router.use('/auth/merchants', merchantRoutes);
router.use('/auth/orders', orderRoutes);
router.use('/auth/riders', riderRoutes);
router.use('/auth/dashboard', dashboardRoutes);
router.use('/auth/reports', reportRoutes);
router.use('/auth/policies', policyRoutes);
router.use('/auth/integrations', integrationRoutes);
router.use('/auth/maps', mapRoutes);
router.use('/auth/settings', settingsRoutes);
router.use('/auth', shipmentRoutes);
router.use('/auth', uploadRoutes);
router.use('/auth/notifications', notificationRoutes);

module.exports = router;
