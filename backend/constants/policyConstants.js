const fs = require('fs');
const path = require('path');

const POLICY_VERSION = '2026-05-31';
const uniquePaths = (paths) => [...new Set(paths.filter(Boolean).map((entry) => path.resolve(entry)))];
const POLICY_ROOT_CANDIDATES = uniquePaths([
  process.env.POLICY_ROOT,
  path.resolve(__dirname, '..', '..', 'Policy'),
  path.resolve(__dirname, '..', 'Policy'),
  path.resolve(process.cwd(), 'Policy'),
]);
const POLICY_ROOT = POLICY_ROOT_CANDIDATES.find((candidate) => fs.existsSync(candidate))
  || POLICY_ROOT_CANDIDATES[0];

const POLICY_DOCUMENTS = [
  {
    key: 'merchant_shop_partnership_agreement',
    audience: 'merchant',
    title: 'Wolan Delivery Shop Partnership Agreement',
    file_name: 'Shop Partnership Agreement (for businesses you partner with).docx',
    version: POLICY_VERSION,
    required: true,
  },
  {
    key: 'merchant_delivery_policy_agreement',
    audience: 'merchant',
    title: 'Delivery Policy Agreement',
    file_name: 'delivery policy agreement copy.docx',
    version: POLICY_VERSION,
    required: true,
  },
  {
    key: 'merchant_insurance_policy',
    audience: 'merchant',
    title: 'Insurance Policy',
    file_name: 'insuarance policy.docx',
    version: POLICY_VERSION,
    required: true,
  },
  {
    key: 'rider_service_agreement',
    audience: 'rider',
    title: 'Wolan Logistics Rider Service Agreement',
    file_name: 'Rider Contract Agreement (for hiring riders).docx',
    version: POLICY_VERSION,
    required: true,
  },
  {
    key: 'rider_operational_handbook',
    audience: 'rider',
    title: 'Rider Operational Handbook',
    file_name: 'rider operational handbook.docx',
    version: POLICY_VERSION,
    required: true,
  },
];

const normalizeAcceptedPolicyKeys = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'object' ? item.key : item))
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const getPolicyDocuments = (audience) => POLICY_DOCUMENTS
  .filter((policy) => !audience || policy.audience === audience);

const findPolicyByKey = (key) => POLICY_DOCUMENTS
  .find((policy) => policy.key === key);

const getRequiredPolicyKeys = (audience) => getPolicyDocuments(audience)
  .filter((policy) => policy.required)
  .map((policy) => policy.key);

const getUnavailableRequiredPolicyKeys = (audience) => getPolicyDocuments(audience)
  .filter((policy) => policy.required && !policyFileExists(policy))
  .map((policy) => policy.key);

const getMissingRequiredAcceptedPolicyKeys = (audience, acceptances = []) => {
  const acceptedPolicies = Array.isArray(acceptances) ? acceptances : [];
  return getPolicyDocuments(audience)
    .filter((policy) => policy.required)
    .filter((policy) => !acceptedPolicies.some((acceptance) => (
      acceptance?.key === policy.key
      && acceptance?.version === policy.version
      && acceptance?.file_name === policy.file_name
    )))
    .map((policy) => policy.key);
};

const hasAcceptedRequiredPolicies = (audience, acceptances = []) =>
  getMissingRequiredAcceptedPolicyKeys(audience, acceptances).length === 0;

const validatePolicyAcceptanceSelection = (audience, acceptedKeys, options = {}) => {
  const requireAll = options.requireAll !== false;
  const requireFiles = options.requireFiles !== false;
  const keys = normalizeAcceptedPolicyKeys(acceptedKeys);
  const policies = getPolicyDocuments(audience);
  const allowedKeys = new Set(policies.map((policy) => policy.key));
  const requiredKeys = getRequiredPolicyKeys(audience);
  const errors = [];

  const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicateKeys.length > 0) {
    errors.push('accepted_policy_keys cannot contain duplicate policy keys');
  }

  const invalidKeys = keys.filter((key) => !allowedKeys.has(key));
  if (invalidKeys.length > 0) {
    errors.push(`accepted_policy_keys contains invalid policy keys: ${invalidKeys.join(', ')}`);
  }

  if (requireAll) {
    const missingKeys = requiredKeys.filter((key) => !keys.includes(key));
    if (missingKeys.length > 0) {
      errors.push(`accepted_policy_keys missing required policies: ${missingKeys.join(', ')}`);
    }
  }

  if (requireFiles) {
    const unavailableKeys = getUnavailableRequiredPolicyKeys(audience);
    if (unavailableKeys.length > 0) {
      errors.push(`required policy document files are unavailable: ${unavailableKeys.join(', ')}`);
    }
  }

  return errors;
};

const resolvePolicyFilePath = (policy) => {
  const filePath = path.resolve(POLICY_ROOT, policy.file_name);

  if (filePath !== POLICY_ROOT && !filePath.startsWith(`${POLICY_ROOT}${path.sep}`)) {
    throw new Error('Policy file path is outside the policy directory');
  }

  return filePath;
};

const policyFileExists = (policy) => {
  try {
    return fs.existsSync(resolvePolicyFilePath(policy));
  } catch (error) {
    return false;
  }
};

const toPolicyPublicJSON = (policy) => ({
  key: policy.key,
  audience: policy.audience,
  title: policy.title,
  version: policy.version,
  file_name: policy.file_name,
  required: policy.required,
  file_available: policyFileExists(policy),
  download_url: `/api/v1/auth/policies/${encodeURIComponent(policy.key)}/download`,
});

const buildPolicyAcceptanceRecords = ({ audience, acceptedKeys, req }) => {
  const keys = normalizeAcceptedPolicyKeys(acceptedKeys);
  const now = new Date();
  const ip = req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;
  const userAgent = req?.headers?.['user-agent'] || null;

  return getPolicyDocuments(audience)
    .filter((policy) => keys.includes(policy.key))
    .map((policy) => ({
      key: policy.key,
      audience: policy.audience,
      title: policy.title,
      version: policy.version,
      file_name: policy.file_name,
      accepted_at: now,
      accepted_ip: ip,
      accepted_user_agent: userAgent,
    }));
};

module.exports = {
  POLICY_DOCUMENTS,
  POLICY_ROOT,
  buildPolicyAcceptanceRecords,
  findPolicyByKey,
  getMissingRequiredAcceptedPolicyKeys,
  getPolicyDocuments,
  getRequiredPolicyKeys,
  getUnavailableRequiredPolicyKeys,
  hasAcceptedRequiredPolicies,
  normalizeAcceptedPolicyKeys,
  policyFileExists,
  resolvePolicyFilePath,
  toPolicyPublicJSON,
  validatePolicyAcceptanceSelection,
};
