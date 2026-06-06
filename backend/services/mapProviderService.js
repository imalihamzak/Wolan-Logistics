const AppError = require('../utils/AppError');
const { haversineDistance } = require('../utils/geodistance');

const GOOGLE_DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const ORS_BASE_URL = 'https://api.openrouteservice.org';
const DEFAULT_MAP_PROVIDER = 'google';
const DEFAULT_COUNTRY_CODE = String(process.env.MAP_DEFAULT_COUNTRY || 'UG').trim().toUpperCase();
const DEFAULT_FOCUS_LATITUDE = Number(process.env.MAP_DEFAULT_LATITUDE || 0.3476);
const DEFAULT_FOCUS_LONGITUDE = Number(process.env.MAP_DEFAULT_LONGITUDE || 32.5825);
const ROUTE_TIMEOUT_MS = Number(
  process.env.OPENROUTESERVICE_TIMEOUT_MS
  || process.env.GOOGLE_DISTANCE_TIMEOUT_MS
  || 8000
);

const normalizeMapProvider = () => {
  const provider = String(process.env.MAP_PROVIDER || '').trim().toLowerCase();
  if (['openrouteservice', 'ors'].includes(provider)) return 'openrouteservice';
  if (['google', 'google_maps', 'googlemaps'].includes(provider)) return 'google';
  return process.env.OPENROUTESERVICE_API_KEY ? 'openrouteservice' : DEFAULT_MAP_PROVIDER;
};

const getMapProvider = () => normalizeMapProvider();

const getRouteProfileForVehicle = (vehicleType = null) => {
  const normalizedVehicle = String(vehicleType || '').trim().toLowerCase();
  if (normalizedVehicle === 'velo') return 'cycling-regular';
  return 'driving-car';
};

const isValidCoordinate = (latitude, longitude) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
  && !(latitude === 0 && longitude === 0)
);

const readLatLng = (value = null) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value.coordinates)) {
    const [longitude, latitude] = value.coordinates.map(Number);
    return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null;
  }

  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng ?? value.lon);
  return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null;
};

const toCoordinateArray = (point) => [Number(point.longitude), Number(point.latitude)];

const normalizeRouteGeometry = (geometry = null) => {
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const coordinates = geometry.coordinates
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
      const longitude = Number(coordinate[0]);
      const latitude = Number(coordinate[1]);
      return isValidCoordinate(latitude, longitude) ? [longitude, latitude] : null;
    })
    .filter(Boolean);

  return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
};

const shouldRequireRouteProvider = () => (
  process.env.PRICING_REQUIRE_MAP_PROVIDER === 'true'
  || process.env.PRICING_REQUIRE_GOOGLE_MAPS === 'true'
  || process.env.NODE_ENV === 'production'
);

const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = ROUTE_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
};

const buildOpenRouteServiceGeocodeUrl = ({
  text,
  limit = 1,
  countryCode = DEFAULT_COUNTRY_CODE,
  useFocus = true,
} = {}) => {
  const url = new URL(`${ORS_BASE_URL}/geocode/search`);
  url.searchParams.set('api_key', process.env.OPENROUTESERVICE_API_KEY);
  url.searchParams.set('text', text);
  url.searchParams.set('size', String(limit));

  if (countryCode) {
    url.searchParams.set('boundary.country', countryCode);
  }

  if (useFocus && isValidCoordinate(DEFAULT_FOCUS_LATITUDE, DEFAULT_FOCUS_LONGITUDE)) {
    url.searchParams.set('focus.point.lat', String(DEFAULT_FOCUS_LATITUDE));
    url.searchParams.set('focus.point.lon', String(DEFAULT_FOCUS_LONGITUDE));
  }

  return url;
};

const parseOpenRouteServiceFeatures = (data = {}, fallbackLabel = '') => (
  Array.isArray(data.features)
    ? data.features
      .map((feature) => {
        const [longitude, latitude] = feature?.geometry?.coordinates || [];
        if (!isValidCoordinate(Number(latitude), Number(longitude))) return null;
        const properties = feature.properties || {};
        return {
          label: properties.label || properties.name || fallbackLabel,
          name: properties.name || null,
          address: properties.label || null,
          city: properties.locality || properties.region || null,
          country: properties.country || null,
          latitude: Number(latitude),
          longitude: Number(longitude),
          provider: 'openrouteservice',
        };
      })
      .filter(Boolean)
    : []
);

