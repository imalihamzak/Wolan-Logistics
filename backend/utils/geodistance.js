/**
 * Geo distance calculations for package/rider GPS divergence alerts.
 * Accepts either { latitude, longitude }, GeoJSON { coordinates: [lng, lat] },
 * or legacy [lat, lng] arrays.
 */

const isValidLatLng = (latitude, longitude) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
);

const readLatLng = (location) => {
  if (!location) return null;

  if (Array.isArray(location?.coordinates)) {
    const [longitude, latitude] = location.coordinates.map(Number);
    return isValidLatLng(latitude, longitude) ? [latitude, longitude] : null;
  }

  if (Array.isArray(location)) {
    const [latitude, longitude] = location.map(Number);
    return isValidLatLng(latitude, longitude) ? [latitude, longitude] : null;
  }

  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng ?? location.lon);
  return isValidLatLng(latitude, longitude) ? [latitude, longitude] : null;
};

function haversineDistance(riderCoords, packageCoords) {
  const riderLatLng = readLatLng(riderCoords);
  const packageLatLng = readLatLng(packageCoords);
  if (!riderLatLng || !packageLatLng) {
    return Infinity;
  }

  const R = 6371000; // Earth radius in meters
  const [lat1, lng1] = riderLatLng;
  const [lat2, lng2] = packageLatLng;

  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2)
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

function shouldAlert(riderLoc, packageLoc, threshold = 500) {
  const distance = haversineDistance(riderLoc, packageLoc);
  return Number.isFinite(distance) && distance > threshold;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return 'Unavailable';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

module.exports = {
  haversineDistance,
  shouldAlert,
  formatDistance,
};
