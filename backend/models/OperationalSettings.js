const mongoose = require('mongoose');

const {
  CURRENCY_OPTIONS,
  DEFAULT_OPERATIONAL_SETTINGS,
  DISTANCE_UNIT_OPTIONS,
  TIMEZONE_OPTIONS,
} = require('../constants/operationalSettingsConstants');

const operationalSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'operations',
      unique: true,
      immutable: true,
    },
    currency_code: {
      type: String,
      enum: CURRENCY_OPTIONS,
      default: DEFAULT_OPERATIONAL_SETTINGS.currency_code,
      required: true,
    },
    country: {
      type: String,
      default: DEFAULT_OPERATIONAL_SETTINGS.country,
      trim: true,
      required: true,
    },
    country_code: {
      type: String,
      default: DEFAULT_OPERATIONAL_SETTINGS.country_code,
      uppercase: true,
      trim: true,
      required: true,
    },
    default_phone_code: {
      type: String,
      default: DEFAULT_OPERATIONAL_SETTINGS.default_phone_code,
      trim: true,
      required: true,
    },
    timezone: {
      type: String,
      enum: TIMEZONE_OPTIONS,
      default: DEFAULT_OPERATIONAL_SETTINGS.timezone,
      required: true,
    },
    primary_city: {
      type: String,
      default: DEFAULT_OPERATIONAL_SETTINGS.primary_city,
      trim: true,
      required: true,
    },
    operating_region: {
      type: String,
      default: DEFAULT_OPERATIONAL_SETTINGS.operating_region,
      trim: true,
      required: true,
    },
    default_latitude: {
      type: Number,
      default: DEFAULT_OPERATIONAL_SETTINGS.default_latitude,
      min: -90,
      max: 90,
    },
    default_longitude: {
      type: Number,
      default: DEFAULT_OPERATIONAL_SETTINGS.default_longitude,
      min: -180,
      max: 180,
    },
    service_radius_km: {
      type: Number,
      default: DEFAULT_OPERATIONAL_SETTINGS.service_radius_km,
      min: 1,
      max: 500,
    },
    distance_unit: {
      type: String,
      enum: DISTANCE_UNIT_OPTIONS,
      default: DEFAULT_OPERATIONAL_SETTINGS.distance_unit,
      required: true,
    },
    cod_enabled: {
      type: Boolean,
      default: DEFAULT_OPERATIONAL_SETTINGS.cod_enabled,
    },
    pickup_key_required: {
      type: Boolean,
      default: DEFAULT_OPERATIONAL_SETTINGS.pickup_key_required,
    },
    hub_scan_required: {
      type: Boolean,
      default: DEFAULT_OPERATIONAL_SETTINGS.hub_scan_required,
    },
    google_maps_distance_required: {
      type: Boolean,
      default: DEFAULT_OPERATIONAL_SETTINGS.google_maps_distance_required,
    },
    allow_cross_border_dispatch: {
      type: Boolean,
      default: DEFAULT_OPERATIONAL_SETTINGS.allow_cross_border_dispatch,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updated_by_role: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OperationalSettings', operationalSettingsSchema);
