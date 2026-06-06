const router = require('express').Router();

const {
  getSupportConfig,
  receiveProviderWebhook,
} = require('../controllers/supportController');

router.get('/config', getSupportConfig);
router.post('/webhooks/provider-events', receiveProviderWebhook);

module.exports = router;
