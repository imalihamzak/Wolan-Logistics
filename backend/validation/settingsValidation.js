const {
  CURRENCY_OPTIONS,
  DISTANCE_UNIT_OPTIONS,
  TIMEZONE_OPTIONS,
} = require('../constants/operationalSettingsConstants');

const buildResult = (value, errors) => ({ value, errors });

const toOptionalString = (value) => {
  if (value === undefined) return undefined;
  return String(value || '').trim();
};

const toOptionalBoolean = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (['true', '1', 'yes', 'on'].includes(String(value).toLowerCase())) return true;
  if (['false', '0', 'no', 'off'].includes(String(value).toLowerCase())) return false;
  return value;
};

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
};

const validateOperationalSettingsUpdate = (req) => {
  const body = req.body || {};
  const errors = [];
  const value = {
    currency_code: toOptionalString(body.currency_code),
    country: toOptionalString(body.country),
    country_code: toOptionalString(body.country_code)?.toUpperCase(),
    default_phone_code: toOptionalString(body.default_phone_code),
    timezone: toOptionalString(body.timezone),
    primary_city: toOptionalString(body.primary_city),
    operating_region: toOptionalString(body.operating_region),
    default_latitude: toOptionalNumber(body.default_latitude),
    default_longitude: toOptionalNumber(body.default_longitude),
    service_radius_km: toOptionalNumber(body.service_radius_km),
    distance_unit: toOptionalString(body.distance_unit),
    cod_enabled: toOptionalBoolean(body.cod_enabled),
    pickup_key_required: toOptionalBoolean(body.pickup_key_required),
    hub_scan_required: toOptionalBoolean(body.hub_scan_required),
    google_maps_distance_required: toOptionalBoolean(body.google_maps_distance_required),
    allow_cross_border_dispatch: toOptionalBoolean(body.allow_cross_border_dispatch),
  };

  if (value.currency_code !== undefined && !CURRENCY_OPTIONS.includes(value.currency_code)) {
    errors.push(`currency_code must be one of: ${CURRENCY_OPTIONS.join(', ')}`);
  }
  if (value.timezone !== undefined && !TIMEZONE_OPTIONS.includes(value.timezone)) {
    errors.push(`timezone must be one of: ${TIMEZONE_OPTIONS.join(', ')}`);
  }
  if (value.distance_unit !== undefined && !DISTANCE_UNIT_OPTIONS.includes(value.distance_unit)) {
    errors.push(`distance_unit must be one of: ${DISTANCE_UNIT_OPTIONS.join(', ')}`);
  }

  ['country', 'country_code', 'default_phone_code', 'primary_city', 'operating_region'].forEach((field) => {
    if (value[field] !== undefined && value[field].length < 2) {
      errors.push(`${field} is required`);
    }
  });

  if (value.country_code !== undefined && !/^[A-Z]{2,3}$/.test(value.country_code)) {
    errors.push('country_code must be a 2 or 3 letter region code');
  }
  if (value.default_phone_code !== undefined && !/^\+\d{2,4}$/.test(value.default_phone_code)) {
    errors.push('default_phone_code must use international format, for example +256');
  }
  if (value.default_latitude !== undefined && (!Number.isFinite(value.default_latitude) || value.default_latitude < -90 || value.default_latitude > 90)) {
    errors.push('default_latitude must be between -90 and 90');
  }
  if (value.default_longitude !== undefined && (!Number.isFinite(value.default_longitude) || value.default_longitude < -180 || value.default_longitude > 180)) {
    errors.push('default_longitude must be between -180 and 180');
  }
  if (value.service_radius_km !== undefined && (!Number.isFinite(value.service_radius_km) || value.service_radius_km < 1 || value.service_radius_km > 500)) {
    errors.push('service_radius_km must be between 1 and 500');
  }

  [
    'cod_enabled',
    'pickup_key_required',
    'hub_scan_required',
    'google_maps_distance_required',
    'allow_cross_border_dispatch',
  ].forEach((field) => {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      errors.push(`${field} must be true or false`);
    }
  });

  Object.keys(value).forEach((key) => {
    if (value[key] === undefined) {
      delete value[key];
    }
  });

  return buildResult(value, errors);
};

module.exports = {
  validateOperationalSettingsUpdate,
};
