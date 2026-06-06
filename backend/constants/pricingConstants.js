const DELIVERY_PRICING_CURRENCY = 'UGX';

const DELIVERY_SERVICE_LEVELS = ['standard', 'express'];

const DELIVERY_PRICING_TIERS = [
  { min_km: 0, max_km: 1, fee: 2500, label: '0-1 KM' },
  { min_km: 1, max_km: 3, fee: 5000, label: '1-3 KM' },
  { min_km: 3, max_km: 7, fee: 8000, label: '3-7 KM' },
  { min_km: 7, max_km: 12, fee: 12000, label: '7-12 KM' },
  { min_km: 12, max_km: 15, fee: 15000, label: '12-15 KM' },
];

const MAX_STANDARD_DELIVERY_DISTANCE_KM = 15;

module.exports = {
  DELIVERY_PRICING_CURRENCY,
  DELIVERY_PRICING_TIERS,
  DELIVERY_SERVICE_LEVELS,
  MAX_STANDARD_DELIVERY_DISTANCE_KM,
};
