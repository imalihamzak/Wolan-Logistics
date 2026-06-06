const crypto = require('crypto');
const mongoose = require('mongoose');

const Rider = require('../models/Rider');
const RiderSettlement = require('../models/RiderSettlement');
const AppError = require('../utils/AppError');
const { emitToHub, emitToUser, emitToAdmin } = require('./realtimeService');
const { isRiderKycComplete } = require('../utils/accountSecurity');
const {
  RIDER_COD_OPERATION_LIMIT,
  RIDER_PAYOUT_RATE,
  RIDER_FLAT_DELIVERY_PAYOUT,
  ACTIVE_WITHDRAWAL_STATUSES,
  SETTLEMENT_METHODS,
  SETTLEMENT_STATUSES,
} = require('../constants/settlementConstants');
const {
  ADMIN_ROLES,
  isAdminRole,
  buildHubScopedMatch,
  assertHubAccess,
  canAccessAllHubs,
} = require('../utils/hubAccess');

const buildAuthContext = (actor = {}) => ({
  id: actor.id ? String(actor.id) : null,
  role: actor.role || 'system',
  hub_id: actor.hub_id ? String(actor.hub_id) : null,
  assigned_hub_ids: actor.assigned_hub_ids || [],
});

const resolveIdValue = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return String(value._id || value.id || value);
  }
  return String(value);
};

const normalizePagination = (query = {}) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const createSettlementReference = (prefix = 'SET') => (
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
);

const getRiderBalanceSnapshot = (rider) => {
  const currentCod = Number(rider?.current_cod || 0);
  const pendingPayout = Number(rider?.pending_payout || 0);
  const pendingFines = (rider?.fines || [])
    .filter((fine) => fine.status === 'pending')
    .reduce((sum, fine) => sum + Number(fine.amount || 0), 0);
  const availableWithdrawal = Math.max(0, pendingPayout - pendingFines);
  const overCodLimit = currentCod >= RIDER_COD_OPERATION_LIMIT;

  return {
    current_cod: currentCod,
    pending_payout: pendingPayout,
    pending_fines: pendingFines,
    available_withdrawal: availableWithdrawal,
    cod_operation_limit: RIDER_COD_OPERATION_LIMIT,
    over_cod_limit: overCodLimit,
    can_receive_assignments: !overCodLimit,
    can_request_withdrawal: availableWithdrawal > 0 && !overCodLimit,
    restriction_reason: overCodLimit
      ? `COD balance must be settled below ${RIDER_COD_OPERATION_LIMIT} UGX before new work or withdrawal.`
      : null,
  };
};

const calculateRiderPayoutForOrder = (order) => {
  const deliveryFee = Number(order?.delivery_fee || 0);
  if (deliveryFee > 0) {
    return Math.round(deliveryFee * RIDER_PAYOUT_RATE);
  }

  return RIDER_FLAT_DELIVERY_PAYOUT;
};

const assertRiderBelowCodLimit = (rider, actionName = 'Rider operation') => {
  if (!rider) {
    throw new AppError(`${actionName} requires an active rider profile`, 400);
  }

  const balance = getRiderBalanceSnapshot(rider);
  if (balance.over_cod_limit) {
    throw new AppError(`${actionName} is blocked until COD settlement is completed`, 403);
  }
};

const assertRiderWithinCodCapacity = (rider, nextCodAmount = 0, actionName = 'Rider operation') => {
  assertRiderBelowCodLimit(rider, actionName);

  const currentCod = Number(rider.current_cod || 0);
  const projectedCod = currentCod + Number(nextCodAmount || 0);
  if (!Number.isFinite(projectedCod)) {
    throw new AppError('COD amount is invalid', 400);
  }

  if (projectedCod >= RIDER_COD_OPERATION_LIMIT) {
    throw new AppError(`${actionName} is blocked because projected COD balance would reach or exceed ${RIDER_COD_OPERATION_LIMIT} UGX`, 403);
  }
};

const assertAdminCanUseRider = (rider, actor, actionName = 'Settlement operation') => {
  const context = buildAuthContext(actor);

  if (canAccessAllHubs(context)) {
    return;
  }

  if (!isAdminRole(context.role)) {
    throw new AppError(`${actionName} requires admin permission`, 403);
  }

  assertHubAccess(context, rider.hub_id, actionName);
};

