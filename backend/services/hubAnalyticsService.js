const mongoose = require('mongoose');

const Order = require('../models/Order');
const Merchant = require('../models/Merchant');
const User = require('../models/User');
const Hub = require('../models/Hub');
const Rider = require('../models/Rider');
const MerchantTransaction = require('../models/MerchantTransaction');
const AppError = require('../utils/AppError');
const { buildHubScopedMatch } = require('../utils/hubAccess');

/**
 * Hub Analytics Service
 * MongoDB aggregation-based analytics for multi-hub architecture
 */

const HUB_ADMIN_ROLES = ['super_admin', 'director', 'general_manager', 'hub_manager'];
const DISPATCH_ROLES = ['super_admin', 'director', 'general_manager', 'coo', 'regional_manager', 'hub_manager', 'ops_coordinator'];
const ACTIVE_ORDER_STATUSES = ['pending', 'picked_up', 'at_hub', 'out_for_delivery'];
const ONLINE_RIDER_STATUSES = ['available', 'on_delivery'];

const asCount = (value) => Number(value || 0);

const indexRowsByHub = (rows = []) => rows.reduce((accumulator, row) => {
  if (row?._id) {
    accumulator[String(row._id)] = row;
  }
  return accumulator;
}, {});

const resolveMacroTarget = (dailyTarget) => {
  const target = Number(dailyTarget || process.env.DAILY_ORDER_TARGET || 150);
  return Number.isFinite(target) && target > 0 ? Math.round(target) : 150;
};

/**
 * Build match stage for hub filtering
 */
const buildHubMatch = (user, hubId = null) => {
  // If no user, no access
  if (!user) {
    return { _id: null };
  }

  return buildHubScopedMatch(user, { hub_id: hubId }, {
    actionName: 'Hub analytics',
  });
};

/**
 * Get hub delivery statistics
 */
const getHubDeliveryStats = async (user, hubId = null, dateRange = {}) => {
  const match = buildHubMatch(user, hubId);
  
  // Add date filtering if provided
  if (dateRange.from || dateRange.to) {
    match.createdAt = {};
    if (dateRange.from) match.createdAt.$gte = new Date(dateRange.from);
    if (dateRange.to) match.createdAt.$lte = new Date(dateRange.to);
  }
  
  const stats = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$order_status',
        count: { $sum: 1 },
        total_value: { $sum: '$declared_value' },
        total_delivery_fee: { $sum: '$delivery_fee' },
        total_cod: { $sum: '$cod_amount' },
      },
    },
    {
      $group: {
        _id: null,
        status_breakdown: {
          $push: {
            status: '$_id',
            count: '$count',
            total_value: '$total_value',
          },
        },
        total_orders: { $sum: '$count' },
        total_value: { $sum: '$total_value' },
        total_delivery_fee: { $sum: '$total_delivery_fee' },
        total_cod: { $sum: '$total_cod' },
      },
    },
  ]);
  
  return stats[0] || {
    total_orders: 0,
    total_value: 0,
    total_delivery_fee: 0,
    total_cod: 0,
    status_breakdown: [],
  };
};

/**
 * Get hub performance metrics
 */
const getHubPerformanceMetrics = async (user, hubId = null, period = 30) => {
  const match = buildHubMatch(user, hubId);
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  match.createdAt = { $gte: startDate };
  
  const metrics = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          status: '$order_status',
        },
        count: { $sum: 1 },
        revenue: { $sum: '$delivery_fee' },
        cod: { $sum: '$cod_amount' },
      },
    },
    { $sort: { '_id.date': 1 } },
    {
      $group: {
        _id: '$_id.date',
        orders: { $sum: '$count' },
        revenue: { $sum: '$revenue' },
        cod: { $sum: '$cod' },
        daily_stats: {
          $push: {
            status: '$_id.status',
            count: '$count',
          },
        },
      },
    },
    { $sort: { _id: 1 } },
    {
      $group: {
        _id: null,
        period,
        total_days: { $sum: 1 },
        total_orders: { $sum: '$orders' },
        total_revenue: { $sum: '$revenue' },
        total_cod: { $sum: '$cod' },
        daily_data: { $push: '$$ROOT' },
      },
    },
  ]);
  
  const result = metrics[0] || {
    period,
    total_days: 0,
    total_orders: 0,
    total_revenue: 0,
    total_cod: 0,
    daily_data: [],
  };
  
  // Calculate averages
  if (result.total_days > 0) {
    result.avg_orders_per_day = Math.round((result.total_orders / result.total_days) * 10) / 10;
    result.avg_revenue_per_day = Math.round((result.total_revenue / result.total_days) * 100) / 100;
    result.avg_cod_per_day = Math.round((result.total_cod / result.total_days) * 100) / 100;
  }
  
  return result;
};

