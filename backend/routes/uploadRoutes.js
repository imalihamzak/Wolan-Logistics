const router = require('express').Router();

const { getUploadFile, uploadSingleFile } = require('../controllers/uploadController');
const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const upload = require('../utils/upload');
const { ADMIN_ROLES } = require('../constants/roleConstants');

router.post(
  '/uploads/single',
  protect,
  authorizeRoles(...[...ADMIN_ROLES, 'merchant', 'rider']),
  upload.single('file'),
  uploadSingleFile
);

router.get(
  '/uploads/:uploadId',
  protect,
  authorizeRoles(...[...ADMIN_ROLES, 'merchant', 'rider']),
  getUploadFile
);

module.exports = router;