const fetchOpenRouteServiceGeocodeFeatures = async ({
  text,
  label,
  limit = 1,
  required = shouldRequireRouteProvider(),
} = {}) => {
  const attempts = [
    {
      url: buildOpenRouteServiceGeocodeUrl({
        text,
        limit,
        countryCode: DEFAULT_COUNTRY_CODE,
        useFocus: true,
      }),
      scope: DEFAULT_COUNTRY_CODE,
    },
    {
      url: buildOpenRouteServiceGeocodeUrl({
        text,
        limit,
        countryCode: null,
        useFocus: false,
      }),
      scope: 'global',
    },
  ];

  for (const attempt of attempts) {
    // eslint-disable-next-line no-await-in-loop
    const { response, data } = await fetchJsonWithTimeout(attempt.url, {
      headers: {
        Authorization: process.env.OPENROUTESERVICE_API_KEY,
        Accept: 'application/json',
      },
    });

    if (!response.ok || !Array.isArray(data.features)) {
      if (required) {
        const message = data.error?.message || data.message || response.statusText || 'OpenRouteService geocoding failed';
        throw new AppError(`OpenRouteService geocoding failed for ${label}: ${message}`, 502);
      }
      continue;
    }

    const features = parseOpenRouteServiceFeatures(data, text);
    if (features.length > 0) {
      return features;
    }

  }

  if (required) {
    const friendlyLabel = label === 'dropoff_address' ? 'drop-off location' : label === 'pickup_address' ? 'pickup location' : label;
    throw new AppError(`No OpenRouteService address match found for ${friendlyLabel}. Use the Lookup button, add city/country, or enter GPS coordinates.`, 400);
  }

  return [];
};

const fetchGoogleGeocodedPoint = async (address, label) => {
  const normalizedAddress = String(address || '').trim();
  if (!normalizedAddress) return null;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    if (shouldRequireRouteProvider()) {
      throw new AppError('GOOGLE_MAPS_API_KEY is required for Google Maps delivery pricing', 503);
    }
    return null;
  }

  const url = new URL(GOOGLE_GEOCODING_URL);
  url.searchParams.set('address', normalizedAddress);
  url.searchParams.set('region', DEFAULT_COUNTRY_CODE.toLowerCase());
  url.searchParams.set('key', apiKey);

  try {
    const { response, data } = await fetchJsonWithTimeout(url);
    if (!response.ok || data.status !== 'OK') {
      const message = data.error_message || data.status || response.statusText || 'Google Geocoding failed';
      if (shouldRequireRouteProvider()) {
        throw new AppError(`Google Maps geocoding failed for ${label}: ${message}`, 502);
      }
      return null;
    }

    const location = data.results?.[0]?.geometry?.location;
    const latitude = Number(location?.lat);
    const longitude = Number(location?.lng);
    return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null;
  } catch (error) {
    if (error.statusCode) throw error;
    if (shouldRequireRouteProvider()) {
      const message = error.name === 'AbortError'
        ? `timed out after ${ROUTE_TIMEOUT_MS}ms`
        : error.message || 'request failed';
      throw new AppError(`Google Maps geocoding failed for ${label}: ${message}`, 502);
    }
    return null;
  }
};

const fetchOpenRouteServiceGeocodedPoint = async (address, label) => {
  const normalizedAddress = String(address || '').trim();
  if (!normalizedAddress) return null;

  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    if (shouldRequireRouteProvider()) {
      throw new AppError('OPENROUTESERVICE_API_KEY is required for OpenRouteService delivery pricing', 503);
    }
    return null;
  }

  try {
    const features = await fetchOpenRouteServiceGeocodeFeatures({
      text: normalizedAddress,
      label,
      limit: 1,
    });
    const result = features[0];
    return result
      ? { latitude: result.latitude, longitude: result.longitude }
      : null;
  } catch (error) {
    if (error.statusCode) throw error;
    if (shouldRequireRouteProvider()) {
      const message = error.name === 'AbortError'
        ? `timed out after ${ROUTE_TIMEOUT_MS}ms`
        : error.message || 'request failed';
      throw new AppError(`OpenRouteService geocoding failed for ${label}: ${message}`, 502);
    }
    return null;
  }
};

const lookupOpenRouteServiceAddresses = async ({ query, limit = 5 } = {}) => {
  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery.length < 3) {
    throw new AppError('Address lookup query must be at least 3 characters', 400);
  }

  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    throw new AppError('OPENROUTESERVICE_API_KEY is required for address lookup', 503);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 10);
  const features = await fetchOpenRouteServiceGeocodeFeatures({
    text: normalizedQuery,
    label: 'address lookup',
    limit: safeLimit,
    required: false,
  });

  return features;
};

