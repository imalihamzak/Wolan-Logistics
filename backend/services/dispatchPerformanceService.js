const mongoose = require('mongoose');

const Hub = require('../models/Hub');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const User = require('../models/User');
const {
  DEFAULT_PACKAGE_SIZE,
  DISPATCH_GPS_FRESH_MINUTES,
  DISPATCH_MAX_PRIORITY_DISTANCE_KM,
  DISPATCH_PERFORMANCE_WEIGHTS,
  DISPATCH_PERFORMANCE_WINDOW_DAYS,
  DISPATCH_PRIORITY_WEIGHTS,
  DISPATCH_PUNCTUALITY_SLA_MINUTES,
  isVehicleCompatibleWithPackage,
} = require('../constants/dispatchConstants');
const { RIDER_COD_OPERATION_LIMIT } = require('../constants/settlementConstants');
const { isAccountLocked } = require('../utils/accountSecurity');
const { calculateDistanceMatrix, getRouteProfileForVehicle } = require('./mapProviderService');

const ASSIGNABLE_RIDER_STATUSES = ['available'];
const ACTIVE_RIDER_STATUSES = ['pending', 'picked_up', 'at_hub', 'out_for_delivery'];
const parsedRouteMatrixMaxCandidates = Number(process.env.DISPATCH_ROUTE_MATRIX_MAX_CANDIDATES);
const ROUTE_MATRIX_MAX_CANDIDATES = Number.isFinite(parsedRouteMatrixMaxCandidates) && parsedRouteMatrixMaxCandidates > 0
  ? Math.min(parsedRouteMatrixMaxCandidates, 50)
  : 25;
const USE_ROUTE_MATRIX = process.env.DISPATCH_USE_ROUTE_MATRIX !== 'false';

const readId = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return String(value._id || value.id || value);
  return String(value);
};

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(Number(value) || 0, min), max);
const percent = (value) => Math.round(clamp(value) * 100);
const roundNumber = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const withSession = (query, session) => (session ? query.session(session) : query);

const getRate = (numerator, denominator, neutral = 0.75) => (
  denominator > 0 ? clamp(numerator / denominator) : neutral
);

const isValidCoordinatePair = ({ latitude, longitude } = {}) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
  && !(latitude === 0 && longitude === 0)
);

const getPointCoordinates = (location) => {
  const [longitude, latitude] = Array.isArray(location?.coordinates) ? location.coordinates : [];
  if (!isValidCoordinatePair({ latitude, longitude })) {
    return null;
  }
  return { latitude, longitude };
};

const getHubCoordinates = (hub) => {
  const latitude = Number(hub?.coordinates?.latitude);
  const longitude = Number(hub?.coordinates?.longitude);
  if (!isValidCoordinatePair({ latitude, longitude })) {
    return null;
  }
  return { latitude, longitude };
};

