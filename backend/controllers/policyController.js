const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const Merchant = require('../models/Merchant');
const Rider = require('../models/Rider');
const {
  buildPolicyAcceptanceRecords,
  findPolicyByKey,
  getPolicyDocuments,
  normalizeAcceptedPolicyKeys,
  resolvePolicyFilePath,
  toPolicyPublicJSON,
  validatePolicyAcceptanceSelection,
} = require('../constants/policyConstants');

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const listPolicies = asyncHandler(async (req, res) => {
  const audience = req.query.audience ? String(req.query.audience).trim() : null;

  if (audience && !['merchant', 'rider'].includes(audience)) {
    throw new AppError('audience must be merchant or rider', 400);
  }

  return successResponse(res, 'Policy documents fetched successfully', {
    policies: getPolicyDocuments(audience).map(toPolicyPublicJSON),
  });
});

const downloadPolicy = asyncHandler(async (req, res) => {
  const policy = findPolicyByKey(String(req.params.key || '').trim());

  if (!policy) {
    throw new AppError('Policy document not found', 404);
  }

  const filePath = resolvePolicyFilePath(policy);

  const dispositionType = ['1', 'true', 'yes'].includes(String(req.query.download || '').toLowerCase())
    ? 'attachment'
    : 'inline';
  const safeFileName = policy.file_name.replace(/["\r\n]/g, '').trim() || 'policy-document.docx';

  res.setHeader('Content-Type', DOCX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `${dispositionType}; filename="${safeFileName}"`);

  return res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) {
      return res.status(error.statusCode || 404).json({
        success: false,
        message: 'Policy document file is not available on the server',
      });
    }
    return undefined;
  });
});

const acceptPolicies = asyncHandler(async (req, res) => {
  const role = req.user?.role;
  const audience = role === 'merchant' ? 'merchant' : role === 'rider' ? 'rider' : null;

  if (!audience) {
    throw new AppError('Only merchant and rider accounts can accept onboarding policy documents', 403);
  }

  const acceptedKeys = normalizeAcceptedPolicyKeys(req.body.accepted_policy_keys || req.body.policy_acceptances);
  const validationErrors = validatePolicyAcceptanceSelection(audience, acceptedKeys, { requireAll: true });
  if (validationErrors.length > 0) {
    throw new AppError(validationErrors.join('; '), 400);
  }

  const account = audience === 'merchant'
    ? await Merchant.findById(req.user.id)
    : await Rider.findOne({ user_id: req.user.id });

  if (!account) {
    throw new AppError(`${audience === 'merchant' ? 'Merchant' : 'Rider'} profile not found`, 404);
  }

  const incomingRecords = buildPolicyAcceptanceRecords({ audience, acceptedKeys, req });
  const incomingKeys = new Set(incomingRecords.map((record) => record.key));
  account.policy_acceptances = [
    ...(account.policy_acceptances || []).filter((record) => !incomingKeys.has(record.key)),
    ...incomingRecords,
  ];

  await account.save({ validateBeforeSave: false });

  return successResponse(res, 'Policy agreements accepted successfully', {
    [audience]: account.toPublicJSON(),
  });
});

module.exports = {
  acceptPolicies,
  downloadPolicy,
  listPolicies,
};