const fetchGoogleRouteMetrics = async (pickup, dropoff) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    if (shouldRequireRouteProvider()) {
      throw new AppError('GOOGLE_MAPS_API_KEY is required for Google Maps delivery pricing', 503);
    }
    return null;
  }

  const url = new URL(GOOGLE_DISTANCE_MATRIX_URL);
  url.searchParams.set('origins', `${pickup.latitude},${pickup.longitude}`);
  url.searchParams.set('destinations', `${dropoff.latitude},${dropoff.longitude}`);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('units', 'metric');
  url.searchParams.set('key', apiKey);

  try {
    const { response, data } = await fetchJsonWithTimeout(url);
    if (!response.ok || data.status !== 'OK') {
      const message = data.error_message || data.status || response.statusText || 'Google Distance Matrix failed';
      if (shouldRequireRouteProvider()) {
        throw new AppError(`Google Maps distance calculation failed: ${message}`, 502);
      }
      return null;
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK' || !Number.isFinite(Number(element.distance?.value))) {
      const message = element?.status || 'No routable Google Maps distance found';
      if (shouldRequireRouteProvider()) {
        throw new AppError(`Google Maps distance calculation failed: ${message}`, 502);
      }
      return null;
    }

    const durationSeconds = Number(element.duration?.value);
    return {
      provider: 'google_maps',
      source: 'google_distance_matrix',
      distanceMeters: Number(element.distance.value),
      durationSeconds: Number.isFinite(durationSeconds) ? Math.round(durationSeconds) : null,
      routeGeometry: null,
    };
  } catch (error) {
    if (error.statusCode) throw error;
    if (shouldRequireRouteProvider()) {
      const message = error.name === 'AbortError'
        ? `timed out after ${ROUTE_TIMEOUT_MS}ms`
        : error.message || 'request failed';
      throw new AppError(`Google Maps distance calculation failed: ${message}`, 502);
    }
    return null;
  }
};

const fetchOpenRouteServiceRouteMetrics = async (pickup, dropoff, profile = 'driving-car') => {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    if (shouldRequireRouteProvider()) {
      throw new AppError('OPENROUTESERVICE_API_KEY is required for OpenRouteService delivery pricing', 503);
    }
    return null;
  }

  const orsProfile = String(profile || 'driving-car').trim() || 'driving-car';
  const url = `${ORS_BASE_URL}/v2/directions/${encodeURIComponent(orsProfile)}/geojson`;

  try {
    const { response, data } = await fetchJsonWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json, application/geo+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: [toCoordinateArray(pickup), toCoordinateArray(dropoff)],
        instructions: false,
        units: 'm',
      }),
    });

    const feature = data.features?.[0];
    const summary = feature?.properties?.summary;
    const distanceMeters = Number(summary?.distance);
    const durationSeconds = Number(summary?.duration);

    if (!response.ok || !Number.isFinite(distanceMeters)) {
      const message = data.error?.message || data.message || response.statusText || 'OpenRouteService Directions failed';
      if (shouldRequireRouteProvider()) {
        throw new AppError(`OpenRouteService route calculation failed: ${message}`, 502);
      }
      return null;
    }

    return {
      provider: 'openrouteservice',
      source: `openrouteservice_directions_${orsProfile}`,
      distanceMeters,
      durationSeconds: Number.isFinite(durationSeconds) ? Math.round(durationSeconds) : null,
      routeGeometry: normalizeRouteGeometry(feature?.geometry),
    };
  } catch (error) {
    if (error.statusCode) throw error;
    if (shouldRequireRouteProvider()) {
      const message = error.name === 'AbortError'
        ? `timed out after ${ROUTE_TIMEOUT_MS}ms`
        : error.message || 'request failed';
      throw new AppError(`OpenRouteService route calculation failed: ${message}`, 502);
    }
    return null;
  }
};

const resolveMapPoint = async ({ coordinates, address, label }) => {
  const providedPoint = readLatLng(coordinates);
  if (providedPoint) {
    return providedPoint;
  }

  const provider = getMapProvider();
  const geocodedPoint = provider === 'openrouteservice'
    ? await fetchOpenRouteServiceGeocodedPoint(address, label)
    : await fetchGoogleGeocodedPoint(address, label);

  return geocodedPoint || null;
};

const calculateFallbackDistanceMeters = (pickup, dropoff) => {
  const meters = haversineDistance(
    { latitude: pickup.latitude, longitude: pickup.longitude },
    { latitude: dropoff.latitude, longitude: dropoff.longitude }
  );

  if (!Number.isFinite(meters)) {
    throw new AppError('Delivery distance could not be calculated from GPS coordinates', 400);
  }

  return meters;
};

