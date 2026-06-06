const Hub = require('../models/Hub');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const { buildNavigationUrl, normalizeRouteGeometry } = require('./mapProviderService');
const {
  buildHubScopedMatch,
  describeHubScope,
} = require('../utils/hubAccess');

const ACTIVE_ORDER_STATUSES = ['pending', 'picked_up', 'at_hub', 'out_for_delivery'];
const ONLINE_RIDER_STATUSES = ['available', 'on_delivery'];
const STATUS_PRIORITY = {
  out_for_delivery: 1,
  at_hub: 2,
  picked_up: 3,
  pending: 4,
};
const parsedGpsDarkMinutes = Number(process.env.LIVE_MAP_GPS_DARK_MINUTES);
const GPS_DARK_MINUTES = Number.isFinite(parsedGpsDarkMinutes) && parsedGpsDarkMinutes > 0
  ? parsedGpsDarkMinutes
  : 15;
const parsedIdleMinutes = Number(process.env.LIVE_MAP_IDLE_MINUTES);
const IDLE_RIDER_MINUTES = Number.isFinite(parsedIdleMinutes) && parsedIdleMinutes > 0
  ? parsedIdleMinutes
  : GPS_DARK_MINUTES;
const parsedDeliverySpeed = Number(process.env.LIVE_MAP_DELIVERY_SPEED_KMH);
const DELIVERY_SPEED_KMH = Number.isFinite(parsedDeliverySpeed) && parsedDeliverySpeed > 0
  ? parsedDeliverySpeed
  : 20;
const parsedDeliveryBuffer = Number(process.env.LIVE_MAP_DELIVERY_BUFFER_MINUTES);
const DELIVERY_BUFFER_MINUTES = Number.isFinite(parsedDeliveryBuffer) && parsedDeliveryBuffer >= 0
  ? parsedDeliveryBuffer
  : 8;
const parsedPickupToHubSla = Number(process.env.LIVE_MAP_PICKUP_TO_HUB_SLA_MINUTES);
const PICKUP_TO_HUB_SLA_MINUTES = Number.isFinite(parsedPickupToHubSla) && parsedPickupToHubSla > 0
  ? parsedPickupToHubSla
  : 45;

const readId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return String(value._id || value.id || value);
};

const buildScopedMatch = (actor = {}, query = {}) => {
  return buildHubScopedMatch(actor, query, {
    actionName: 'Live map access',
  });
};

const readSingleHubId = (scope = {}) => {
  if (!scope.hub_id || scope.hub_id.$in) return null;
  return scope.hub_id;
};

const hasValidLatLng = (latitude, longitude) => Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
  && !(latitude === 0 && longitude === 0);

const readGeoPoint = (location) => {
  const [longitude, latitude] = Array.isArray(location?.coordinates) ? location.coordinates : [];

  if (!hasValidLatLng(Number(latitude), Number(longitude))) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
};

const readTrackerPoint = (order) => {
  const packagePoint = readGeoPoint(order.package_gps_location);
  if (packagePoint) {
    return {
      ...packagePoint,
      source: 'package_gps_location',
      updated_at: order.package_last_update || order.tracker_last_location?.updated_at || null,
    };
  }

  const latitude = Number(order.tracker_last_location?.latitude);
  const longitude = Number(order.tracker_last_location?.longitude);

  if (!hasValidLatLng(latitude, longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    source: 'tracker_last_location',
    updated_at: order.tracker_last_location?.updated_at || null,
  };
};

const getMerchantName = (merchant) => {
  if (!merchant) return 'Unknown merchant';
  return merchant.shop_name || merchant.merchant_name || merchant.email || 'Unknown merchant';
};

const getRiderName = (rider) => {
  if (!rider) return 'Unassigned';
  return rider.full_name || rider.email || rider.phone || 'Rider';
};

const minutesUntil = (date, now = new Date()) => {
  if (!date) return null;
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.ceil((timestamp - now.getTime()) / 60000);
};

const addMinutes = (date, minutes) => {
  if (!date || !Number.isFinite(minutes)) return null;
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp + minutes * 60000);
};

const formatEtaLabel = (minutes, fallback = 'ETA pending') => {
  if (!Number.isFinite(minutes)) return fallback;
  if (minutes < 0) return `Delayed ${Math.abs(minutes)} min`;
  if (minutes === 0) return 'Due now';
  return `ETA ${minutes} min`;
};

