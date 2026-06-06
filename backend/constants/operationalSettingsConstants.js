const CURRENCY_OPTIONS = ['UGX', 'KES', 'TZS', 'RWF'];

const CURRENCY_LABELS = {
  UGX: 'Ugandan Shilling',
  KES: 'Kenyan Shilling',
  TZS: 'Tanzanian Shilling',
  RWF: 'Rwandan Franc',
};

const TIMEZONE_OPTIONS = [
  'Africa/Kampala',
  'Africa/Nairobi',
  'Africa/Dar_es_Salaam',
  'Africa/Kigali',
];

const DISTANCE_UNIT_OPTIONS = ['km'];

const DEFAULT_OPERATIONAL_SETTINGS = {
  key: 'operations',
  currency_code: 'UGX',
  country: 'Uganda',
  country_code: 'UG',
  default_phone_code: '+256',
  timezone: 'Africa/Kampala',
  primary_city: 'Kampala',
  operating_region: 'Kampala Metropolitan',
  default_latitude: 0.3476,
  default_longitude: 32.5825,
  service_radius_km: 25,
  distance_unit: 'km',
  cod_enabled: true,
  pickup_key_required: true,
  hub_scan_required: true,
  google_maps_distance_required: true,
  allow_cross_border_dispatch: false,
};

module.exports = {
  CURRENCY_LABELS,
  CURRENCY_OPTIONS,
  DEFAULT_OPERATIONAL_SETTINGS,
  DISTANCE_UNIT_OPTIONS,
  TIMEZONE_OPTIONS,
};