/**
 * Get hub rider statistics
 */
const getHubRiderStats = async (user, hubId = null) => {
  const match = buildHubMatch(user, hubId);
  const hubObjectId = match.hub_id;
  
  // Get all riders for hub
  const riders = await User.aggregate([
    {
      $match: {
        role: 'rider',
        hub_id: hubObjectId,
        is_active: true,
      },
    },
    {
      $lookup: {
        from: 'orders',
        let: { riderId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$rider_id', '$$riderId'] } } },
          { $match: { order_status: { $in: ['delivered', 'failed', 'returned'] } } },
        ],
        as: 'completed_orders',
      },
    },
    {
      $lookup: {
        from: 'orders',
        let: { riderId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$rider_id', '$$riderId'] } } },
          { $match: { order_status: { $in: ['picked_up', 'at_hub', 'out_for_delivery'] } } },
        ],
        as: 'active_orders',
      },
    },
    {
      $project: {
        full_name: 1,
        phone: 1,
        is_active: 1,
        createdAt: 1,
        total_completed: { $size: '$completed_orders' },
        active_deliveries: { $size: '$active_orders' },
      },
    },
    { $sort: { total_completed: -1 } },
  ]);
  
  // Summary stats
  const summary = {
    total_riders: riders.length,
    active_riders: riders.filter((r) => r.is_active).length,
    total_completed: riders.reduce((sum, r) => sum + r.total_completed, 0),
    total_active: riders.reduce((sum, r) => sum + r.active_deliveries, 0),
  };
  
  return { summary, riders };
};

/**
 * Get hub merchant statistics
 */
const getHubMerchantStats = async (user, hubId = null) => {
  const match = buildHubMatch(user, hubId);
  const hubObjectId = match.hub_id;
  
  // Get merchants with order stats
  const merchants = await Merchant.aggregate([
    { $match: { hub_id: hubObjectId, status: 'active' } },
    {
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'merchant_id',
        as: 'orders',
      },
    },
    { $unwind: '$orders' },
    {
      $group: {
        _id: '$_id',
        merchant_name: { $first: '$merchant_name' },
        shop_name: { $first: '$shop_name' },
        phone: { $first: '$phone' },
        total_orders: { $sum: 1 },
        total_delivered: {
          $sum: { $cond: [{ $eq: ['$orders.order_status', 'delivered'] }, 1, 0] },
        },
        total_failed: {
          $sum: { $cond: [{ $eq: ['$orders.order_status', 'failed'] }, 1, 0] },
        },
        total_returned: {
          $sum: { $cond: [{ $eq: ['$orders.order_status', 'returned'] }, 1, 0] },
        },
        cod_balance: { $first: '$cod_balance' },
        earnings: { $first: '$earnings' },
      },
    },
    { $sort: { total_orders: -1 } },
  ]);
  
  const summary = {
    total_merchants: merchants.length,
    total_orders: merchants.reduce((sum, m) => sum + m.total_orders, 0),
    total_delivered: merchants.reduce((sum, m) => sum + m.total_delivered, 0),
  };
  
  return { summary, merchants };
};

/**
 * Get hub revenue breakdown
 */
