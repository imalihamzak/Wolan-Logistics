const router = require('express').Router();

const {
  acceptPolicies,
  downloadPolicy,
  listPolicies,
} = require('../controllers/policyController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', listPolicies);
router.post('/accept', protect, authorizeRoles('merchant', 'rider'), acceptPolicies);
router.get('/:key/download', downloadPolicy);

module.exports = router;
