const path = require('path');
const fs = require('fs');

const mongoose = require('mongoose');

const Upload = require('../models/Upload');
const Order = require('../models/Order');
const Hub = require('../models/Hub');
const Rider = require('../models/Rider');
const Merchant = require('../models/Merchant');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const {
  isAdminRole,
  canAccessAllHubs,
  assertHubAccess,
  buildHubScopedMatch,
} = require('../utils/hubAccess');

const uploadRoot = path.resolve(__dirname, '..', 'uploads');

const readId = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return String(value._id || value.id || value);
  }
  return String(value);
};

const assertOrderUploadAccess = (order, user) => {
  const orderHubId = readId(order.hub_id);

  if (canAccessAllHubs(user)) {
    return orderHubId;
  }

  if (isAdminRole(user.role)) {
    assertHubAccess(user, orderHubId, 'Order upload access');
    return orderHubId;
  }

  if (user.role === 'merchant' && readId(order.merchant_id) !== String(user.id)) {
    throw new AppError('Forbidden', 403);
  }

  if (user.role === 'rider' && readId(order.rider_id) !== String(user.id)) {
    throw new AppError('Forbidden', 403);
  }

  return orderHubId;
};

const resolveUploadHubId = async (req) => {
  const { related_model: relatedModel, related_id: relatedId } = req.body;

  if (!relatedModel || !relatedId || !mongoose.Types.ObjectId.isValid(relatedId)) {
    throw new AppError('related_model and valid related_id are required', 400);
  }

  if (relatedModel === 'Order') {
    const order = await Order.findById(relatedId);
    if (!order) {
      throw new AppError('Related order not found', 404);
    }

    const orderHubId = assertOrderUploadAccess(order, req.user);
    if (req.body.hub_id && String(req.body.hub_id) !== orderHubId) {
      throw new AppError('Upload hub does not match related order hub', 400);
    }
    return orderHubId;
  }

  if (relatedModel === 'Rider') {
    const rider = await Rider.findById(relatedId);
    if (!rider) {
      throw new AppError('Related rider not found', 404);
    }

    const riderHubId = readId(rider.hub_id);

    if (canAccessAllHubs(req.user)) {
      if (req.body.hub_id && String(req.body.hub_id) !== riderHubId) {
        throw new AppError('Upload hub does not match related rider hub', 400);
      }
      return riderHubId;
    }

    if (isAdminRole(req.user.role)) {
      assertHubAccess(req.user, riderHubId, 'Rider upload access');
      if (req.body.hub_id && String(req.body.hub_id) !== riderHubId) {
        throw new AppError('Upload hub does not match related rider hub', 400);
      }
      return riderHubId;
    }

    if (req.user.role === 'rider') {
      if (readId(rider.user_id) !== String(req.user.id)) {
        throw new AppError('Rider document upload must belong to the authenticated rider', 403);
      }
      if (req.body.hub_id && String(req.body.hub_id) !== riderHubId) {
        throw new AppError('Upload hub does not match related rider hub', 400);
      }
      return riderHubId;
    }

    throw new AppError('Forbidden', 403);
  }

  if (relatedModel === 'Merchant') {
    const merchant = await Merchant.findById(relatedId);
    if (!merchant) {
      throw new AppError('Related merchant not found', 404);
    }

    const merchantHubId = readId(merchant.hub_id);

    if (canAccessAllHubs(req.user)) {
      if (req.body.hub_id && merchantHubId && String(req.body.hub_id) !== merchantHubId) {
        throw new AppError('Upload hub does not match related merchant hub', 400);
      }
      return merchantHubId || req.body.hub_id || null;
    }

    if (isAdminRole(req.user.role)) {
      const requestedHubId = merchantHubId || req.body.hub_id;
      assertHubAccess(req.user, requestedHubId, 'Merchant upload access');
      if (req.body.hub_id && merchantHubId && String(req.body.hub_id) !== merchantHubId) {
        throw new AppError('Upload hub does not match related merchant hub', 400);
      }
      return requestedHubId;
    }

    if (req.user.role === 'merchant') {
      if (String(merchant._id) !== String(req.user.id)) {
        throw new AppError('Merchant KYC document upload must belong to the authenticated merchant', 403);
      }
      if (req.body.hub_id && merchantHubId && String(req.body.hub_id) !== merchantHubId) {
        throw new AppError('Upload hub does not match related merchant hub', 400);
      }
      return merchantHubId || req.user.hub_id || null;
    }

    throw new AppError('Forbidden', 403);
  }

  if (canAccessAllHubs(req.user)) {
    if (!req.body.hub_id) {
      throw new AppError('hub_id is required for this upload', 400);
    }
    return req.body.hub_id;
  }

  const scopedMatch = buildHubScopedMatch(req.user, { hub_id: req.body.hub_id }, {
    actionName: 'Upload',
  });
  if (scopedMatch.hub_id?.$in) {
    throw new AppError('hub_id is required for regional uploads', 400);
  }
  return scopedMatch.hub_id;
};

const uploadSingleFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('File is required', 400);
  }

  const hubId = await resolveUploadHubId(req);
  if (hubId) {
    const hubExists = await Hub.exists({ _id: hubId });
    if (!hubExists) {
      throw new AppError('hub_id is invalid', 400);
    }
  }

  const upload = await Upload.create({
    hub_id: hubId,
    uploaded_by: req.user.id,
    related_model: req.body.related_model,
    related_id: req.body.related_id,
    file_name: req.file.originalname,
    file_path: req.file.path,
    mime_type: req.file.mimetype,
    file_size: req.file.size,
  });

  return successResponse(res, 'File uploaded successfully', {
    upload: {
      ...upload.toObject(),
      public_path: path.basename(upload.file_path),
    },
  }, 201);
});

const assertUploadAccess = (upload, user) => {
  if (canAccessAllHubs(user)) {
    return;
  }

  if (isAdminRole(user.role)) {
    assertHubAccess(user, upload.hub_id, 'Upload file access');
    return;
  }

  if (String(upload.uploaded_by) === String(user.id)) {
    return;
  }

  throw new AppError('Forbidden', 403);
};

const getUploadFile = asyncHandler(async (req, res) => {
  const upload = await Upload.findById(req.params.uploadId);
  if (!upload) {
    throw new AppError('Upload not found', 404);
  }

  assertUploadAccess(upload, req.user);

  const resolvedPath = path.resolve(upload.file_path);
  if (resolvedPath !== uploadRoot && !resolvedPath.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new AppError('Uploaded file path is invalid', 403);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new AppError('Uploaded file not found on server', 404);
  }

  const dispositionType = ['1', 'true', 'yes'].includes(String(req.query.download || '').toLowerCase())
    ? 'attachment'
    : 'inline';
  const safeFileName = upload.file_name.replace(/["\r\n]/g, '').trim() || 'upload';

  res.setHeader('Content-Type', upload.mime_type);
  res.setHeader('Content-Disposition', `${dispositionType}; filename="${safeFileName}"`);
  return res.sendFile(resolvedPath);
});

module.exports = {
  uploadSingleFile,
  getUploadFile,
};