const calculateRouteMetrics = async ({
  pickupCoordinates,
  dropoffCoordinates,
  pickupAddress = null,
  dropoffAddress = null,
  profile = 'driving-car',
}) => {
  const pickup = await resolveMapPoint({
    coordinates: pickupCoordinates,
    address: pickupAddress,
    label: 'pickup_address',
  });
  const dropoff = await resolveMapPoint({
    coordinates: dropoffCoordinates,
    address: dropoffAddress,
    label: 'dropoff_address',
  });

  if (!pickup || !dropoff) {
    throw new AppError('pickup/drop-off GPS coordinates or provider-geocodable pickup/drop-off addresses are required for automatic delivery pricing', 400);
  }

  const provider = getMapProvider();
  const route = provider === 'openrouteservice'
    ? await fetchOpenRouteServiceRouteMetrics(pickup, dropoff, profile)
    : await fetchGoogleRouteMetrics(pickup, dropoff);

  if (route) {
    return {
      ...route,
      pickup,
      dropoff,
    };
  }

  const fallbackDistanceMeters = calculateFallbackDistanceMeters(pickup, dropoff);
  return {
    provider: 'internal',
    source: 'haversine_fallback',
    distanceMeters: fallbackDistanceMeters,
    durationSeconds: null,
    routeGeometry: null,
    pickup,
    dropoff,
  };
};

const calculateDistanceMatrix = async ({
  sources = [],
  destinations = [],
  profile = 'driving-car',
}) => {
  if (getMapProvider() !== 'openrouteservice' || !process.env.OPENROUTESERVICE_API_KEY) {
    return null;
  }

  const validSources = sources.map(readLatLng).filter(Boolean);
  const validDestinations = destinations.map(readLatLng).filter(Boolean);
  if (validSources.length === 0 || validDestinations.length === 0) {
    return null;
  }

  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  const orsProfile = String(profile || 'driving-car').trim() || 'driving-car';
  const locations = [...validSources, ...validDestinations].map(toCoordinateArray);
  const url = `${ORS_BASE_URL}/v2/matrix/${encodeURIComponent(orsProfile)}`;

  const { response, data } = await fetchJsonWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      locations,
      sources: validSources.map((_, index) => index),
      destinations: validDestinations.map((_, index) => validSources.length + index),
      metrics: ['distance', 'duration'],
      units: 'm',
    }),
  });

  if (!response.ok || !Array.isArray(data.distances)) {
    const message = data.error?.message || data.message || response.statusText || 'OpenRouteService Matrix failed';
    throw new AppError(`OpenRouteService matrix calculation failed: ${message}`, 502);
  }

  return {
    provider: 'openrouteservice',
    source: `openrouteservice_matrix_${orsProfile}`,
    distances: data.distances,
    durations: data.durations || [],
  };
};

const buildNavigationUrl = ({ from = null, to = null, vehicleType = null, profile = null } = {}) => {
  const fromPoint = readLatLng(from);
  const toPoint = readLatLng(to);
  if (!toPoint) return null;
  const routeProfile = profile || getRouteProfileForVehicle(vehicleType);
  const engine = routeProfile.startsWith('cycling') ? 'fossgis_osrm_bike' : 'fossgis_osrm_car';

  if (!fromPoint) {
    return `https://www.openstreetmap.org/?mlat=${toPoint.latitude}&mlon=${toPoint.longitude}#map=15/${toPoint.latitude}/${toPoint.longitude}`;
  }

  return `https://www.openstreetmap.org/directions?engine=${engine}&route=${fromPoint.latitude},${fromPoint.longitude};${toPoint.latitude},${toPoint.longitude}`;
};

const getMapProviderStatus = () => {
  const provider = getMapProvider();
  const configured = provider === 'openrouteservice'
    ? Boolean(process.env.OPENROUTESERVICE_API_KEY)
    : Boolean(process.env.GOOGLE_MAPS_API_KEY);

  return {
    provider,
    configured,
    required: shouldRequireRouteProvider(),
  };
};

module.exports = {
  buildNavigationUrl,
  calculateDistanceMatrix,
  calculateRouteMetrics,
  getRouteProfileForVehicle,
  getMapProvider,
  getMapProviderStatus,
  isValidCoordinate,
  lookupOpenRouteServiceAddresses,
  normalizeRouteGeometry,
  readLatLng,
};