const estimateDeliveryMinutes = (order) => {
  const durationSeconds = Number(order.pricing_duration_seconds);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const routeMinutes = Math.ceil(durationSeconds / 60) + DELIVERY_BUFFER_MINUTES;
    const maxMinutes = order.service_level === 'express' ? 60 : 180;
    return Math.max(8, Math.min(routeMinutes, maxMinutes));
  }

  const distanceKm = Number(order.pricing_distance_km);
  if (Number.isFinite(distanceKm) && distanceKm > 0) {
    const travelMinutes = Math.ceil((distanceKm / DELIVERY_SPEED_KMH) * 60) + DELIVERY_BUFFER_MINUTES;
    const maxMinutes = order.service_level === 'express' ? 60 : 180;
    return Math.max(8, Math.min(travelMinutes, maxMinutes));
  }

  return order.service_level === 'express' ? 60 : 45;
};

const buildOrderEta = (order, now = new Date()) => {
  if (!order) return null;

  if (order.order_status === 'pending' && order.assignment_response_due_at) {
    const remaining = minutesUntil(order.assignment_response_due_at, now);
    return {
      phase: 'assignment_response',
      due_at: order.assignment_response_due_at,
      minutes_remaining: remaining,
      is_delayed: Number.isFinite(remaining) && remaining < 0,
      label: Number.isFinite(remaining)
        ? (remaining < 0 ? `Response delayed ${Math.abs(remaining)} min` : `Response due ${remaining} min`)
        : 'Response ETA pending',
      source: 'assignment_response_due_at',
    };
  }

  if (order.order_status === 'picked_up' && order.picked_up_at) {
    const dueAt = addMinutes(order.picked_up_at, PICKUP_TO_HUB_SLA_MINUTES);
    const remaining = minutesUntil(dueAt, now);
    return {
      phase: 'hub_arrival',
      due_at: dueAt,
      minutes_remaining: remaining,
      is_delayed: Number.isFinite(remaining) && remaining < 0,
      label: formatEtaLabel(remaining, 'Hub ETA pending'),
      source: 'pickup_to_hub_sla',
    };
  }

  if (order.order_status === 'at_hub') {
    return {
      phase: 'hub_staging',
      due_at: null,
      minutes_remaining: null,
      is_delayed: false,
      label: 'Ready for dispatch',
      source: 'hub_scan_in',
    };
  }

  if (order.order_status === 'out_for_delivery') {
    const start = order.out_for_delivery_at || order.accepted_at || order.assigned_at || order.updatedAt;
    const dueAt = addMinutes(start, estimateDeliveryMinutes(order));
    const remaining = minutesUntil(dueAt, now);
    return {
      phase: 'customer_delivery',
      due_at: dueAt,
      minutes_remaining: remaining,
      is_delayed: Number.isFinite(remaining) && remaining < 0,
      label: formatEtaLabel(remaining, 'Delivery ETA pending'),
      source: Number.isFinite(Number(order.pricing_duration_seconds))
        ? 'route_duration_and_status_time'
        : Number.isFinite(Number(order.pricing_distance_km)) ? 'distance_and_status_time' : 'status_time_fallback',
    };
  }

  return {
    phase: order.order_status,
    due_at: null,
    minutes_remaining: null,
    is_delayed: false,
    label: 'ETA pending',
    source: 'status_pending',
  };
};