const assertBalanceSnapshotAccess = (rider, actor) => {
  const context = buildAuthContext(actor);

  if (!rider) {
    return;
  }

  if (context.role === 'rider') {
    if (resolveIdValue(rider.user_id) !== context.id) {
      throw new AppError('Forbidden', 403);
    }
    return;
  }

  assertAdminCanUseRider(rider, actor, 'Settlement balance access');
};

const pushSettlementHistory = (settlement, status, note, actor, metadata = {}) => {
  const context = buildAuthContext(actor);
  settlement.status_history.push({
    status,
    note: note || null,
    actor_id: context.id ? new mongoose.Types.ObjectId(context.id) : null,
    actor_role: context.role,
    metadata,
    created_at: new Date(),
  });
};

const emitSettlementEvent = (eventName, settlement, rider = null) => {
  const payload = {
    settlement: typeof settlement.toPublicJSON === 'function' ? settlement.toPublicJSON() : settlement,
    rider: rider && typeof rider.toPublicJSON === 'function' ? rider.toPublicJSON() : rider,
    balance: rider ? getRiderBalanceSnapshot(rider) : null,
  };

  emitToAdmin(eventName, payload);
  emitToHub(resolveIdValue(settlement.hub_id || rider?.hub_id), eventName, payload);
  emitToUser(resolveIdValue(settlement.user_id || rider?.user_id), eventName, payload);
};

const assertRiderCanRequestWithdrawal = async (rider, amount) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Withdrawal amount must be a positive number', 400);
  }

  if (!rider.is_active || !isRiderKycComplete(rider)) {
    throw new AppError('Withdrawal is blocked until rider is active and KYC documents, stage chairman contact, and admin approval are complete', 403);
  }

  assertRiderBelowCodLimit(rider, 'Withdrawal request');

  const balance = getRiderBalanceSnapshot(rider);
  if (balance.available_withdrawal <= 0) {
    throw new AppError('No pending payout is available for withdrawal', 400);
  }

  if (amount > balance.available_withdrawal) {
    throw new AppError('Withdrawal amount cannot exceed available payout after fines', 400);
  }

  const activeRequest = await RiderSettlement.exists({
    rider_id: rider._id,
    type: 'withdrawal',
    status: { $in: ACTIVE_WITHDRAWAL_STATUSES },
  });

  if (activeRequest) {
    throw new AppError('A withdrawal request is already pending or approved for this rider', 409);
  }
};

const createWithdrawalRequest = async ({ rider, payload, actor }) => {
  const amount = Number(payload.amount);
  await assertRiderCanRequestWithdrawal(rider, amount);

  const method = payload.method || 'mobile_money';
  if (!SETTLEMENT_METHODS.includes(method)) {
    throw new AppError('Settlement method is invalid', 400);
  }

  const settlement = new RiderSettlement({
    reference: createSettlementReference('WDR'),
    rider_id: rider._id,
    user_id: resolveIdValue(rider.user_id),
    hub_id: resolveIdValue(rider.hub_id),
    type: 'withdrawal',
    status: 'requested',
    amount,
    payout_amount: amount,
    cod_amount: 0,
    method,
    account_name: payload.account_name || rider.full_name,
    account_phone: payload.account_phone || rider.phone,
    note: payload.note || null,
    requested_by: buildAuthContext(actor).id,
    requested_by_role: buildAuthContext(actor).role,
  });

  pushSettlementHistory(settlement, 'requested', payload.note || 'Withdrawal requested by rider', actor, {
    pending_payout_before: rider.pending_payout || 0,
    available_withdrawal_before: getRiderBalanceSnapshot(rider).available_withdrawal,
  });

  try {
    await settlement.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError('A withdrawal request is already pending or approved for this rider', 409);
    }
    throw error;
  }
  emitSettlementEvent('rider:settlement-requested', settlement, rider);

  return { settlement, rider, balance: getRiderBalanceSnapshot(rider) };
};

