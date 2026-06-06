const Hub = require('../models/Hub');
const Merchant = require('../models/Merchant');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const AppError = require('../utils/AppError');
const { getMacroHubComparison } = require('./hubAnalyticsService');
const {
  buildHubScopedMatch,
  describeHubScope,
  getAssignedHubIds,
  getDashboardLevelForRole,
} = require('../utils/hubAccess');

const ACTIVE_ORDER_STATUSES = ['pending', 'picked_up', 'at_hub', 'out_for_delivery'];
const ONLINE_RIDER_STATUSES = ['available', 'on_delivery'];
const ALL_ORDER_STATUSES = ['pending', 'picked_up', 'at_hub', 'out_for_delivery', 'delivered', 'failed', 'returned'];
const getEnvNumber = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const DEFAULT_DAILY_TARGET = getEnvNumber('DAILY_ORDER_TARGET', 150);
const DEFAULT_COD_ALERT_LIMIT = getEnvNumber('DASHBOARD_COD_ALERT_LIMIT', 1000000);
const DEFAULT_GPS_STALE_MINUTES = getEnvNumber('DASHBOARD_GPS_STALE_MINUTES', 15);

const getLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const resolveDashboardDay = (dateValue) => {
  let date = new Date();

  if (dateValue) {
    date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))
      ? new Date(`${dateValue}T00:00:00`)
      : new Date(dateValue);
  }

  if (Number.isNaN(date.getTime())) {
    throw new AppError('date is invalid', 400);
  }

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start,
    end,
    dateKey: getLocalDateKey(start),
  };
};

const resolveDailyTarget = (value) => {
  const target = Number(value || DEFAULT_DAILY_TARGET);
  if (!Number.isFinite(target) || target <= 0) {
    return DEFAULT_DAILY_TARGET > 0 ? DEFAULT_DAILY_TARGET : 150;
  }

  return Math.round(target);
};

const buildScopedMatch = (actor = {}, query = {}, level = 'auto') => buildHubScopedMatch(actor, query, {
  actionName: 'Dashboard access',
  level,
});

const readSingleHubId = (scope = {}) => {
  if (!scope.hub_id || scope.hub_id.$in) return null;
  return scope.hub_id;
};

const getScopeHubIds = (scope = {}, actor = {}) => {
  if (scope.hub_id?.$in) return scope.hub_id.$in.map(String);
  if (scope.hub_id) return [String(scope.hub_id)];
  return getAssignedHubIds(actor);
};

const filterMacroComparisonForActor = (rows, actor, scope) => {
  const level = getDashboardLevelForRole(actor?.role);
  if (level === 'hq') return rows;
  if (level === 'hub') return rows;

  const allowedHubIds = getScopeHubIds(scope, actor);
  if (allowedHubIds.length === 0) return [];
  return rows.filter((row) => allowedHubIds.includes(String(row.hub_id || '')));
};

const mergeDateRange = (match, start, end) => ({
  ...match,
  createdAt: { $gte: start, $lt: end },
});

const matchDateRange = (field, start, end) => ({
  [field]: { $gte: start, $lt: end },
});

const countByStatus = (rows) => ALL_ORDER_STATUSES.reduce((accumulator, status) => {
  accumulator[status] = rows.find((row) => row._id === status)?.count || 0;
  return accumulator;
}, {});

const formatHourLabel = (hour) => {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
};

const formatShortDate = (date) => new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
}).format(date);

const buildOrderVolume = (rows) => {
  const bucketed = rows.reduce((accumulator, row) => {
    const bucket = Math.floor(Number(row._id || 0) / 3) * 3;
    accumulator[bucket] = (accumulator[bucket] || 0) + row.count;
    return accumulator;
  }, {});

  return Array.from({ length: 8 }, (_, index) => {
    const hour = index * 3;
    return {
      time: formatHourLabel(hour),
      orders: bucketed[hour] || 0,
    };
  });
};

