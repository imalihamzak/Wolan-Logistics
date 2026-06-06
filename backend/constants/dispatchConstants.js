const PACKAGE_SIZES = ['small', 'medium', 'large', 'oversized'];

const getEnvNumber = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const VEHICLE_PACKAGE_COMPATIBILITY = {
  velo: ['small'],
  moto: ['small', 'medium'],
  voiture: ['small', 'medium', 'large', 'oversized'],
};

const DEFAULT_PACKAGE_SIZE = 'medium';
const DISPATCH_PERFORMANCE_WINDOW_DAYS = getEnvNumber('DISPATCH_PERFORMANCE_WINDOW_DAYS', 30);
const DISPATCH_PUNCTUALITY_SLA_MINUTES = getEnvNumber('DISPATCH_PUNCTUALITY_SLA_MINUTES', 90);
const DISPATCH_GPS_FRESH_MINUTES = getEnvNumber('DISPATCH_GPS_FRESH_MINUTES', 15);
const DISPATCH_MAX_PRIORITY_DISTANCE_KM = getEnvNumber('DISPATCH_MAX_PRIORITY_DISTANCE_KM', 10);

const DISPATCH_PERFORMANCE_WEIGHTS = Object.freeze({
  acceptance: 0.25,
  cancellation: 0.15,
  punctuality: 0.2,
  rating: 0.15,
  complaints: 0.1,
  gps: 0.15,
});

const DISPATCH_PRIORITY_WEIGHTS = Object.freeze({
  performance: 0.55,
  proximity: 0.3,
  workload: 0.1,
  zone: 0.05,
});

const isVehicleCompatibleWithPackage = (vehicleType, packageSize = DEFAULT_PACKAGE_SIZE) => (
  Boolean(VEHICLE_PACKAGE_COMPATIBILITY[vehicleType]?.includes(packageSize))
);

module.exports = {
  PACKAGE_SIZES,
  VEHICLE_PACKAGE_COMPATIBILITY,
  DEFAULT_PACKAGE_SIZE,
  DISPATCH_PERFORMANCE_WINDOW_DAYS,
  DISPATCH_PUNCTUALITY_SLA_MINUTES,
  DISPATCH_GPS_FRESH_MINUTES,
  DISPATCH_MAX_PRIORITY_DISTANCE_KM,
  DISPATCH_PERFORMANCE_WEIGHTS,
  DISPATCH_PRIORITY_WEIGHTS,
  isVehicleCompatibleWithPackage,
};
