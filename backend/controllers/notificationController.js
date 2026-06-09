const mongoose = require('mongoose');

const Notification = require('../models/Notification');
const notificationService = require('../services/notificationService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const { templates } = require('../utils/notificationTemplates');
const {
  ADMIN_ROLES,
  isAdminRole,
  canAccessAllHubs,
  getAssignedHubIds,
} = require('../utils/hubAccess');

const NOTIFICATION_TYPES = Notification.schema.path('type').enumValues;
const NOTIFICATION_CATEGORIES = Notification.schema.path('category').enumValues;
const NOTIFICATION_PRIORITIES = Notification.schema.path('priority').enumValues;
const ACCOUNT_BOUND_CHANNELS = ['in_app', 'push'];
const EXTERNAL_CONTACT_CHANNELS = ['sms', 'whatsapp', 'email'];
const phonePattern = /^\+[1-9]\d{7,14}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECURE_OTP_CATEGORY = 'otp';
const withSecureOtpExcluded = (filter = {}) => ({
  ...filter,
  category: { $ne: SECURE_OTP_CATEGORY },
  template_key: { $not: /otp/i },
});

const toPositiveInteger = (value, fallback, max = 100) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) {
    return fallback;
  }

  return Math.min(Math.floor(number), max);
};

const assertValidObjectId = (value, label) => {
  if (value && !mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(`${label} is invalid`, 400);
  }
};

const assertRequiredObjectId = (value, label) => {
  if (!value) {
    throw new AppError(`${label} is required`, 400);
  }

  assertValidObjectId(value, label);
};

const normalizeText = (value) => String(value || '').trim();

const normalizeOptionalPhone = (value) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
};

const normalizeOptionalEmail = (value) => normalizeText(value).toLowerCase();

const assertNotificationType = (type) => {
  if (!NOTIFICATION_TYPES.includes(type)) {
    throw new AppError(`type must be one of ${NOTIFICATION_TYPES.join(', ')}`, 400);
  }
};

const assertNotificationCategory = (category) => {
  if (!NOTIFICATION_CATEGORIES.includes(category)) {
    throw new AppError(`category must be one of ${NOTIFICATION_CATEGORIES.join(', ')}`, 400);
  }
};

const assertNotificationPriority = (priority) => {
  if (!NOTIFICATION_PRIORITIES.includes(priority)) {
    throw new AppError(`priority must be one of ${NOTIFICATION_PRIORITIES.join(', ')}`, 400);
  }
};

const assertNotAuthenticationOtp = ({ category, template_key }) => {
  if (
    category === SECURE_OTP_CATEGORY
    || normalizeText(template_key).toLowerCase().includes('otp')
  ) {
    throw new AppError(
      'Authentication OTPs are generated automatically and delivered directly to the registered phone number. They cannot be created or managed through Notifications.',
      400,
    );
  }
};

const assertRecipientContact = ({ type, recipient_phone, recipient_email, recipient_fcm_token }) => {
  if (['sms', 'whatsapp'].includes(type) && !phonePattern.test(recipient_phone || '')) {
    throw new AppError(`${type === 'sms' ? 'SMS' : 'WhatsApp'} notifications require a valid E.164 phone number, e.g. +256761253001`, 400);
  }

  if (type === 'email' && !emailPattern.test(recipient_email || '')) {
    throw new AppError('Email notifications require a valid recipient email address', 400);
  }

  if (type === 'push' && recipient_fcm_token && normalizeText(recipient_fcm_token).length < 10) {
    throw new AppError('recipient_fcm_token is invalid', 400);
  }
};

const resolveRecipientIdForCreate = ({ req, type, recipient_id }) => {
  const rawRecipientId = normalizeText(recipient_id);

  if (rawRecipientId) {
    if (mongoose.Types.ObjectId.isValid(rawRecipientId)) {
      assertCreateAccess(req, rawRecipientId);
      return { recipientId: rawRecipientId, ignoredRawRecipientId: null };
    }

    if (EXTERNAL_CONTACT_CHANNELS.includes(type)) {
      return { recipientId: req.user.id, ignoredRawRecipientId: rawRecipientId };
    }

    assertRequiredObjectId(rawRecipientId, 'recipient_id');
  }

  if (ACCOUNT_BOUND_CHANNELS.includes(type)) {
    throw new AppError('recipient_id is required for in-app and push notifications', 400);
  }

  return { recipientId: req.user.id, ignoredRawRecipientId: null };
};

