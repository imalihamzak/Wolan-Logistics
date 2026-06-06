const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const { buildSupportConfig } = require('../services/supportConfigService');

const getSupportConfig = asyncHandler(async (req, res) => {
  return successResponse(res, 'Support configuration fetched successfully', {
    support: buildSupportConfig(),
  });
});

const receiveProviderWebhook = asyncHandler(async (req, res) => {
  const configuredSecret = process.env.SUPPORT_WEBHOOK_SECRET;
  const providedSecret = req.get('X-Wolan-Support-Webhook-Secret') || req.get('X-Support-Webhook-Secret');

  if (configuredSecret && providedSecret !== configuredSecret) {
    return res.status(401).json({
      success: false,
      message: 'Invalid support webhook signature',
    });
  }

  return successResponse(res, 'Support provider webhook accepted', {
    provider: req.body?.provider || req.query?.provider || 'unknown',
    event_type: req.body?.event_type || req.body?.type || 'provider_event',
    received_at: new Date().toISOString(),
    support: {
      managed_by_api: true,
      provider_change_mode: 'server_config_or_provider_webhook',
    },
  }, 202);
});

module.exports = {
  getSupportConfig,
  receiveProviderWebhook,
};