const normalizeOrder = (order) => {
  const packageGps = readTrackerPoint(order);
  const pickupPoint = readGeoPoint(order.pickup_coordinates);
  const dropoffPoint = readGeoPoint(order.dropoff_coordinates);
  const routeGeometry = normalizeRouteGeometry(order.route_geometry);
  const eta = buildOrderEta(order);

  return {
    id: String(order._id),
    order_id: order.order_id,
    status: order.order_status,
    delivery_zone: order.delivery_zone,
    delivery_address: order.delivery_address,
    pickup_coordinates: pickupPoint,
    dropoff_coordinates: dropoffPoint,
    customer_name: order.customer_name,
    merchant: getMerchantName(order.merchant_id),
    rider_user_id: readId(order.rider_id),
    rider_name: getRiderName(order.rider_id),
    cod_amount: order.cod_amount || 0,
    package_tracking_id: order.package_tracking_id,
    physical_tracker_id: order.physical_tracker_id || null,
    tracker_divergence_alert: Boolean(order.tracker_divergence_alert),
    tracker_divergence_distance: order.tracker_divergence_distance || 0,
    pricing_distance_km: Number.isFinite(Number(order.pricing_distance_km)) ? Number(order.pricing_distance_km) : null,
    pricing_duration_seconds: Number.isFinite(Number(order.pricing_duration_seconds)) ? Number(order.pricing_duration_seconds) : null,
    pricing_source: order.pricing_source || null,
    route_geometry: routeGeometry,
    navigation_url: buildNavigationUrl({ from: packageGps || pickupPoint, to: dropoffPoint }),
    package_gps: packageGps,
    eta,
    updatedAt: order.updatedAt,
  };
};

const sortOrdersForRider = (left, right) => {
  const priorityDiff = (STATUS_PRIORITY[left.status] || 99) - (STATUS_PRIORITY[right.status] || 99);
  if (priorityDiff !== 0) return priorityDiff;

  return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
};

const buildAlerts = ({ liveRiders, packageMarkers }) => {
  const alerts = [];

  liveRiders.forEach((rider) => {
    if (rider.is_delayed && rider.current_order) {
      alerts.push({
        type: 'Delayed Rider',
        detail: `${rider.full_name} is delayed on ${rider.current_order.order_id}: ${rider.current_order.eta?.label || 'ETA overdue'}`,
        level: 'destructive',
        rider_id: rider.id,
        rider_name: rider.full_name,
        order_id: rider.current_order.order_id,
      });
      return;
    }

    if (rider.is_idle) {
      alerts.push({
        type: 'Idle Rider',
        detail: `${rider.full_name} is available but has no fresh GPS update`,
        level: 'warning',
        rider_id: rider.id,
        rider_name: rider.full_name,
      });
      return;
    }

    if (rider.is_gps_dark) {
      alerts.push({
        type: 'GPS Dark',
        detail: `${rider.full_name} is on delivery but has no fresh GPS update`,
        level: 'destructive',
        rider_id: rider.id,
        rider_name: rider.full_name,
      });
    }
  });

  packageMarkers
    .filter((marker) => marker.tracker_divergence_alert)
    .forEach((marker) => {
      alerts.push({
        type: 'Location Mismatch',
        detail: `${marker.order_id} package is ${Math.round(marker.tracker_divergence_distance || 0)}m from rider`,
        level: 'destructive',
        order_id: marker.order_id,
      });
    });

  return alerts.slice(0, 8);
};

