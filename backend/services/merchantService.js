const crypto = require('crypto');

const QRCode = require('qrcode');

const Merchant = require('../models/Merchant');
const MerchantTransaction = require('../models/MerchantTransaction');
const AppError = require('../utils/AppError');
const { signAccessToken, signRefreshToken, hashToken } = require('../utils/token');

const TIER_RULES = [
  { level: 'Elite', minDeliveries: 1000, minEarnings: 250000 },
  { level: 'Priority', minDeliveries: 500, minEarnings: 100000 },
  { level: 'Active', minDeliveries: 100, minEarnings: 25000 },
  { level: 'Starter', minDeliveries: 0, minEarnings: 0 },
];

const DEFAULT_REFERRAL_BONUS = Number(process.env.MERCHANT_REFERRAL_BONUS || 500);

const buildAuthPayload = (merchant) => ({
  id: merchant._id,
  role: 'merchant',
  hub_id: merchant.hub_id,
  email: merchant.email,
});

const createMerchantTokens = (merchant) => {
  const payload = buildAuthPayload(merchant);

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
};

const hashMerchantToken = hashToken;

const generateReferralCode = async (merchantName, email) => {
  const base = `${merchantName || email || 'merchant'}`
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase() || 'MRC';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${base}${suffix}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Merchant.exists({ referral_code: code });
    if (!exists) {
      return code;
    }
  }

  return `${base}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

const calculateTierLevel = (totalDeliveries = 0, earnings = 0) => {
  const matchedRule = TIER_RULES.find((rule) => totalDeliveries >= rule.minDeliveries || earnings >= rule.minEarnings);
  return matchedRule?.level || 'Starter';
};

const buildQrContent = (merchant) => JSON.stringify({
  merchant_id: String(merchant._id),
  referral_code: merchant.referral_code,
  merchant_name: merchant.merchant_name,
  shop_name: merchant.shop_name,
});

const generateQrCode = async (merchant) => QRCode.toDataURL(buildQrContent(merchant), {
  errorCorrectionLevel: 'M',
  margin: 1,
  scale: 8,
});

const resolveReferralMerchant = async (referredBy) => {
  if (!referredBy) {
    return null;
  }

  const merchantById = await Merchant.findById(referredBy);
  if (merchantById) {
    return merchantById;
  }

  return Merchant.findOne({ referral_code: String(referredBy).trim().toUpperCase() });
};

const normalizePagination = (query = {}) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const buildMerchantMatch = ({ search, status, tier_level, hub_id }) => {
  const match = {};

  if (status) match.status = status;
  if (tier_level) match.tier_level = tier_level;
  if (hub_id) match.hub_id = hub_id;

  if (search) {
    match.$or = [
      { merchant_name: { $regex: search, $options: 'i' } },
      { shop_name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { referral_code: { $regex: search, $options: 'i' } },
    ];
  }

  return match;
};

const createReferralPayout = async ({ referredByMerchant, newMerchant, createdBy = null }) => {
  if (!referredByMerchant) {
    return null;
  }

  const balanceBefore = Number(referredByMerchant.earnings || 0);
  const balanceAfter = balanceBefore + DEFAULT_REFERRAL_BONUS;

  referredByMerchant.earnings = balanceAfter;
  recalculateMerchantTier(referredByMerchant);
  await referredByMerchant.save({ validateBeforeSave: false });

  return MerchantTransaction.create({
    merchant_id: referredByMerchant._id,
    hub_id: referredByMerchant.hub_id,
    type: 'referral',
    amount: DEFAULT_REFERRAL_BONUS,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    status: 'completed',
    reference: `REF-${newMerchant.referral_code}`,
    note: `Referral bonus for merchant ${newMerchant.merchant_name}`,
    metadata: {
      referred_merchant_id: newMerchant._id,
      referred_merchant_email: newMerchant.email,
    },
    created_by: createdBy,
  });
};

const recalculateMerchantTier = (merchant) => {
  if (merchant.tier_manually_set) {
    return merchant;
  }

  merchant.tier_level = calculateTierLevel(merchant.total_deliveries, merchant.earnings);
  return merchant;
};

const aggregateMerchantTransactions = async (merchantId, type, query = {}) => {
  const { page, limit, skip } = normalizePagination(query);
  const match = {
    merchant_id: merchantId,
    type,
  };

  if (query.status) {
    match.status = query.status;
  }

  if (query.from || query.to) {
    match.createdAt = {};

    if (query.from) match.createdAt.$gte = new Date(query.from);
    if (query.to) match.createdAt.$lte = new Date(query.to);
  }

  const [summary] = await MerchantTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalCount: { $sum: 1 },
      },
    },
  ]);

  const items = await MerchantTransaction.find(match)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await MerchantTransaction.countDocuments(match);

  return {
    items,
    summary: summary || { totalAmount: 0, totalCount: 0 },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

const getMerchantDashboardStats = async (merchant) => {
  const referralCount = await Merchant.countDocuments({ referred_by: merchant._id });
  const recentTransactions = await MerchantTransaction.find({ merchant_id: merchant._id })
    .sort({ createdAt: -1 })
    .limit(5);

  const aggregation = await MerchantTransaction.aggregate([
    { $match: { merchant_id: merchant._id } },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        totalCount: { $sum: 1 },
      },
    },
  ]);

  const totalsByType = aggregation.reduce((accumulator, item) => {
    accumulator[item._id] = {
      totalAmount: item.totalAmount,
      totalCount: item.totalCount,
    };
    return accumulator;
  }, {});

  return {
    merchant: merchant.toPublicJSON(),
    dashboard: {
      referralCount,
      tier_level: merchant.tier_level,
      total_deliveries: merchant.total_deliveries,
      cod_balance: merchant.cod_balance,
      earnings: merchant.earnings,
      referrals: totalsByType.referral || { totalAmount: 0, totalCount: 0 },
      cod: totalsByType.cod || { totalAmount: 0, totalCount: 0 },
      payouts: totalsByType.payout || { totalAmount: 0, totalCount: 0 },
      earnings_breakdown: totalsByType.earning || { totalAmount: 0, totalCount: 0 },
      recentTransactions,
    },
  };
};

const listMerchants = async ({ query }) => {
  const { page, limit, skip } = normalizePagination(query);
  const match = buildMerchantMatch(query);

  const [items, total] = await Promise.all([
    Merchant.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Merchant.countDocuments(match),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

module.exports = {
  buildAuthPayload,
  createMerchantTokens,
  hashMerchantToken,
  generateReferralCode,
  calculateTierLevel,
  generateQrCode,
  resolveReferralMerchant,
  normalizePagination,
  buildMerchantMatch,
  createReferralPayout,
  recalculateMerchantTier,
  aggregateMerchantTransactions,
  getMerchantDashboardStats,
  listMerchants,
};