const getHubRevenueBreakdown = async (user, hubId = null) => {
  const match = buildHubMatch(user, hubId);
  
  const revenue = await Order.aggregate([
    { $match: { ...match, order_status: 'delivered' } },
    {
      $group: {
        _id: null,
        delivery_revenue: { $sum: '$delivery_fee' },
        cod_collected: { $sum: '$cod_amount' },
      },
    },
  ]);
  
  // Get merchant transactions
  const transactions = await MerchantTransaction.aggregate([
    {
      $match: { hub_id: match.hub_id },
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  
  const breakdown = {
    delivery_revenue: revenue[0]?.delivery_revenue || 0,
    cod_collected: revenue[0]?.cod_collected || 0,
    transactions: transactions.reduce((acc, t) => {
      acc[t._id] = { total: t.total, count: t.count };
      return acc;
    }, {}),
  };
  
  return breakdown;
};

/**
 * Get zone performance for hub
 */
const getHubZonePerformance = async (user, hubId = null) => {
  const match = buildHubMatch(user, hubId);
  
  const zones = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$delivery_zone',
        total_orders: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$order_status', 'failed'] }, 1, 0] },
        },
        returned: {
          $sum: { $cond: [{ $eq: ['$order_status', 'returned'] }, 1, 0] },
        },
        active: {
          $sum: { $cond: [{ $in: ['$order_status', ['pending', 'picked_up', 'at_hub', 'out_for_delivery']] }, 1, 0] },
        },
        revenue: { $sum: '$delivery_fee' },
      },
    },
    {
      $addFields: {
        success_rate: {
          $cond: [
            { $gt: ['$total_orders', 0] },
            { $multiply: [{ $divide: ['$delivered', '$total_orders'] }, 100] },
            0,
          ],
        },
      },
    },
    { $sort: { total_orders: -1 } },
  ]);
  
  return zones;
};

/**
 * Get dashboard summary for HQ
 */
const getHQDashboardSummary = async () => {
  const [
    totalHubs,
    totalOrders,
    orderStats,
    riderStats,
    merchantStats,
  ] = await Promise.all([
    // Total active hubs
    Hub.countDocuments({ is_active: true }),
    
    // Total orders
    Order.countDocuments(),
    
    // Order status breakdown
    Order.aggregate([
      { $group: { _id: '$order_status', count: { $sum: 1 } } },
    ]),
    
    // Rider stats
    User.aggregate([
      { $match: { role: 'rider', is_active: true } },
      { $count: 'total' },
    ]),
    
    // Merchant stats
    Merchant.aggregate([
      { $match: { status: 'active' } },
      { $count: 'total' },
    ]),
  ]);
  
  const statusBreakdown = orderStats.reduce((acc, s) => {
    acc[s._id] = s.count;
    return acc;
  }, {});
  
  return {
    total_hubs: totalHubs,
    total_orders: totalOrders,
    status_breakdown: statusBreakdown,
    active_riders: riderStats[0]?.total || 0,
    active_merchants: merchantStats[0]?.total || 0,
  };
};

/**
 * Get comparison data across hubs
 */
const getMultiHubComparison = async () => {
  const comparison = await Order.aggregate([
    {
      $group: {
        _id: '$hub_id',
        total_orders: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$order_status', 'failed'] }, 1, 0] },
        },
        revenue: { $sum: '$delivery_fee' },
        cod: { $sum: '$cod_amount' },
      },
    },
    {
      $lookup: {
        from: 'hubs',
        localField: '_id',
        foreignField: '_id',
        as: 'hub',
      },
    },
    { $unwind: { path: '$hub', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        hub_name: { $ifNull: ['$hub.name', 'Unknown'] },
        hub_code: { $ifNull: ['$hub.code', 'N/A'] },
        total_orders: 1,
        delivered: 1,
        failed: 1,
        revenue: 1,
        cod: 1,
      },
    },
    { $sort: { total_orders: -1 } },
  ]);
  
  return comparison;
};

/**
 * Safe cross-hub macro comparison for hub managers.
 * Exposes only hub identity labels and target-hit percentages so the admin
 * home view can render comparative graphs without leaking branch operations.
 */