const getLiveMapData = async ({ actor, query = {} }) => {
  const scope = buildScopedMatch(actor, query);
  const singleHubId = readSingleHubId(scope);
  const riderScope = {
    ...scope,
    is_active: true,
    kyc_status: 'verified',
    all_documents_verified: true,
    stage_chairman_phone: { $nin: [null, ''] },
  };
  const gpsDarkCutoff = new Date(Date.now() - GPS_DARK_MINUTES * 60 * 1000);

  const [hub, riders, activeOrders] = await Promise.all([
    singleHubId ? Hub.findById(singleHubId).select('name code city state coordinates') : Promise.resolve(null),
    Rider.find(riderScope).sort({ current_status: 1, full_name: 1 }).lean(),
    Order.find({
      ...scope,
      order_status: { $in: ACTIVE_ORDER_STATUSES },
      rider_id: { $ne: null },
    })
      .sort({ updatedAt: -1 })
      .populate('merchant_id', 'merchant_name shop_name email phone')
      .populate('rider_id', 'full_name email phone')
      .lean(),
  ]);

  const normalizedOrders = activeOrders.map(normalizeOrder);
  const ordersByRider = normalizedOrders.reduce((accumulator, order) => {
    if (!order.rider_user_id) return accumulator;
    if (!accumulator[order.rider_user_id]) {
      accumulator[order.rider_user_id] = [];
    }
    accumulator[order.rider_user_id].push(order);
    return accumulator;
  }, {});

  Object.values(ordersByRider).forEach((orders) => orders.sort(sortOrdersForRider));

  const liveRiders = riders.map((rider) => {
    const riderUserId = readId(rider.user_id);
    const orders = ordersByRider[riderUserId] || [];
    const gps = readGeoPoint(rider.gps_location);
    const lastLocationAt = rider.last_location_update ? new Date(rider.last_location_update) : null;
    const hasStaleLocation = !lastLocationAt || Number.isNaN(lastLocationAt.getTime()) || lastLocationAt < gpsDarkCutoff;
    const hasIdleLocation = !lastLocationAt || Number.isNaN(lastLocationAt.getTime())
      || lastLocationAt < new Date(Date.now() - IDLE_RIDER_MINUTES * 60 * 1000);
    const currentOrder = orders[0] || null;
    const currentOrderWithNavigation = currentOrder
      ? {
        ...currentOrder,
        navigation_url: buildNavigationUrl({
          from: gps || currentOrder.package_gps || currentOrder.pickup_coordinates,
          to: currentOrder.dropoff_coordinates,
          vehicleType: rider.vehicle_type,
        }) || currentOrder.navigation_url,
      }
      : null;
    const isGpsDark = rider.current_status === 'on_delivery' && hasStaleLocation;
    const isIdle = rider.current_status === 'available' && hasIdleLocation;
    const isDelayed = Boolean(currentOrderWithNavigation?.eta?.is_delayed);

    return {
      id: String(rider._id),
      user_id: riderUserId,
      full_name: rider.full_name,
      phone: rider.phone,
      bike_plate: rider.bike_plate,
      vehicle_type: rider.vehicle_type || null,
      current_status: rider.current_status,
      gps_location: gps,
      has_gps_fix: Boolean(gps),
      last_location_update: rider.last_location_update,
      current_cod: rider.current_cod || 0,
      hub_id: readId(rider.hub_id),
      active_order_count: orders.length,
      current_order: currentOrderWithNavigation,
      is_delayed: isDelayed,
      is_idle: isIdle,
      is_gps_dark: isGpsDark,
      gps_state: isDelayed ? 'delayed' : isIdle ? 'idle' : isGpsDark ? 'gps_dark' : gps ? 'tracked' : 'no_fix',
    };
  });

  const packageMarkers = normalizedOrders
    .filter((order) => order.package_gps)
    .map((order) => ({
      id: order.id,
      order_id: order.order_id,
      rider_user_id: order.rider_user_id,
      rider_name: order.rider_name,
      status: order.status,
      delivery_zone: order.delivery_zone,
      package_tracking_id: order.package_tracking_id,
      physical_tracker_id: order.physical_tracker_id,
      tracker_divergence_alert: order.tracker_divergence_alert,
      tracker_divergence_distance: order.tracker_divergence_distance,
      gps_location: order.package_gps,
    }));

  const gpsDarkRiders = liveRiders.filter((rider) => rider.is_gps_dark);
  const delayedRiders = liveRiders.filter((rider) => rider.is_delayed);
  const idleRiders = liveRiders.filter((rider) => rider.is_idle);
  const scopeDescription = describeHubScope(actor, scope);

  return {
    scope: {
      ...scopeDescription,
      hub_id: scopeDescription.hub_id,
      hub_ids: scopeDescription.hub_ids,
      hub_name: hub?.name || (scopeDescription.level === 'regional' ? 'Assigned regional hubs' : 'All hubs'),
      hub_code: hub?.code || null,
      hub_coordinates: hub?.coordinates || null,
      generated_at: new Date(),
    },
    summary: {
      total_riders: liveRiders.length,
      active_riders: liveRiders.filter((rider) => ONLINE_RIDER_STATUSES.includes(rider.current_status)).length,
      riders_with_gps: liveRiders.filter((rider) => rider.has_gps_fix).length,
      active_orders: normalizedOrders.length,
      packages_with_gps: packageMarkers.length,
      mismatches: packageMarkers.filter((marker) => marker.tracker_divergence_alert).length,
      gps_dark: gpsDarkRiders.length,
      delayed_riders: delayedRiders.length,
      idle_riders: idleRiders.length,
    },
    riders: liveRiders,
    packages: packageMarkers,
    alerts: buildAlerts({ liveRiders, packageMarkers }),
  };
};

module.exports = {
  getLiveMapData,
};
