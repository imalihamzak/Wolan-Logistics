const router = require('express').Router();
const { healthCheck, welcome } = require('../controllers/healthController');

router.get('/welcome', welcome);
router.get('/health', healthCheck);

module.exports = router;