const getMacroHubComparison = async ({ start, end, dailyTarget } = {}) => {
  const target = resolveMacroTarget(dailyTarget);
  const todayStart = start || new Date(new Date().setHours(0, 0, 0, 0));
  const todayEnd = end || new Date(new Date(todayStart).setDate(todayStart.getDate() + 1));

  const [
    hubs,
    orderRows,
  ] = await Promise.all([
    Hub.find({}).sort({ name: 1 }).select('name code').lean(),
    Order.aggregate([
      {
        $match: {
          $or: [
            { createdAt: { $gte: todayStart, $lt: todayEnd } },
            { delivered_at: { $gte: todayStart, $lt: todayEnd } },
            { failed_at: { $gte: todayStart, $lt: todayEnd } },
          ],
        },
      },
      {
        $group: {
          _id: '$hub_id',
          total_orders: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$createdAt', todayStart] }, { $lt: ['$createdAt', todayEnd] }] },
                1,
                0,
              ],
            },
          },
          delivered: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$order_status', 'delivered'] },
                    { $gte: ['$delivered_at', todayStart] },
                    { $lt: ['$delivered_at', todayEnd] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          failed: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$order_status', 'failed'] },
                    { $gte: ['$failed_at', todayStart] },
                    { $lt: ['$failed_at', todayEnd] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          active: { $sum: { $cond: [{ $in: ['$order_status', ACTIVE_ORDER_STATUSES] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const ordersByHub = indexRowsByHub(orderRows);

  return hubs.map((hub) => {
    const hubKey = String(hub._id);
    const row = ordersByHub[hubKey] || {};

    const totalOrders = asCount(row.total_orders);
    const delivered = asCount(row.delivered);
    const failed = asCount(row.failed);
    const active = asCount(row.active);
    const targetHitPercentage = target > 0 ? Math.min(100, Math.round((delivered / target) * 1000) / 10) : 0;

    return {
      hub_id: String(hub._id),
      hub_name: hub.name || 'Unknown hub',
      hub_code: hub.code || 'N/A',
      target_hit_percentage: targetHitPercentage,
      high_level_totals: {
        total_orders: totalOrders,
        delivered,
        failed,
        active,
        target,
      },
      graph_ready: [
        { metric: 'Target hit %', value: targetHitPercentage },
        { metric: 'Orders today', value: totalOrders },
        { metric: 'Delivered today', value: delivered },
        { metric: 'Failed today', value: failed },
      ],
    };
  }).sort((left, right) => right.target_hit_percentage - left.target_hit_percentage);
};

/**
 * Get time-series analytics
 */
const getTimeSeriesAnalytics = async (user, hubId = null, startDate, endDate, granularity = 'day') => {
  const match = buildHubMatch(user, hubId);
  
  // Build date format based on granularity
  let dateFormat;
  switch (granularity) {
    case 'hour':
      dateFormat = '%Y-%m-%d %H:00';
      break;
    case 'week':
      dateFormat = '%Y-W%V';
      break;
    case 'month':
      dateFormat = '%Y-%m';
      break;
    default:
      dateFormat = '%Y-%m-%d';
  }
  
  match.createdAt = {};
  if (startDate) match.createdAt.$gte = new Date(startDate);
  if (endDate) match.createdAt.$lte = new Date(endDate);
  
  const timeSeries = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
        orders: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ['$order_status', 'delivered'] }, 1, 0] },
        },
        revenue: { $sum: '$delivery_fee' },
        cod: { $sum: '$cod_amount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  
  return timeSeries;
};

/**
 * Get order funnel analytics
 */
const getOrderFunnel = async (user, hubId = null) => {
  const match = buildHubMatch(user, hubId);
  
  const funnel = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$order_status',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
  
  // Calculate conversion rates
  const total = funnel.reduce((sum, f) => sum + f.count, 0);
  let previousCount = total;
  
  const funnelWithRates = funnel.map((stage) => {
    const rate = previousCount > 0 ? Math.round((stage.count / previousCount) * 100) / 100 : 0;
    previousCount = stage.count;
    return { ...stage, conversion_rate: rate };
  });
  
  return {
    total,
    stages: funnelWithRates,
  };
};

module.exports = {
  buildHubMatch,
  getHubDeliveryStats,
  getHubPerformanceMetrics,
  getHubRiderStats,
  getHubMerchantStats,
  getHubRevenueBreakdown,
  getHubZonePerformance,
  getHQDashboardSummary,
  getMultiHubComparison,
  getMacroHubComparison,
  getTimeSeriesAnalytics,
  getOrderFunnel,
};
