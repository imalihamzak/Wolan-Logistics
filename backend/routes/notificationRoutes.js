const router = require('express').Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { ADMIN_ROLES } = require('../constants/roleConstants');

// All notification routes require authentication
router.use(authMiddleware);

// Get notification statistics (admin-level only)
router.get('/stats',
  roleMiddleware(ADMIN_ROLES),
  notificationController.getNotificationStats
);

// Get all notifications with filtering
router.get('/',
  roleMiddleware([...ADMIN_ROLES, 'merchant', 'rider']),
  notificationController.getNotifications
);

// Get single notification
router.get('/:id',
  roleMiddleware([...ADMIN_ROLES, 'merchant', 'rider']),
  notificationController.getNotification
);

// Create single notification
router.post('/',
  roleMiddleware([...ADMIN_ROLES, 'merchant']),
  notificationController.createNotification
);

// Bulk create notifications
router.post('/bulk',
  roleMiddleware([...ADMIN_ROLES, 'merchant']),
  notificationController.bulkCreateNotifications
);

// Update notification status
router.patch('/:id/status',
  roleMiddleware([...ADMIN_ROLES, 'merchant']),
  notificationController.updateNotificationStatus
);

// Retry failed notification
router.post('/:id/retry',
  roleMiddleware([...ADMIN_ROLES, 'merchant']),
  notificationController.retryNotification
);

// Delete notification
router.delete('/:id',
  roleMiddleware([...ADMIN_ROLES, 'merchant']),
  notificationController.deleteNotification
);

module.exports = router;
