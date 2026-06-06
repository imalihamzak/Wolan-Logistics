const Hub = require('../models/Hub');
const Merchant = require('../models/Merchant');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const RiderSettlement = require('../models/RiderSettlement');
const AppError = require('../utils/AppError');
const { buildSupportConfig } = require('./supportConfigService');
const {
  ADMIN_ROLES,
  buildHubScopedMatch,
  describeHubScope,
  getAssignedHubIds,
  getDashboardLevelForRole,
} = require('../utils/hubAccess');

const ORDER_STATUSES = ['pending', 'picked_up', 'at_hub', 'out_for_delivery', 'delivered', 'failed', 'returned'];
const ACTIVE_ORDER_STATUSES = ['pending', 'picked_up', 'at_hub', 'out_for_delivery'];
const ONLINE_RIDER_STATUSES = ['available', 'on_delivery'];
const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const parseDate = (value, fieldName) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${fieldName} is invalid`, 400);
  }

  return date;
};

const getQuarterStart = (date) => {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth, 1);
};

const resolveReportRange = (query = {}) => {
  if (query.from || query.to) {
    const from = query.from ? startOfDay(parseDate(query.from, 'from')) : startOfDay(new Date());
    const toDate = query.to ? startOfDay(parseDate(query.to, 'to')) : startOfDay(new Date());
    const to = addDays(toDate, 1);

    if (from >= to) {
      throw new AppError('from must be before to', 400);
    }

    return {
      key: 'custom',
      label: 'Custom range',
      start: from,
      end: to,
    };
  }

  const now = new Date();
  const today = startOfDay(now);
  const period = String(query.period || 'month').toLowerCase();

  if (period === 'today') {
    return { key: 'today', label: 'Today', start: today, end: addDays(today, 1) };
  }

  if (period === 'week') {
    return { key: 'week', label: 'This week', start: addDays(today, -6), end: addDays(today, 1) };
  }

  if (period === 'quarter') {
    return { key: 'quarter', label: 'This quarter', start: getQuarterStart(now), end: addDays(today, 1) };
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { key: 'month', label: 'This month', start: monthStart, end: addDays(today, 1) };
};

const buildScopedMatch = (actor = {}, query = {}) => {
  if (!actor || !ADMIN_ROLES.includes(actor.role)) {
    throw new AppError('Reports require admin access', 403);
  }

  return buildHubScopedMatch(actor, query, {
    actionName: 'Reports',
  });
};

const buildRiderScope = (scope) => (scope.hub_id ? { hub_id: scope.hub_id } : {});
const readSingleHubId = (scope = {}) => {
  if (!scope.hub_id || scope.hub_id.$in) return null;
  return scope.hub_id;
};
const getScopeHubIds = (scope = {}, actor = {}) => {
  if (scope.hub_id?.$in) return scope.hub_id.$in.map(String);
  if (scope.hub_id) return [String(scope.hub_id)];
  return getAssignedHubIds(actor);
};
const withCreatedRange = (scope, range) => ({
  ...scope,
  createdAt: { $gte: range.start, $lt: range.end },
});

const asNumber = (value) => Number(value || 0);
const round = (value, digits = 0) => {
  const multiplier = 10 ** digits;
  return Math.round(asNumber(value) * multiplier) / multiplier;
};

const countByStatus = (rows) => ORDER_STATUSES.reduce((accumulator, status) => {
  accumulator[status] = rows.find((row) => row._id === status)?.count || 0;
  return accumulator;
}, {});

const dateKey = (date, granularity) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  if (granularity === 'month') {
    return `${year}-${month}`;
  }
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const resolveGranularity = (range) => {
  const days = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86400000));
  return days > 62 ? 'month' : 'day';
};

const getRangeDays = (range) => Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86400000));

const resolveDailyTarget = (query = {}) => {
  const target = Number(query.daily_target || process.env.DAILY_ORDER_TARGET || 150);
  return Number.isFinite(target) && target > 0 ? Math.round(target) : 150;
};

const buildTrendBuckets = (rows, range) => {
  const granularity = resolveGranularity(range);
  const indexedRows = rows.reduce((accumulator, row) => {
    accumulator[row._id] = row;
    return accumulator;
  }, {});
  const buckets = [];
  let cursor = new Date(range.start);

  while (cursor < range.end) {
    const key = dateKey(cursor, granularity);
    const row = indexedRows[key] || {};
    buckets.push({
      date: key,
      orders: row.orders || 0,
      delivered: row.delivered || 0,
      failed: row.failed || 0,
      revenue: row.revenue || 0,
      cod: row.cod || 0,
    });
    cursor = granularity === 'month' ? addMonths(cursor, 1) : addDays(cursor, 1);
  }

  return buckets;
};

const minutesBetween = (start, end) => {
  if (!start || !end) return null;
  const duration = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
};

const average = (values) => {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) return 0;
  return round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length, 1);
};

const resolveId = (value) => String(value?._id || value?.id || value || '');

const buildDriverRows = (riders, riderOrderRows) => {
  const orderStatsByUserId = riderOrderRows.reduce((accumulator, row) => {
    accumulator[String(row._id)] = row;
    return accumulator;
  }, {});

  return riders.map((rider) => {
    const userId = resolveId(rider.user_id);
    const stats = orderStatsByUserId[userId] || {};
    const total = stats.deliveries || 0;
    const delivered = stats.delivered || 0;
    const failed = stats.failed || 0;
    const returned = stats.returned || 0;
    const completed = delivered + failed + returned;
    const successRate = completed > 0 ? round((delivered / completed) * 100, 1) : 0;

    return {
      id: String(rider._id),
      user_id: userId,
      full_name: rider.full_name,
      phone: rider.phone,
      vehicle_type: rider.vehicle_type,
      bike_plate: rider.bike_plate,
      current_status: rider.current_status,
      hub: rider.hub_id && typeof rider.hub_id === 'object' ? {
        id: resolveId(rider.hub_id),
        name: rider.hub_id.name,
        code: rider.hub_id.code,
      } : null,
      period_deliveries: total,
      period_delivered: delivered,
      period_failed: failed,
      period_returned: returned,
      success_rate: successRate,
      rating: rider.rating || 0,
      total_ratings: rider.total_ratings || 0,
      current_cod: rider.current_cod || 0,
      pending_payout: rider.pending_payout || 0,
      is_active: rider.is_active,
      kyc_status: rider.kyc_status,
      last_location_update: rider.last_location_update,
    };
  }).sort((left, right) => right.period_deliveries - left.period_deliveries);
};

const buildSettlementRows = (settlements) => settlements.map((settlement) => ({
  id: String(settlement._id),
  reference: settlement.reference,
  type: settlement.type,
  status: settlement.status,
  amount: settlement.amount || 0,
  payout_amount: settlement.payout_amount || 0,
  cod_amount: settlement.cod_amount || 0,
  method: settlement.method,
  rider: settlement.rider_id && typeof settlement.rider_id === 'object'
    ? {
      id: resolveId(settlement.rider_id),
      full_name: settlement.rider_id.full_name,
      phone: settlement.rider_id.phone,
    }
    : null,
  hub: settlement.hub_id && typeof settlement.hub_id === 'object'
    ? {
      id: resolveId(settlement.hub_id),
      name: settlement.hub_id.name,
      code: settlement.hub_id.code,
    }
    : null,
  createdAt: settlement.createdAt,
  completed_at: settlement.completed_at,
  status_history: settlement.status_history || [],
}));

const getCrossHubComparison = async ({ actor, range, query }) => {
  if (!['super_admin', 'director', 'general_manager', 'hub_manager', 'coo', 'regional_manager'].includes(actor.role)) {
    return [];
  }

  const target = resolveDailyTarget(query) * getRangeDays(range);
  const [hubs, rows] = await Promise.all([
    Hub.find({}).sort({ name: 1 }).select('name code').lean(),
    Order.aggregate([
      { $match: { createdAt: { $gte: range.start, $lt: range.end } } },
      {
        $group: {
          _id: '$hub_id',
          total_orders: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$order_status', 'failed'] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, '$delivery_fee', 0] } },
          cod: { $sum: '$cod_amount' },
        },
      },
    ]),
  ]);

  const indexedRows = rows.reduce((accumulator, row) => {
    accumulator[String(row._id)] = row;
    return accumulator;
  }, {});

  const allowedHubIds = getDashboardLevelForRole(actor.role) === 'regional'
    ? getScopeHubIds(buildScopedMatch(actor, query), actor)
    : [];
  return hubs
    .filter((hub) => allowedHubIds.length === 0 || allowedHubIds.includes(String(hub._id)))
    .map((hub) => {
    const row = indexedRows[String(hub._id)] || {};
    const delivered = asNumber(row.delivered);
    const targetHitPercentage = target > 0 ? round(Math.min(100, (delivered / target) * 100), 1) : 0;
    const macro = {
      hub_name: hub.name || 'Unknown hub',
      hub_code: hub.code || 'N/A',
      target_hit_percentage: targetHitPercentage,
      high_level_totals: {
        orders: asNumber(row.total_orders),
        delivered,
        failed: asNumber(row.failed),
      },
      graph_ready: [
        { metric: 'Target hit %', value: targetHitPercentage },
        { metric: 'Orders', value: asNumber(row.total_orders) },
      ],
    };

    if (actor.role === 'hub_manager') {
      return macro;
    }

    return {
      ...macro,
      revenue: asNumber(row.revenue),
      cod: asNumber(row.cod),
    };
    }).sort((left, right) => right.target_hit_percentage - left.target_hit_percentage);
};

const getReportData = async ({ actor, query = {} }) => {
  const range = resolveReportRange(query);
  const scope = buildScopedMatch(actor, query);
  const singleHubId = readSingleHubId(scope);
  const periodMatch = withCreatedRange(scope, range);
  const riderScope = buildRiderScope(scope);
  const settlementScope = withCreatedRange(riderScope, range);
  const dateFormat = resolveGranularity(range) === 'month' ? '%Y-%m' : '%Y-%m-%d';

  const [
    hub,
    statusRows,
    summaryRows,
    activeCodRows,
    riderStatusRows,
    trendRows,
    zoneRows,
    timingOrders,
    riders,
    riderOrderRows,
    merchantCount,
    customerRows,
    settlementTotals,
    recentSettlements,
    crossHubComparison,
  ] = await Promise.all([
    singleHubId ? Hub.findById(singleHubId).select('name code city state').lean() : Promise.resolve(null),
    Order.aggregate([
      { $match: periodMatch },
      { $group: { _id: '$order_status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: periodMatch },
      {
        $group: {
          _id: null,
          total_orders: { $sum: 1 },
          delivery_fee_total: { $sum: '$delivery_fee' },
          revenue: {
            $sum: {
              $cond: [{ $eq: ['$order_status', 'delivered'] }, '$delivery_fee', 0],
            },
          },
          cod_total: { $sum: '$cod_amount' },
          declared_value_total: { $sum: '$declared_value' },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...scope, order_status: { $in: ACTIVE_ORDER_STATUSES } } },
      { $group: { _id: null, total: { $sum: '$cod_amount' }, count: { $sum: 1 } } },
    ]),
    Rider.aggregate([
      { $match: { ...riderScope, is_active: true } },
      { $group: { _id: '$current_status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: periodMatch },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          orders: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$order_status', 'failed'] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, '$delivery_fee', 0] } },
          cod: { $sum: '$cod_amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: periodMatch },
      {
        $group: {
          _id: { $ifNull: ['$delivery_zone', 'Unknown'] },
          total_orders: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$order_status', 'failed'] }, 1, 0] } },
          returned: { $sum: { $cond: [{ $eq: ['$order_status', 'returned'] }, 1, 0] } },
          active: { $sum: { $cond: [{ $in: ['$order_status', ACTIVE_ORDER_STATUSES] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, '$delivery_fee', 0] } },
          cod: { $sum: '$cod_amount' },
        },
      },
      { $sort: { total_orders: -1 } },
    ]),
    Order.find({
      ...scope,
      order_status: 'delivered',
      delivered_at: { $gte: range.start, $lt: range.end },
    }).select('createdAt picked_up_at delivered_at assigned_at accepted_at').lean(),
    Rider.find(riderScope)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('hub_id', 'name code city')
      .select('user_id full_name phone vehicle_type bike_plate current_status current_cod pending_payout rating total_ratings hub_id is_active kyc_status last_location_update')
      .lean(),
    Order.aggregate([
      { $match: { ...periodMatch, rider_id: { $ne: null } } },
      {
        $group: {
          _id: '$rider_id',
          deliveries: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$order_status', 'failed'] }, 1, 0] } },
          returned: { $sum: { $cond: [{ $eq: ['$order_status', 'returned'] }, 1, 0] } },
          cod: { $sum: '$cod_amount' },
          revenue: { $sum: '$delivery_fee' },
        },
      },
    ]),
    Merchant.countDocuments(riderScope.hub_id ? { hub_id: riderScope.hub_id } : {}),
    Order.aggregate([
      { $match: periodMatch },
      {
        $group: {
          _id: '$customer_phone',
          customer_name: { $last: '$customer_name' },
          orders: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$order_status', 'failed'] }, 1, 0] } },
          last_order_at: { $max: '$createdAt' },
        },
      },
    ]),
    RiderSettlement.aggregate([
      { $match: settlementScope },
      {
        $group: {
          _id: { type: '$type', status: '$status' },
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
          payout_amount: { $sum: '$payout_amount' },
          cod_amount: { $sum: '$cod_amount' },
        },
      },
    ]),
    RiderSettlement.find(settlementScope)
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('rider_id', 'full_name phone')
      .populate('hub_id', 'name code city')
      .lean(),
    getCrossHubComparison({ actor, range, query }),
  ]);

  const statuses = countByStatus(statusRows);
  const summary = summaryRows[0] || {};
  const riderStatuses = riderStatusRows.reduce((accumulator, row) => {
    accumulator[row._id] = row.count;
    return accumulator;
  }, {});
  const finalOrders = statuses.delivered + statuses.failed + statuses.returned;
  const onlineRiders = ONLINE_RIDER_STATUSES.reduce((sum, status) => sum + (riderStatuses[status] || 0), 0);
  const avgPickupToDelivery = average(timingOrders.map((order) => minutesBetween(order.picked_up_at, order.delivered_at)));
  const avgPlacementToDelivery = average(timingOrders.map((order) => minutesBetween(order.createdAt, order.delivered_at)));
  const avgDriverResponse = average(timingOrders.map((order) => minutesBetween(order.assigned_at, order.accepted_at)));
  const driverRows = buildDriverRows(riders, riderOrderRows);
  const avgRating = average(driverRows.map((driver) => Number(driver.rating || 0)).filter((rating) => rating > 0));
  const repeatCustomers = customerRows.filter((row) => row.orders > 1).length;
  const totalCustomerOrders = customerRows.reduce((sum, row) => sum + row.orders, 0);

  const settlementByStatus = settlementTotals.reduce((accumulator, row) => {
    const key = `${row._id.type}:${row._id.status}`;
    accumulator[key] = row;
    return accumulator;
  }, {});
  const completedCodSettlements = Object.values(settlementByStatus)
    .filter((row) => row._id.type === 'cod_settlement' && row._id.status === 'completed')
    .reduce((sum, row) => sum + asNumber(row.cod_amount), 0);
  const completedPayouts = Object.values(settlementByStatus)
    .filter((row) => row._id.type === 'withdrawal' && row._id.status === 'completed')
    .reduce((sum, row) => sum + asNumber(row.payout_amount), 0);
  const pendingWithdrawals = Object.values(settlementByStatus)
    .filter((row) => row._id.type === 'withdrawal' && ['requested', 'approved'].includes(row._id.status))
    .reduce((sum, row) => sum + asNumber(row.payout_amount), 0);
  const supportConfig = buildSupportConfig();
  const scopeDescription = describeHubScope(actor, scope);

  return {
    scope: {
      ...scopeDescription,
      hub_id: scopeDescription.hub_id,
      hub_ids: scopeDescription.hub_ids,
      hub_name: hub?.name || (scopeDescription.level === 'regional' ? 'Assigned regional hubs' : 'All hubs'),
      hub_code: hub?.code || null,
      generated_at: new Date(),
    },
    period: {
      key: range.key,
      label: range.label,
      start: range.start,
      end: range.end,
      granularity: resolveGranularity(range),
    },
    overview: {
      total_orders: summary.total_orders || 0,
      completed_orders: statuses.delivered,
      pending_orders: statuses.pending,
      active_orders: ACTIVE_ORDER_STATUSES.reduce((sum, status) => sum + statuses[status], 0),
      failed_orders: statuses.failed,
      returned_orders: statuses.returned,
      status_breakdown: statuses,
      delivery_fee_total: summary.delivery_fee_total || 0,
      revenue: summary.revenue || 0,
      cod_total: summary.cod_total || 0,
      declared_value_total: summary.declared_value_total || 0,
      failed_rate: finalOrders > 0 ? round((statuses.failed / finalOrders) * 100, 1) : 0,
      avg_pickup_to_delivery_minutes: avgPickupToDelivery,
      avg_placement_to_delivery_minutes: avgPlacementToDelivery,
      avg_driver_response_minutes: avgDriverResponse,
      avg_rider_rating: avgRating,
      online_riders: onlineRiders,
      total_riders: driverRows.length,
      active_merchants: merchantCount,
    },
    trends: buildTrendBuckets(trendRows, range),
    zones: zoneRows.map((zone) => ({
      name: zone._id || 'Unknown',
      total_orders: zone.total_orders || 0,
      delivered: zone.delivered || 0,
      failed: zone.failed || 0,
      returned: zone.returned || 0,
      active: zone.active || 0,
      revenue: zone.revenue || 0,
      cod: zone.cod || 0,
      share_percentage: summary.total_orders > 0 ? round((zone.total_orders / summary.total_orders) * 100, 1) : 0,
      success_rate: zone.total_orders > 0 ? round((zone.delivered / zone.total_orders) * 100, 1) : 0,
    })),
    drivers: driverRows,
    cod: {
      total_order_cod: summary.cod_total || 0,
      in_field_total: activeCodRows[0]?.total || 0,
      active_cod_orders: activeCodRows[0]?.count || 0,
      completed_cod_settlements: completedCodSettlements,
      completed_payouts: completedPayouts,
      pending_withdrawals: pendingWithdrawals,
      settlement_summary: settlementTotals.map((row) => ({
        type: row._id.type,
        status: row._id.status,
        count: row.count,
        amount: row.amount,
        payout_amount: row.payout_amount,
        cod_amount: row.cod_amount,
      })),
      recent_settlements: buildSettlementRows(recentSettlements),
      riders_with_cod: driverRows
        .filter((driver) => driver.current_cod > 0 || driver.pending_payout > 0)
        .sort((left, right) => right.current_cod - left.current_cod)
        .slice(0, 20),
    },
    customers: {
      unique_customers: customerRows.length,
      repeat_customers: repeatCustomers,
      repeat_rate: customerRows.length > 0 ? round((repeatCustomers / customerRows.length) * 100, 1) : 0,
      avg_orders_per_customer: customerRows.length > 0 ? round(totalCustomerOrders / customerRows.length, 1) : 0,
      total_customer_orders: totalCustomerOrders,
      delivered_orders: customerRows.reduce((sum, row) => sum + row.delivered, 0),
      failed_orders: customerRows.reduce((sum, row) => sum + row.failed, 0),
      support_complaints_configured: true,
      support_complaints_note: `Support pipeline configured for testing. WhatsApp and voice support route to ${supportConfig.channels.whatsapp.display_number}; future provider changes are centralized through /api/v1/support/config and support provider webhooks.`,
    },
    cross_hub: {
      mode: actor.role === 'hub_manager'
        ? 'macro_only'
        : getDashboardLevelForRole(actor.role) === 'regional'
          ? 'assigned_hubs_macro'
          : getDashboardLevelForRole(actor.role) === 'hq'
            ? 'full_admin'
            : 'not_available',
      comparison: crossHubComparison,
    },
    data_sources: {
      orders: true,
      riders: true,
      settlements: true,
      merchants: true,
      customers_from_orders: true,
      customer_support_complaints: true,
    },
  };
};

module.exports = {
  getReportData,
};