const buildWeeklyDeliveries = (rows, start) => {
  const byDate = rows.reduce((accumulator, row) => {
    if (!accumulator[row._id.date]) {
      accumulator[row._id.date] = { completed: 0, failed: 0 };
    }

    if (row._id.status === 'delivered') {
      accumulator[row._id.date].completed += row.count;
    }

    if (row._id.status === 'failed') {
      accumulator[row._id.date].failed += row.count;
    }

    return accumulator;
  }, {});

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const key = getLocalDateKey(date);

    return {
      date: key,
      day: formatShortDate(date),
      completed: byDate[key]?.completed || 0,
      failed: byDate[key]?.failed || 0,
    };
  });
};

const getDisplayName = (value, keys, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'string') return value;

  for (const key of keys) {
    if (value[key]) {
      return value[key];
    }
  }

  return fallback;
};

const minutesBetween = (start, end) => {
  if (!start || !end) return null;
  const duration = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
};

const average = (values) => {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) return 0;
  return Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length);
};

const buildTodayOrderList = (orders) => orders.map((order) => ({
  id: order._id,
  order_id: order.order_id,
  merchant: getDisplayName(order.merchant_id, ['shop_name', 'merchant_name', 'email'], 'Unknown merchant'),
  zone: order.delivery_zone,
  status: order.order_status,
  rider: getDisplayName(order.rider_id, ['full_name', 'email', 'phone'], 'Unassigned'),
  cod_amount: order.cod_amount || 0,
  delivery_fee: order.delivery_fee || 0,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
}));

const buildAlerts = ({ pendingKycMerchants, staleRiders, divergenceOrders, codLimitRiders, idleRiders }) => {
  const alerts = [];

  pendingKycMerchants.forEach((merchant) => {
    alerts.push({
      type: 'Merchant KYC',
      desc: `${merchant.shop_name || merchant.merchant_name} is waiting for KYC review`,
      level: 'warning',
      related_id: merchant._id,
    });
  });

  staleRiders.forEach((rider) => {
    alerts.push({
      type: 'GPS Dark',
      desc: `${rider.full_name} has no fresh GPS fix`,
      level: 'destructive',
      related_id: rider._id,
    });
  });

  divergenceOrders.forEach((order) => {
    alerts.push({
      type: 'Location Mismatch',
      desc: `${order.order_id} has ${Math.round(order.tracker_divergence_distance || 0)}m rider/package gap`,
      level: 'destructive',
      related_id: order._id,
    });
  });

  codLimitRiders.forEach((rider) => {
    alerts.push({
      type: 'COD Limit',
      desc: `${rider.full_name} is carrying ${Math.round(rider.current_cod || 0)} UGX`,
      level: 'warning',
      related_id: rider._id,
    });
  });

  idleRiders.forEach((rider) => {
    alerts.push({
      type: 'Idle Rider',
      desc: `${rider.full_name} is available but location is stale`,
      level: 'warning',
      related_id: rider._id,
    });
  });

  return alerts.slice(0, 6);
};