const normalizeCreatePayload = (req, source = {}) => {
  const type = normalizeText(source.type);
  const category = normalizeText(source.category);
  const recipient_phone = normalizeOptionalPhone(source.recipient_phone);
  const recipient_email = normalizeOptionalEmail(source.recipient_email);
  const recipient_fcm_token = normalizeText(source.recipient_fcm_token);
  const template_key = normalizeText(source.template_key);
  const priority = normalizeText(source.priority) || 'normal';
  const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
    ? source.metadata
    : {};

  assertNotificationType(type);
  assertNotificationCategory(category);
  assertNotificationPriority(priority);
  assertNotAuthenticationOtp({ category, template_key });
  assertTemplateExists(type, template_key);
  assertRecipientContact({ type, recipient_phone, recipient_email, recipient_fcm_token });
  assertValidObjectId(source.related_id, 'related_id');

  const { recipientId, ignoredRawRecipientId } = resolveRecipientIdForCreate({
    req,
    type,
    recipient_id: source.recipient_id,
  });

  return {
    type,
    category,
    recipient_id: recipientId,
    recipient_phone,
    recipient_email,
    recipient_fcm_token,
    template_key,
    variables: source.variables && typeof source.variables === 'object' && !Array.isArray(source.variables)
      ? source.variables
      : {},
    priority,
    scheduled_at: source.scheduled_at || null,
    related_type: source.related_type || null,
    related_id: source.related_id || null,
    metadata: {
      ...metadata,
      ...(ignoredRawRecipientId ? { ignored_invalid_recipient_id_input: ignoredRawRecipientId } : {}),
      external_contact_notification: EXTERNAL_CONTACT_CHANNELS.includes(type),
    },
  };
};

const applyAccessScope = (filter, req) => {
  if (canAccessAllHubs(req.user)) {
    return filter;
  }

  if (isAdminRole(req.user.role)) {
    const hubIds = getAssignedHubIds(req.user);
    if (hubIds.length === 1) {
      filter['metadata.hub_id'] = hubIds[0];
      return filter;
    }
    if (hubIds.length > 1) {
      filter['metadata.hub_id'] = { $in: hubIds };
      return filter;
    }
    filter._id = null;
    return filter;
  }

  filter.recipient_id = req.user.id;
  return filter;
};

const getNotificationForAccess = async (id, req, query = {}) => {
  assertValidObjectId(id, 'notification id');

  const filter = applyAccessScope({ _id: id, ...query }, req);
  const notification = await Notification.findOne(filter)
    .populate('sent_by', 'name full_name email')
    .lean();

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  return notification;
};

const buildRecipient = ({
  recipient_id,
  recipient_phone,
  recipient_email,
  recipient_fcm_token,
}) => ({
  id: recipient_id,
  phone: recipient_phone,
  email: recipient_email,
  fcm_token: recipient_fcm_token,
});

const assertTemplateExists = (type, templateKey) => {
  if (!templates[type] || !templates[type][templateKey]) {
    throw new AppError(`Template '${templateKey}' not found for type '${type}'`, 400);
  }
};

const assertCreateAccess = (req, recipientId) => {
  if (isAdminRole(req.user.role)) {
    return;
  }

  if (String(recipientId) !== String(req.user.id)) {
    throw new AppError('You can only create notifications for your own account', 403);
  }
};

/**
 * Get all notifications with filtering and pagination
 */
exports.getNotifications = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    type,
    category,
    recipient_id,
    related_type,
    related_id,
  } = req.query;

  const filter = withSecureOtpExcluded();
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (category) {
    if (category === SECURE_OTP_CATEGORY) {
      throw new AppError('Authentication OTP records are not available through Notifications', 403);
    }
    filter.category = category;
  }
  if (related_type) filter.related_type = related_type;

  if (recipient_id && isAdminRole(req.user.role)) {
    assertValidObjectId(recipient_id, 'recipient_id');
    filter.recipient_id = recipient_id;
  }

  if (related_id) {
    assertValidObjectId(related_id, 'related_id');
    filter.related_id = related_id;
  }

  applyAccessScope(filter, req);

  const pageNumber = toPositiveInteger(page, 1);
  const limitNumber = toPositiveInteger(limit, 20);
  const skip = (pageNumber - 1) * limitNumber;

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .populate('sent_by', 'name full_name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
    Notification.countDocuments(filter),
  ]);

  return successResponse(res, 'Notifications fetched successfully', {
    notifications,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber) || 1,
    },
  });
});

/**
 * Get notification by ID
 */
exports.getNotification = asyncHandler(async (req, res) => {
  const notification = await getNotificationForAccess(
    req.params.id,
    req,
    withSecureOtpExcluded(),
  );

  return successResponse(res, 'Notification fetched successfully', { notification });
});

/**
 * Create and send a notification
 */