const distanceKm = (from, to) => {
  if (!from || !to) return null;

  const toRad = (value) => (value * Math.PI) / 180;
  const radiusKm = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getDistanceScore = (distance) => {
  if (distance === null) return 0.45;
  return clamp(1 - (distance / DISPATCH_MAX_PRIORITY_DISTANCE_KM), 0, 1);
};

const logBelongsToRider = (log, riderUserId) => {
  const metadata = log?.metadata || {};
  return readId(log?.actor_id) === riderUserId
    || readId(metadata.rider_id) === riderUserId
    || readId(metadata.expired_rider_id) === riderUserId;
};

const countLogs = (orders, riderUserId, action) => orders.reduce((count, order) => (
  count + (order.activity_logs || []).filter((log) => log.action === action && logBelongsToRider(log, riderUserId)).length
), 0);

const orderBelongsToRider = (order, riderUserId) => (
  readId(order.rider_id) === riderUserId
  || (order.activity_logs || []).some((log) => logBelongsToRider(log, riderUserId))
);

const getRecentOrdersForRiders = async ({ hubObjectId, riderUserIds, since, session }) => {
  const riderUserIdStrings = riderUserIds.map(readId);
  const query = Order.find({
    hub_id: hubObjectId,
    createdAt: { $gte: since },
    $or: [
      { rider_id: { $in: riderUserIds } },
      { 'activity_logs.actor_id': { $in: riderUserIds } },
      { 'activity_logs.metadata.rider_id': { $in: riderUserIdStrings } },
      { 'activity_logs.metadata.expired_rider_id': { $in: riderUserIdStrings } },
    ],
  })
    .select('rider_id hub_id delivery_zone order_status assigned_at accepted_at rejected_at out_for_delivery_at delivered_at failed_at returned_at tracker_divergence_alert activity_logs createdAt')
    .lean();

  return withSession(query, session);
};

const getActiveAssignmentCounts = async ({ hubObjectId, riderUserIds, session }) => withSession(Order.aggregate([
  {
    $match: {
      hub_id: hubObjectId,
      rider_id: { $in: riderUserIds },
      order_status: { $in: ACTIVE_RIDER_STATUSES },
    },
  },
  { $group: { _id: '$rider_id', activeCount: { $sum: 1 } } },
]), session);

const getZoneScores = async ({ hubObjectId, riderUserIds, deliveryZone, since, session }) => {
  if (!deliveryZone) return [];

  return withSession(Order.aggregate([
    {
      $match: {
        hub_id: hubObjectId,
        rider_id: { $in: riderUserIds },
        delivery_zone: deliveryZone,
        createdAt: { $gte: since },
      },
    },
    { $group: { _id: '$rider_id', zoneScore: { $sum: 1 } } },
  ]), session);
};

const buildMetricsForProfile = ({
  profile,
  riderOrders,
  activeCount,
  zoneScore,
  targetCoordinates,
  routeMetrics = null,
  now,
}) => {
  const riderUserId = readId(profile.user_id);
  const assignmentLogs = countLogs(riderOrders, riderUserId, 'rider_assigned');
  const assignmentFallback = riderOrders.filter((order) => readId(order.rider_id) === riderUserId && order.assigned_at).length;
  const assignmentsTotal = Math.max(assignmentLogs, assignmentFallback);
  const acceptedAssignments = Math.max(
    countLogs(riderOrders, riderUserId, 'assignment_accepted'),
    riderOrders.filter((order) => readId(order.rider_id) === riderUserId && order.accepted_at).length
  );
  const rejectedAssignments = countLogs(riderOrders, riderUserId, 'assignment_rejected');
  const expiredAssignments = countLogs(riderOrders, riderUserId, 'assignment_expired');

  const finalOrders = riderOrders.filter((order) => readId(order.rider_id) === riderUserId);
  const failedOrReturned = finalOrders.filter((order) => ['failed', 'returned'].includes(order.order_status)).length;
  const cancellationEvents = rejectedAssignments + expiredAssignments + failedOrReturned;
  const cancellationDenominator = Math.max(assignmentsTotal, acceptedAssignments + rejectedAssignments + expiredAssignments + failedOrReturned);

  const timedDeliveredOrders = finalOrders.filter((order) => (
    order.order_status === 'delivered'
    && order.out_for_delivery_at
    && order.delivered_at
  ));
  const punctualDeliveries = timedDeliveredOrders.filter((order) => (
    (new Date(order.delivered_at).getTime() - new Date(order.out_for_delivery_at).getTime()) / 60000 <= DISPATCH_PUNCTUALITY_SLA_MINUTES
  )).length;

  const since = new Date(now.getTime() - DISPATCH_PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const complaintCount = (profile.incidents || []).filter((incident) => (
    incident.type === 'complaint'
    && (!incident.reported_at || new Date(incident.reported_at) >= since)
  )).length;

  const riderCoordinates = getPointCoordinates(profile.gps_location);
  const straightLineDistance = distanceKm(riderCoordinates, targetCoordinates);
  const routeDistanceKm = Number(routeMetrics?.distance_meters) > 0
    ? Number(routeMetrics.distance_meters) / 1000
    : null;
  const distance = Number.isFinite(routeDistanceKm) ? routeDistanceKm : straightLineDistance;
  const gpsFreshCutoff = new Date(now.getTime() - DISPATCH_GPS_FRESH_MINUTES * 60 * 1000);
  const gpsFresh = Boolean(riderCoordinates && profile.last_location_update && new Date(profile.last_location_update) >= gpsFreshCutoff);
  const gpsDivergenceCount = finalOrders.filter((order) => order.tracker_divergence_alert).length;
  const gpsDivergenceRate = getRate(gpsDivergenceCount, Math.max(finalOrders.length, 1), 0);

  const acceptanceScore = getRate(acceptedAssignments, assignmentsTotal, 0.75);
  const cancellationRatio = getRate(cancellationEvents, cancellationDenominator, 0);
  const cancellationScore = 1 - cancellationRatio;
  const punctualityScore = getRate(punctualDeliveries, timedDeliveredOrders.length, 0.75);
  const ratingScore = Number(profile.total_ratings || 0) > 0
    ? clamp(Number(profile.rating || 0) / 5, 0, 1)
    : 0.8;
  const complaintScore = clamp(1 - complaintCount / 3, 0, 1);
  const gpsFreshScore = gpsFresh ? 1 : (riderCoordinates ? 0.45 : 0.15);
  const gpsConsistencyScore = clamp((gpsFreshScore * 0.65) + ((1 - gpsDivergenceRate) * 0.35), 0, 1);

  const performanceScore = percent(
    acceptanceScore * DISPATCH_PERFORMANCE_WEIGHTS.acceptance
    + cancellationScore * DISPATCH_PERFORMANCE_WEIGHTS.cancellation
    + punctualityScore * DISPATCH_PERFORMANCE_WEIGHTS.punctuality
    + ratingScore * DISPATCH_PERFORMANCE_WEIGHTS.rating
    + complaintScore * DISPATCH_PERFORMANCE_WEIGHTS.complaints
    + gpsConsistencyScore * DISPATCH_PERFORMANCE_WEIGHTS.gps
  );

  const proximityScore = getDistanceScore(distance);
  const workloadScore = clamp(1 - (activeCount / 3), 0, 1);
  const zoneFamiliarityScore = clamp(zoneScore / 10, 0, 1);
  const priorityScore = percent(
    (performanceScore / 100) * DISPATCH_PRIORITY_WEIGHTS.performance
    + proximityScore * DISPATCH_PRIORITY_WEIGHTS.proximity
    + workloadScore * DISPATCH_PRIORITY_WEIGHTS.workload
    + zoneFamiliarityScore * DISPATCH_PRIORITY_WEIGHTS.zone
  );

  return {
    performance_score: performanceScore,
    priority_score: priorityScore,
    acceptance_rate: percent(acceptanceScore),
    cancellation_ratio: percent(cancellationRatio),
    punctuality_rate: percent(punctualityScore),
    customer_rating_score: percent(ratingScore),
    complaint_score: percent(complaintScore),
    gps_consistency_score: percent(gpsConsistencyScore),
    proximity_score: percent(proximityScore),
    workload_score: percent(workloadScore),
    zone_familiarity_score: percent(zoneFamiliarityScore),
    assignments_total: assignmentsTotal,
    accepted_assignments: acceptedAssignments,
    rejected_assignments: rejectedAssignments,
    expired_assignments: expiredAssignments,
    cancellation_events: cancellationEvents,
    punctual_deliveries: punctualDeliveries,
    timed_deliveries: timedDeliveredOrders.length,
    complaint_count: complaintCount,
    gps_divergence_count: gpsDivergenceCount,
    gps_fresh: gpsFresh,
    distance_km: roundNumber(distance),
    route_distance_km: roundNumber(routeDistanceKm),
    route_duration_seconds: Number.isFinite(Number(routeMetrics?.duration_seconds))
      ? Math.round(Number(routeMetrics.duration_seconds))
      : null,
    distance_source: Number.isFinite(routeDistanceKm) ? routeMetrics.source : (distance === null ? 'unavailable' : 'haversine_fallback'),
    active_assignments: activeCount,
    window_days: DISPATCH_PERFORMANCE_WINDOW_DAYS,
    calculated_at: now,
  };
};

const buildRouteMetricsByProfile = async ({ profiles, targetCoordinates }) => {
  if (!USE_ROUTE_MATRIX || !targetCoordinates) {
    return {};
  }

  const candidates = profiles
    .map((profile) => ({
      profile,
      point: getPointCoordinates(profile.gps_location),
    }))
    .filter((item) => item.point)
    .slice(0, ROUTE_MATRIX_MAX_CANDIDATES);

  if (candidates.length === 0) {
    return {};
  }

  try {
    const groupedCandidates = candidates.reduce((accumulator, candidate) => {
      const profile = getRouteProfileForVehicle(candidate.profile.vehicle_type);
      if (!accumulator[profile]) accumulator[profile] = [];
      accumulator[profile].push(candidate);
      return accumulator;
    }, {});

    const routeMetricsByProfile = {};
    for (const [profile, profileCandidates] of Object.entries(groupedCandidates)) {
      // eslint-disable-next-line no-await-in-loop
      const matrix = await calculateDistanceMatrix({
        sources: profileCandidates.map((candidate) => candidate.point),
        destinations: [targetCoordinates],
        profile,
      });

      if (!matrix) continue;

      profileCandidates.forEach((candidate, index) => {
        const distanceMeters = Number(matrix.distances?.[index]?.[0]);
        const durationSeconds = Number(matrix.durations?.[index]?.[0]);
        if (Number.isFinite(distanceMeters) && distanceMeters > 0) {
          routeMetricsByProfile[readId(candidate.profile._id)] = {
            distance_meters: distanceMeters,
            duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
            source: matrix.source,
          };
        }
      });
    }

    return routeMetricsByProfile;
  } catch (error) {
    console.warn('Dispatch route matrix unavailable, using GPS fallback:', error.message);
    return {};
  }
};

const scoreProfiles = async ({ profiles, users, hubId, deliveryZone, targetCoordinates, session, persist = true }) => {
  const hubObjectId = new mongoose.Types.ObjectId(hubId);
  const now = new Date();
  const since = new Date(now.getTime() - DISPATCH_PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const userIds = users.map((user) => user._id);
  const userById = users.reduce((accumulator, user) => {
    accumulator[readId(user._id)] = user;
    return accumulator;
  }, {});

  const [recentOrders, activeCounts, zoneScores, hub] = await Promise.all([
    getRecentOrdersForRiders({ hubObjectId, riderUserIds: userIds, since, session }),
    getActiveAssignmentCounts({ hubObjectId, riderUserIds: userIds, session }),
    getZoneScores({ hubObjectId, riderUserIds: userIds, deliveryZone, since, session }),
    withSession(Hub.findById(hubObjectId).select('coordinates').lean(), session),
  ]);

  const target = targetCoordinates || getHubCoordinates(hub);
  const routeMetricsByProfile = await buildRouteMetricsByProfile({ profiles, targetCoordinates: target });
  const activeMap = activeCounts.reduce((accumulator, item) => {
    accumulator[readId(item._id)] = item.activeCount;
    return accumulator;
  }, {});
  const zoneMap = zoneScores.reduce((accumulator, item) => {
    accumulator[readId(item._id)] = item.zoneScore;
    return accumulator;
  }, {});

  const scoredProfiles = profiles.map((profile) => {
    const riderUserId = readId(profile.user_id);
    const riderOrders = recentOrders.filter((order) => orderBelongsToRider(order, riderUserId));
    const metrics = buildMetricsForProfile({
      profile,
      riderOrders,
      activeCount: activeMap[riderUserId] || 0,
      zoneScore: zoneMap[riderUserId] || 0,
      targetCoordinates: target,
      routeMetrics: routeMetricsByProfile[readId(profile._id)] || null,
      now,
    });

    return {
      profile,
      user: userById[riderUserId],
      metrics,
    };
  });

  if (persist && scoredProfiles.length > 0) {
    await Rider.bulkWrite(scoredProfiles.map(({ profile, metrics }) => ({
      updateOne: {
        filter: { _id: profile._id },
        update: {
          $set: {
            performance_score: metrics.performance_score,
            dispatch_metrics: metrics,
          },
        },
      },
    })), session ? { session } : {});
  }

  return scoredProfiles
    .filter(({ user }) => Boolean(user))
    .map(({ profile, user, metrics }) => ({
      ...user,
      rider_profile_id: profile._id,
      current_status: profile.current_status,
      vehicle_type: profile.vehicle_type,
      activeCount: metrics.active_assignments,
      zoneScore: metrics.zone_familiarity_score,
      distance_km: metrics.distance_km,
      performance_score: metrics.performance_score,
      dispatch_priority_score: metrics.priority_score,
      dispatch_metrics: metrics,
    }))
    .sort((left, right) => {
      if (right.dispatch_priority_score !== left.dispatch_priority_score) {
        return right.dispatch_priority_score - left.dispatch_priority_score;
      }
      if (right.performance_score !== left.performance_score) {
        return right.performance_score - left.performance_score;
      }
      if ((left.distance_km ?? Number.MAX_SAFE_INTEGER) !== (right.distance_km ?? Number.MAX_SAFE_INTEGER)) {
        return (left.distance_km ?? Number.MAX_SAFE_INTEGER) - (right.distance_km ?? Number.MAX_SAFE_INTEGER);
      }
      if (left.activeCount !== right.activeCount) {
        return left.activeCount - right.activeCount;
      }
      return new Date(left.createdAt) - new Date(right.createdAt);
    });
};

const scoreDispatchCandidates = async ({
  hubId,
  deliveryZone,
  packageSize = DEFAULT_PACKAGE_SIZE,
  codAmount = 0,
  targetCoordinates = null,
  session = null,
}) => {
  const hubObjectId = new mongoose.Types.ObjectId(hubId);
  const maxCodBeforeAssignment = RIDER_COD_OPERATION_LIMIT - Number(codAmount || 0);

  if (!Number.isFinite(maxCodBeforeAssignment) || maxCodBeforeAssignment <= 0) {
    return [];
  }

  const profileQuery = Rider.find({
    hub_id: hubObjectId,
    is_active: true,
    kyc_status: 'verified',
    all_documents_verified: true,
    stage_chairman_phone: { $nin: [null, ''] },
    current_status: { $in: ASSIGNABLE_RIDER_STATUSES },
    $or: [
      { current_cod: { $exists: false } },
      { current_cod: { $lt: maxCodBeforeAssignment } },
    ],
  })
    .select('user_id full_name current_status vehicle_type current_cod gps_location last_location_update rating total_ratings incidents performance_score dispatch_metrics createdAt hub_id')
    .lean();

  const riderProfiles = await withSession(profileQuery, session);
  const compatibleProfiles = riderProfiles.filter((profile) => isVehicleCompatibleWithPackage(profile.vehicle_type, packageSize));

  if (compatibleProfiles.length === 0) {
    return [];
  }

  const users = await withSession(User.find({
    _id: { $in: compatibleProfiles.map((profile) => profile.user_id) },
    role: 'rider',
    is_active: true,
    kyc_status: 'verified',
    account_locked: { $ne: true },
    hub_id: hubObjectId,
  }).lean(), session);

  const eligibleUsers = users.filter((user) => !isAccountLocked(user));
  if (eligibleUsers.length === 0) {
    return [];
  }

  const userIds = new Set(eligibleUsers.map((user) => readId(user._id)));
  const eligibleProfiles = compatibleProfiles.filter((profile) => userIds.has(readId(profile.user_id)));

  return scoreProfiles({
    profiles: eligibleProfiles,
    users: eligibleUsers,
    hubId,
    deliveryZone,
    targetCoordinates,
    session,
    persist: true,
  });
};

const refreshRiderDispatchPerformance = async ({ riderUserId, riderProfile = null, hubId = null, session = null }) => {
  const riderUserObjectId = new mongoose.Types.ObjectId(readId(riderUserId || riderProfile?.user_id));
  const profile = riderProfile || await withSession(
    Rider.findOne({ user_id: riderUserObjectId })
      .select('user_id full_name current_status vehicle_type current_cod gps_location last_location_update rating total_ratings incidents performance_score dispatch_metrics createdAt hub_id')
      .lean(),
    session
  );

  if (!profile) {
    return null;
  }

  const user = await withSession(User.findById(riderUserObjectId).lean(), session);
  if (!user) {
    return null;
  }

  const scored = await scoreProfiles({
    profiles: [profile],
    users: [user],
    hubId: hubId || profile.hub_id,
    deliveryZone: null,
    targetCoordinates: null,
    session,
    persist: true,
  });

  return scored[0]?.dispatch_metrics || null;
};

module.exports = {
  refreshRiderDispatchPerformance,
  scoreDispatchCandidates,
};
