const getEnvNumber = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const RIDER_COD_OPERATION_LIMIT = getEnvNumber(
  'RIDER_COD_OPERATION_LIMIT',
  getEnvNumber('DASHBOARD_COD_ALERT_LIMIT', 1000000)
);

const RIDER_PAYOUT_RATE = getEnvNumber('RIDER_PAYOUT_RATE', 0.7);
const RIDER_FLAT_DELIVERY_PAYOUT = getEnvNumber('RIDER_FLAT_DELIVERY_PAYOUT', 50);

const SETTLEMENT_TYPES = ['withdrawal', 'cod_settlement'];
const SETTLEMENT_STATUSES = ['requested', 'approved', 'rejected', 'completed', 'cancelled'];
const ACTIVE_WITHDRAWAL_STATUSES = ['requested', 'approved'];
const SETTLEMENT_METHODS = ['mobile_money', 'cash', 'bank'];

module.exports = {
  RIDER_COD_OPERATION_LIMIT,
  RIDER_PAYOUT_RATE,
  RIDER_FLAT_DELIVERY_PAYOUT,
  SETTLEMENT_TYPES,
  SETTLEMENT_STATUSES,
  ACTIVE_WITHDRAWAL_STATUSES,
  SETTLEMENT_METHODS,
};