const buildSettlementMatch = ({ query, actor }) => {
  const context = buildAuthContext(actor);
  const match = {};

  if (context.role === 'rider') {
    match.user_id = new mongoose.Types.ObjectId(context.id);
  } else if (isAdminRole(context.role)) {
    Object.assign(match, buildHubScopedMatch(context, query, {
      actionName: 'Settlement history',
    }));
  } else {
    throw new AppError('Forbidden', 403);
  }

  if (query.rider_id) {
    match.rider_id = new mongoose.Types.ObjectId(query.rider_id);
  }
  if (query.status) {
    match.status = query.status;
  }
  if (query.type) {
    match.type = query.type;
  }

  return match;
};

const listSettlements = async ({ query, actor }) => {
  const { page, limit, skip } = normalizePagination(query);
  const match = buildSettlementMatch({ query, actor });

  const [items, total] = await Promise.all([
    RiderSettlement.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('rider_id', 'full_name phone bike_plate vehicle_type current_cod pending_payout hub_id')
      .populate('user_id', 'full_name phone email role')
      .populate('hub_id', 'name code city'),
    RiderSettlement.countDocuments(match),
  ]);

  let balance = null;
  const targetRiderId = query.rider_id || (buildAuthContext(actor).role === 'rider' ? null : undefined);
  if (targetRiderId) {
    const rider = await Rider.findById(targetRiderId);
    if (rider) {
      assertBalanceSnapshotAccess(rider, actor);
      balance = getRiderBalanceSnapshot(rider);
    }
  } else if (buildAuthContext(actor).role === 'rider') {
    const rider = await Rider.findOne({ user_id: buildAuthContext(actor).id });
    if (rider) {
      assertBalanceSnapshotAccess(rider, actor);
      balance = getRiderBalanceSnapshot(rider);
    }
  }

  return {
    items,
    balance,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const updateSettlementStatus = async ({ settlementId, payload, actor }) => {
  const settlement = await RiderSettlement.findById(settlementId);
  if (!settlement) {
    throw new AppError('Settlement request not found', 404);
  }

  const rider = await Rider.findById(settlement.rider_id);
  if (!rider) {
    throw new AppError('Rider profile not found for settlement', 404);
  }

  assertAdminCanUseRider(rider, actor, 'Settlement update');

  const nextStatus = payload.status;
  if (!SETTLEMENT_STATUSES.includes(nextStatus)) {
    throw new AppError('Settlement status is invalid', 400);
  }

  const context = buildAuthContext(actor);
  const now = new Date();

  if (nextStatus === 'approved') {
    if (settlement.status !== 'requested') {
      throw new AppError('Only requested withdrawals can be approved', 400);
    }

    if (settlement.type === 'withdrawal') {
      assertRiderBelowCodLimit(rider, 'Withdrawal approval');
    }

    if (settlement.type === 'withdrawal' && settlement.amount > getRiderBalanceSnapshot(rider).available_withdrawal) {
      throw new AppError('Withdrawal amount exceeds available payout after fines', 400);
    }

    settlement.status = 'approved';
    settlement.approved_by = context.id;
    settlement.approved_at = now;
    settlement.admin_note = payload.admin_note || settlement.admin_note;
    pushSettlementHistory(settlement, 'approved', payload.admin_note || 'Withdrawal approved by admin', actor);
  } else if (nextStatus === 'rejected') {
    if (!['requested', 'approved'].includes(settlement.status)) {
      throw new AppError('Only requested or approved withdrawals can be rejected', 400);
    }

    settlement.status = 'rejected';
    settlement.rejected_by = context.id;
    settlement.rejected_at = now;
    settlement.rejection_reason = payload.rejection_reason || payload.admin_note || 'Rejected by admin';
    settlement.admin_note = payload.admin_note || settlement.admin_note;
    pushSettlementHistory(settlement, 'rejected', settlement.rejection_reason, actor);
  } else if (nextStatus === 'completed') {
    if (settlement.status !== 'approved') {
      throw new AppError('Settlement must be approved before completion', 400);
    }

    if (settlement.type === 'withdrawal') {
      assertRiderBelowCodLimit(rider, 'Withdrawal completion');
      const pendingPayout = Number(rider.pending_payout || 0);
      if (pendingPayout < settlement.amount || settlement.amount > getRiderBalanceSnapshot(rider).available_withdrawal) {
        throw new AppError('Rider available payout is lower than the approved withdrawal amount', 400);
      }
      rider.pending_payout = Math.max(0, pendingPayout - settlement.amount);
    } else if (settlement.type === 'cod_settlement') {
      const currentCod = Number(rider.current_cod || 0);
      if (currentCod < settlement.cod_amount) {
        throw new AppError('Rider COD balance is lower than the settlement amount', 400);
      }
      rider.current_cod = Math.max(0, currentCod - settlement.cod_amount);
    }

    settlement.status = 'completed';
    settlement.completed_by = context.id;
    settlement.completed_at = now;
    settlement.completion_reference = payload.completion_reference || settlement.completion_reference || createSettlementReference('PAY');
    settlement.admin_note = payload.admin_note || settlement.admin_note;
    pushSettlementHistory(settlement, 'completed', payload.admin_note || 'Settlement completed', actor, {
      completion_reference: settlement.completion_reference,
    });
    await rider.save({ validateBeforeSave: false });
  } else if (nextStatus === 'cancelled') {
    if (!['requested', 'approved'].includes(settlement.status)) {
      throw new AppError('Only requested or approved settlements can be cancelled', 400);
    }
    settlement.status = 'cancelled';
    settlement.admin_note = payload.admin_note || settlement.admin_note;
    pushSettlementHistory(settlement, 'cancelled', payload.admin_note || 'Settlement cancelled by admin', actor);
  } else {
    throw new AppError('Unsupported settlement status transition', 400);
  }

  await settlement.save();
  emitSettlementEvent('rider:settlement-updated', settlement, rider);
  if (settlement.status === 'completed') {
    emitSettlementEvent('rider:settlement-completed', settlement, rider);
  }

  return { settlement, rider, balance: getRiderBalanceSnapshot(rider) };
};

const recordCodSettlementCompletion = async ({ rider, payload, actor }) => {
  assertAdminCanUseRider(rider, actor, 'COD settlement');

  const amount = Number(payload.amount);
  const currentCod = Number(rider.current_cod || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('COD settlement amount must be a positive number', 400);
  }

  if (currentCod <= 0) {
    throw new AppError('Rider has no COD balance to settle', 400);
  }

  if (amount > currentCod) {
    throw new AppError('COD settlement amount cannot exceed rider COD balance', 400);
  }

  const settlement = new RiderSettlement({
    reference: createSettlementReference('COD'),
    rider_id: rider._id,
    user_id: resolveIdValue(rider.user_id),
    hub_id: resolveIdValue(rider.hub_id),
    type: 'cod_settlement',
    status: 'completed',
    amount,
    payout_amount: 0,
    cod_amount: amount,
    method: payload.method || 'cash',
    note: payload.note || 'COD handed over to hub/admin',
    admin_note: payload.admin_note || null,
    requested_by: buildAuthContext(actor).id,
    requested_by_role: buildAuthContext(actor).role,
    completed_by: buildAuthContext(actor).id,
    completed_at: new Date(),
    completion_reference: payload.completion_reference || createSettlementReference('CODPAY'),
  });

  pushSettlementHistory(settlement, 'completed', payload.note || 'COD settlement completed', actor, {
    cod_before: currentCod,
    cod_after: Math.max(0, currentCod - amount),
  });

  rider.current_cod = Math.max(0, currentCod - amount);
  await Promise.all([
    rider.save({ validateBeforeSave: false }),
    settlement.save(),
  ]);

  emitSettlementEvent('rider:settlement-completed', settlement, rider);

  return { settlement, rider, balance: getRiderBalanceSnapshot(rider) };
};

module.exports = {
  getRiderBalanceSnapshot,
  calculateRiderPayoutForOrder,
  assertRiderBelowCodLimit,
  assertRiderWithinCodCapacity,
  createWithdrawalRequest,
  listSettlements,
  updateSettlementStatus,
  recordCodSettlementCompletion,
};
