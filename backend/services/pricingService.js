const AppError = require('../utils/AppError');
const { calculateRouteMetrics, readLatLng } = require('./mapProviderService');
const {
  DELIVERY_PRICING_CURRENCY,
  DELIVERY_PRICING_TIERS,
  DELIVERY_SERVICE_LEVELS,
  MAX_STANDARD_DELIVERY_DISTANCE_KM,
} = require('../constants/pricingConstants');

const normalizeServiceLevel = (value) => {
  const serviceLevel = String(value || 'standard').trim().toLowerCase();
  if (!DELIVERY_SERVICE_LEVELS.includes(serviceLevel)) {
    throw new AppError('service_level must be standard or express', 400);
  }
  return serviceLevel;
};

const resolvePricingTier = (distanceKm) => {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new AppError('Delivery distance could not be calculated', 400);
  }

  const tier = DELIVERY_PRICING_TIERS.find((item) => (
    distanceKm > item.min_km && distanceKm <= item.max_km
  )) || (distanceKm === 0 ? DELIVERY_PRICING_TIERS[0] : null);

  if (!tier) {
    throw new AppError(`Delivery distance ${distanceKm.toFixed(2)} KM is outside the standard ${MAX_STANDARD_DELIVERY_DISTANCE_KM} KM pricing coverage`, 400);
  }

  return tier;
};

const calculateDeliveryPricing = async ({
  pickupCoordinates,
  dropoffCoordinates,
  pickupAddress = null,
  dropoffAddress = null,
  serviceLevel = 'standard',
}) => {
  const normalizedServiceLevel = normalizeServiceLevel(serviceLevel);
  const route = await calculateRouteMetrics({
    pickupCoordinates,
    dropoffCoordinates,
    pickupAddress,
    dropoffAddress,
    profile: 'driving-car',
  });
  const distanceMeters = route.distanceMeters;
  const exactDistanceKm = distanceMeters / 1000;
  const distanceKm = Math.max(0, Math.ceil(Math.max(0, exactDistanceKm - 1e-9) * 100) / 100);
  const tier = resolvePricingTier(exactDistanceKm);

  return {
    delivery_fee: tier.fee,
    pricing_currency: DELIVERY_PRICING_CURRENCY,
    pricing_distance_km: distanceKm,
    pricing_distance_meters: Math.round(distanceMeters),
    pricing_duration_seconds: route.durationSeconds,
    pricing_source: route.source,
    pricing_tier_label: tier.label,
    pricing_calculated_at: new Date(),
    service_level: normalizedServiceLevel,
    express_requested: normalizedServiceLevel === 'express',
    pickup_coordinates: route.pickup,
    dropoff_coordinates: route.dropoff,
    route_geometry: route.routeGeometry,
    pricing_tiers: DELIVERY_PRICING_TIERS,
  };
};

module.exports = {
  calculateDeliveryPricing,
  normalizeServiceLevel,
  readLatLng,
  resolvePricingTier,
};