exports.createNotification = asyncHandler(async (req, res) => {
  const {
    type,
    category,
    recipient_id,
    recipient_phone,
    recipient_email,
    recipient_fcm_token,
    template_key,
    variables,
    priority,
    scheduled_at,
    related_type,
    related_id,
    metadata,
  } = normalizeCreatePayload(req, req.body);

  const notification = await notificationService.send(
    type,
    category,
    buildRecipient({ recipient_id, recipient_phone, recipient_email, recipient_fcm_token }),
    template_key,
    variables,
    {
      priority,
      scheduled_at,
      related_type,
      related_id,
      sent_by: req.user?.id,
      metadata,
    },
  );

  return successResponse(res, 'Notification queued successfully', { notification }, 201);
});

/**
 * Bulk create notifications
 */
exports.bulkCreateNotifications = asyncHandler(async (req, res) => {
  const { notifications } = req.body;

  if (!Array.isArray(notifications) || notifications.length === 0) {
    throw new AppError('Notifications array is required', 400);
  }

  const payload = notifications.map((notifData) => {
    const {
      type,
      category,
      recipient_id,
      recipient_phone,
      recipient_email,
      recipient_fcm_token,
      template_key,
      variables,
      priority,
      scheduled_at,
      related_type,
      related_id,
      metadata = {},
    } = normalizeCreatePayload(req, notifData);

    return {
      type,
      category,
      recipient: buildRecipient({ recipient_id, recipient_phone, recipient_email, recipient_fcm_token }),
      templateKey: template_key,
      variables,
      options: {
        priority,
        scheduled_at,
        related_type,
        related_id,
        sent_by: req.user?.id,
        metadata,
      },
    };
  });

  const createdNotifications = await notificationService.sendBulk(payload);

  return successResponse(res, 'Notifications queued successfully', {
    notifications: createdNotifications,
    count: createdNotifications.length,
  }, 201);
});

/**
 * Update notification status
 */
exports.updateNotificationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, failure_reason } = req.body;

  assertValidObjectId(id, 'notification id');

  const updateData = { status };
  if (status === 'sent') {
    updateData.sent_at = new Date();
  } else if (status === 'delivered') {
    updateData.delivered_at = new Date();
  } else if (status === 'failed') {
    updateData.failed_at = new Date();
    updateData.failure_reason = failure_reason;
  }

  const filter = applyAccessScope(withSecureOtpExcluded({ _id: id }), req);
  const notification = await Notification.findOneAndUpdate(
    filter,
    updateData,
    { new: true, runValidators: true },
  ).populate('sent_by', 'name full_name email');

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  return successResponse(res, `Notification status updated to ${status}`, { notification });
});

/**
 * Retry failed notification
 */
exports.retryNotification = asyncHandler(async (req, res) => {
  assertValidObjectId(req.params.id, 'notification id');

  const filter = applyAccessScope(withSecureOtpExcluded({ _id: req.params.id }), req);
  const notification = await Notification.findOne(filter);
  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  if (notification.status !== 'failed') {
    throw new AppError('Only failed notifications can be retried', 400);
  }

  if (notification.attempts >= notification.max_attempts) {
    throw new AppError('Maximum retry attempts exceeded', 400);
  }

  notification.status = 'pending';
  notification.failure_reason = null;
  notification.failed_at = null;
  await notification.save();

  await notificationService.processNotification(notification);

  return successResponse(res, 'Notification retry completed', { notification });
});

/**
 * Delete notification
 */
exports.deleteNotification = asyncHandler(async (req, res) => {
  assertValidObjectId(req.params.id, 'notification id');

  const filter = applyAccessScope(withSecureOtpExcluded({ _id: req.params.id }), req);
  const notification = await Notification.findOneAndDelete(filter);

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  return successResponse(res, 'Notification deleted successfully');
});

/**
 * Get notification statistics
 */
exports.getNotificationStats = asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const match = applyAccessScope(withSecureOtpExcluded(), req);
  if (start_date || end_date) {
    match.createdAt = {};
    if (start_date) match.createdAt.$gte = new Date(start_date);
    if (end_date) match.createdAt.$lte = new Date(end_date);
  }

  const stats = await Notification.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const total = stats.reduce((sum, stat) => sum + stat.count, 0);

  // Get stats by type and category
  const typeStats = await Notification.aggregate([
    { $match: match },
    {
      $group: {
        _id: { type: '$type', category: '$category' },
        count: { $sum: 1 },
      },
    },
  ]);

  return successResponse(res, 'Notification stats fetched successfully', {
    total,
    by_status: stats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {}),
    by_type_category: typeStats,
  });
});
