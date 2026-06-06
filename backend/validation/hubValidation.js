const mongoose = require('mongoose');

const buildResult = (value, errors) => ({ value, errors });
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const phonePattern = /^[0-9+\-()\s]{7,20}$/;

/**
 * Validate create hub
 */
const validateCreateHub = (req) => {
  const errors = [];
  const value = {
    name: String(req.body.name || '').trim(),
    code: String(req.body.code || '').trim().toUpperCase(),
    address: String(req.body.address || '').trim(),
    city: String(req.body.city || '').trim(),
    state: req.body.state ? String(req.body.state).trim() : null,
    country: req.body.country ? String(req.body.country).trim() : 'Uganda',
    zone: req.body.zone ? String(req.body.zone).trim() : null,
    manager_id: req.body.manager_id ? String(req.body.manager_id).trim() : null,
    contact_phone: req.body.contact_phone ? String(req.body.contact_phone).trim() : null,
    contact_email: req.body.contact_email ? String(req.body.contact_email).trim().toLowerCase() : null,
  };

  if (value.name.length < 2) errors.push('name is required');
  if (value.code.length < 2) errors.push('code is required');
  if (value.address.length < 5) errors.push('address is required');
  if (value.city.length < 2) errors.push('city is required');
  if (value.manager_id && !isObjectId(value.manager_id)) errors.push('manager_id must be a valid ObjectId');
  if (value.contact_phone && !phonePattern.test(value.contact_phone)) errors.push('contact_phone is invalid');
  if (value.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contact_email)) errors.push('contact_email is invalid');

  return buildResult(value, errors);
};

/**
 * Validate update hub
 */
const validateUpdateHub = (req) => {
  const errors = [];
  const value = {
    name: req.body.name ? String(req.body.name).trim() : undefined,
    code: req.body.code ? String(req.body.code).trim().toUpperCase() : undefined,
    address: req.body.address ? String(req.body.address).trim() : undefined,
    city: req.body.city ? String(req.body.city).trim() : undefined,
    state: req.body.state ? String(req.body.state).trim() : undefined,
    zone: req.body.zone ? String(req.body.zone).trim() : undefined,
    contact_phone: req.body.contact_phone ? String(req.body.contact_phone).trim() : undefined,
    contact_email: req.body.contact_email ? String(req.body.contact_email).trim().toLowerCase() : undefined,
  };

  if (value.code && value.code.length < 2) errors.push('code is required');
  if (value.name && value.name.length < 2) errors.push('name is required');
  if (value.contact_phone && !phonePattern.test(value.contact_phone)) errors.push('contact_phone is invalid');
  if (value.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contact_email)) errors.push('contact_email is invalid');

  return buildResult(value, errors);
};

/**
 * Validate suspend hub
 */
const validateSuspendHub = (req) => {
  const errors = [];
  const value = {
    is_active: req.body.is_active === true || req.body.is_active === 'true' || req.body.is_active === 1,
    reason: req.body.reason ? String(req.body.reason).trim() : null,
  };

  return buildResult(value, errors);
};

/**
 * Validate assign manager
 */
const validateAssignManager = (req) => {
  const errors = [];
  const value = {
    manager_id: req.body.manager_id ? String(req.body.manager_id).trim() : null,
  };

  if (value.manager_id && !isObjectId(value.manager_id)) errors.push('manager_id must be a valid ObjectId');

  return buildResult(value, errors);
};

/**
 * Validate hub query
 */
const validateHubQuery = (req) => {
  const value = {
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search ? String(req.query.search).trim() : undefined,
    is_active: req.query.is_active ? String(req.query.is_active).trim() : undefined,
    city: req.query.city ? String(req.query.city).trim() : undefined,
    state: req.query.state ? String(req.query.state).trim() : undefined,
  };

  return buildResult(value, []);
};

/**
 * Validate analytics query
 */
const validateAnalyticsQuery = (req) => {
  const errors = [];
  const value = {
    period: req.query.period ? Number(req.query.period) : 30,
    from: req.query.from ? String(req.query.from).trim() : undefined,
    to: req.query.to ? String(req.query.to).trim() : undefined,
    granularity: req.query.granularity ? String(req.query.granularity).trim() : 'day',
  };

  if (!['day', 'hour', 'week', 'month'].includes(value.granularity)) {
    value.granularity = 'day';
  }

  return buildResult(value, errors);
};

module.exports = {
  validateCreateHub,
  validateUpdateHub,
  validateSuspendHub,
  validateAssignManager,
  validateHubQuery,
  validateAnalyticsQuery,
};