const getAdminDashboardData = async ({ actor, query = {}, level = 'auto' }) => {
  const orderScope = buildScopedMatch(actor, query, level);
  const singleHubId = readSingleHubId(orderScope);
  const riderScope = {
    ...orderScope,
    is_active: true,
    kyc_status: 'verified',
    all_documents_verified: true,
    stage_chairman_phone: { $nin: [null, ''] },
  };
  const merchantScope = orderScope.hub_id ? { hub_id: orderScope.hub_id } : {};
  const { start, end, dateKey } = resolveDashboardDay(query.date);
  const dailyTarget = resolveDailyTarget(query.daily_target);
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() - 6);
  const staleCutoff = new Date(Date.now() - DEFAULT_GPS_STALE_MINUTES * 60 * 1000);

  const todayMatch = mergeDateRange(orderScope, start, end);
  const todayActivityMatch = {
    ...orderScope,
    $or: [
      matchDateRange('createdAt', start, end),
      matchDateRange('picked_up_at', start, end),
      matchDateRange('at_hub_at', start, end),
      matchDateRange('out_for_delivery_at', start, end),
      matchDateRange('delivered_at', start, end),
      matchDateRange('failed_at', start, end),
      matchDateRange('returned_at', start, end),
    ],
  };
  const weeklyOutcomeMatch = {
    ...orderScope,
    $or: [
      { order_status: 'delivered', ...matchDateRange('delivered_at', weekStart, end) },
      { order_status: 'failed', ...matchDateRange('failed_at', weekStart, end) },
    ],
  };
  const todayOutcomeMatch = {
    ...orderScope,
    $or: [
      { order_status: 'delivered', ...matchDateRange('delivered_at', start, end) },
      { order_status: 'failed', ...matchDateRange('failed_at', start, end) },
      { order_status: 'returned', ...matchDateRange('returned_at', start, end) },
    ],
  };

  const [
    hub,
    macroComparison,
    todayStatusRows,
    allStatusRows,
    riderStatusRows,
    todayCodRows,
    allCodRows,
    activeCodRows,
    completedToday,
    failedToday,
    returnedToday,
    todayOrders,
    hourlyRows,
    weeklyRows,
    timingOrders,
    pendingKycMerchants,
    staleRiders,
    idleRiders,
    codLimitRiders,
    divergenceOrders,
  ] = await Promise.all([
    singleHubId ? Hub.findById(singleHubId).select('name code city state') : Promise.resolve(null),
    ['hub_manager', 'ops_coordinator', 'coo', 'regional_manager'].includes(actor?.role)
      ? getMacroHubComparison({ start, end, dailyTarget })
      : Promise.resolve([]),
    Order.aggregate([
      { $match: todayMatch },
      { $group: { _id: '$order_status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: orderScope },
      { $group: { _id: '$order_status', count: { $sum: 1 } } },
    ]),
    Rider.aggregate([
      { $match: riderScope },
      { $group: { _id: '$current_status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: todayMatch },
      { $group: { _id: null, total: { $sum: '$cod_amount' }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: orderScope },
      { $group: { _id: null, total: { $sum: '$cod_amount' }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { ...orderScope, order_status: { $in: ACTIVE_ORDER_STATUSES } } },
      { $group: { _id: null, total: { $sum: '$cod_amount' }, count: { $sum: 1 } } },
    ]),
    Order.countDocuments({ ...orderScope, order_status: 'delivered', ...matchDateRange('delivered_at', start, end) }),
    Order.countDocuments({ ...orderScope, order_status: 'failed', ...matchDateRange('failed_at', start, end) }),
    Order.countDocuments({ ...orderScope, order_status: 'returned', ...matchDateRange('returned_at', start, end) }),
    Order.find(todayActivityMatch)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(10)
      .populate('merchant_id', 'merchant_name shop_name email phone')
      .populate('rider_id', 'full_name email phone')
      .lean(),
    Order.aggregate([
      { $match: todayMatch },
      { $project: { hour: { $hour: '$createdAt' } } },
      { $group: { _id: '$hour', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: weeklyOutcomeMatch },
      {
        $project: {
          order_status: 1,
          outcome_at: {
            $cond: [
              { $eq: ['$order_status', 'delivered'] },
              '$delivered_at',
              '$failed_at',
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$outcome_at' } },
            status: '$order_status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]),
    Order.find(todayOutcomeMatch).select('createdAt assigned_at accepted_at picked_up_at delivered_at failed_at returned_at order_status cod_amount').lean(),
    Merchant.find({
      ...merchantScope,
      kyc_status: { $in: ['pending_review', 'pending'] },
    }).sort({ 'kyc_submission.submitted_at': 1, updatedAt: 1 }).limit(3).lean(),
    Rider.find({
      ...riderScope,
      current_status: { $in: ONLINE_RIDER_STATUSES },
      $or: [
        { last_location_update: null },
        { last_location_update: { $lt: staleCutoff } },
      ],
    }).sort({ last_location_update: 1 }).limit(3).lean(),
    Rider.find({
      ...riderScope,
      current_status: 'available',
      $or: [
        { last_location_update: null },
        { last_location_update: { $lt: staleCutoff } },
      ],
    }).sort({ last_location_update: 1 }).limit(2).lean(),
    Rider.find({
      ...riderScope,
      current_cod: { $gte: DEFAULT_COD_ALERT_LIMIT },
    }).sort({ current_cod: -1 }).limit(3).lean(),
    Order.find({
      ...orderScope,
      order_status: { $in: ACTIVE_ORDER_STATUSES },
      tracker_divergence_alert: true,
    }).sort({ tracker_divergence_distance: -1 }).limit(3).lean(),
  ]);

  const todayStatuses = countByStatus(todayStatusRows);
  const allStatuses = countByStatus(allStatusRows);
  const riderStatuses = riderStatusRows.reduce((accumulator, row) => {
    accumulator[row._id] = row.count;
    return accumulator;
  }, {});

  const finalToday = completedToday + failedToday + returnedToday;
  const completedOrders = allStatuses.delivered;
  const pendingOrders = allStatuses.pending;
  const failedOrders = allStatuses.failed;
  const onlineRiders = ONLINE_RIDER_STATUSES.reduce((sum, status) => sum + (riderStatuses[status] || 0), 0);
  const codTotal = allCodRows[0]?.total || 0;
  const todayCodTotal = todayCodRows[0]?.total || 0;
  const codInField = activeCodRows[0]?.total || 0;
  const totalTodayOrders = Object.values(todayStatuses).reduce((sum, value) => sum + value, 0);
  const dailyTargetPercent = Math.min(100, Math.round((completedToday / dailyTarget) * 100));

  const pickupToDeliveryMinutes = average(timingOrders.map((order) => minutesBetween(order.picked_up_at, order.delivered_at)));
  const placementToDeliveryMinutes = average(timingOrders.map((order) => minutesBetween(order.createdAt, order.delivered_at)));
  const driverResponseMinutes = average(timingOrders.map((order) => minutesBetween(order.assigned_at, order.accepted_at)));
  const failedDeliveryRate = finalToday > 0 ? Math.round((failedToday / finalToday) * 1000) / 10 : 0;
  const scopeDescription = describeHubScope(actor, orderScope);
  const filteredMacroComparison = filterMacroComparisonForActor(macroComparison, actor, orderScope);

  return {
    scope: {
      ...scopeDescription,
      hub_id: scopeDescription.hub_id,
      hub_ids: scopeDescription.hub_ids,
      hub_name: hub
        ? hub.name
        : scopeDescription.level === 'regional'
          ? 'Assigned regional hubs'
          : scopeDescription.level === 'hub'
            ? 'Assigned hub'
            : 'All hubs',
      hub_code: hub ? hub.code : null,
      date: dateKey,
      day_start: start,
      day_end: end,
      generated_at: new Date(),
    },
    counts: {
      completed_orders: completedOrders,
      completed_today: completedToday,
      pending_orders: pendingOrders,
      failed_orders: failedOrders,
      failed_today: failedToday,
      returned_today: returnedToday,
      online_riders: onlineRiders,
      total_today_orders: totalTodayOrders,
      status_breakdown: {
        today: todayStatuses,
        all: allStatuses,
        riders: riderStatuses,
      },
    },
    cod: {
      total: codTotal,
      today_total: todayCodTotal,
      in_field_total: codInField,
      active_cod_orders: activeCodRows[0]?.count || 0,
    },
    daily_target: {
      target: dailyTarget,
      completed: completedToday,
      remaining: Math.max(dailyTarget - completedToday, 0),
      percent: dailyTargetPercent,
    },
    today_orders: buildTodayOrderList(todayOrders),
    macro_comparison: filteredMacroComparison,
    order_volume: buildOrderVolume(hourlyRows),
    weekly_deliveries: buildWeeklyDeliveries(weeklyRows, weekStart),
    staging: [
      { key: 'pending', label: 'Pending', count: allStatuses.pending, color: 'primary' },
      { key: 'picked_up', label: 'Picked Up', count: allStatuses.picked_up, color: 'warning' },
      { key: 'at_hub', label: 'At Hub', count: allStatuses.at_hub, color: 'chart-2' },
      { key: 'out_for_delivery', label: 'Out', count: allStatuses.out_for_delivery, color: 'success' },
    ],
    alerts: buildAlerts({ pendingKycMerchants, staleRiders, divergenceOrders, codLimitRiders, idleRiders }),
    performance: {
      avg_pickup_to_delivery_minutes: pickupToDeliveryMinutes,
      avg_placement_to_delivery_minutes: placementToDeliveryMinutes,
      avg_driver_response_minutes: driverResponseMinutes,
      failed_delivery_rate: failedDeliveryRate,
      cod_in_field_total: codInField,
    },
  };
};

module.exports = {
  getAdminDashboardData,
};
