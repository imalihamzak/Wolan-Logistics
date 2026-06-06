const asyncHandler = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const { buildSupportConfig } = require('../services/supportConfigService');
const { getMapProviderStatus } = require('../services/mapProviderService');

const hasValue = (value) => String(value || '').trim().length > 0;

const buildStatus = ({
  key,
  name,
  configured,
  status,
  detail,
  provider = null,
  required_now = false,
  features = [],
}) => ({
  key,
  name,
  configured: Boolean(configured),
  status,
  detail,
  provider,
  required_now,
  features,
});

const getIntegrationStatus = asyncHandler(async (req, res) => {
  const twilioConfigured = hasValue(process.env.TWILIO_ACCOUNT_SID)
    && hasValue(process.env.TWILIO_AUTH_TOKEN)
    && (hasValue(process.env.TWILIO_FROM_NUMBER) || hasValue(process.env.TWILIO_MESSAGING_SERVICE_SID));
  const africasTalkingConfigured = hasValue(process.env.AFRICAS_TALKING_USERNAME)
    && hasValue(process.env.AFRICAS_TALKING_API_KEY);
  const smsConfigured = twilioConfigured || africasTalkingConfigured;
  const smsProvider = process.env.SMS_PROVIDER || (twilioConfigured ? 'twilio' : africasTalkingConfigured ? 'africas_talking' : null);

  const mapProviderStatus = getMapProviderStatus();
  const mapProviderName = mapProviderStatus.provider === 'openrouteservice'
    ? 'OpenRouteService / OpenStreetMap'
    : 'Google Maps API';
  const mictrackConfigured = hasValue(process.env.MICTRACK_API_BASE_URL)
    && (
      hasValue(process.env.MICTRACK_API_KEY)
      || (hasValue(process.env.MICTRACK_USERNAME) && hasValue(process.env.MICTRACK_PASSWORD))
    );
  const flutterwaveConfigured = hasValue(process.env.FLUTTERWAVE_SECRET_KEY)
    && hasValue(process.env.FLUTTERWAVE_PUBLIC_KEY);
  const hetznerConfigured = ['hetzner_s3', 's3'].includes(String(process.env.STORAGE_PROVIDER || '').toLowerCase())
    && hasValue(process.env.S3_ENDPOINT)
    && hasValue(process.env.S3_BUCKET)
    && hasValue(process.env.S3_ACCESS_KEY_ID)
    && hasValue(process.env.S3_SECRET_ACCESS_KEY);
  const supportConfig = buildSupportConfig();

  const integrations = [
    buildStatus({
      key: 'sms',
      name: "Africa's Talking SMS",
      configured: smsConfigured,
      provider: smsProvider,
      status: smsConfigured ? 'Configured' : 'Deferred until handover',
      detail: smsConfigured
        ? `${smsProvider || 'SMS'} provider credentials are present for OTP/notification delivery.`
        : 'SMS provider activation is intentionally deferred; current non-production flows can use configured fallback/simulation rules.',
      required_now: false,
      features: ['OTP verification', 'dispatch alerts', 'delivery notifications'],
    }),
    buildStatus({
      key: 'map_provider',
      name: mapProviderName,
      configured: mapProviderStatus.configured,
      provider: mapProviderStatus.provider,
      status: mapProviderStatus.configured ? 'Configured' : 'Provider config required',
      detail: mapProviderStatus.configured
        ? `${mapProviderName} is configured for geocoding, route distance, ETA, dispatch distance, and automatic pricing.`
        : `${mapProviderName} credentials are required for production distance pricing and live routing.`,
      required_now: true,
      features: ['Geocoding', 'Address lookup', 'Route calculation', 'Distance Matrix', 'ETA', 'automatic delivery pricing'],
    }),
    buildStatus({
      key: 'traccar',
      name: 'Traccar GPS',
      configured: false,
      provider: 'traccar',
      status: 'Not available for Phase 1',
      detail: 'Client confirmed Traccar is not required now; Mictrack remains the future tracker integration path.',
      required_now: false,
      features: ['GPS tracking'],
    }),
    buildStatus({
      key: 'mictrack',
      name: 'Mictrack Device API',
      configured: mictrackConfigured,
      provider: 'mictrack',
      status: mictrackConfigured ? 'Configured' : 'Deferred until handover',
      detail: mictrackConfigured
        ? 'Mictrack API credentials are present for live tracker mapping.'
        : 'Mictrack activation is deferred until the client provides device/API access during handover.',
      required_now: false,
      features: ['rider tracking', 'package tracker GPS', 'anti-fraud monitoring'],
    }),
    buildStatus({
      key: 'flutterwave',
      name: 'Flutterwave Payments',
      configured: flutterwaveConfigured,
      provider: 'flutterwave',
      status: flutterwaveConfigured ? 'Configured' : 'Deferred until handover',
      detail: flutterwaveConfigured
        ? 'Flutterwave keys are present; payout execution can be connected to settlement completion.'
        : 'Settlement workflows remain internal until Flutterwave live credentials are provided.',
      required_now: false,
      features: ['wallet settlements', 'withdrawal payout execution'],
    }),
    buildStatus({
      key: 'hetzner_storage',
      name: 'Hetzner KYC Storage',
      configured: hetznerConfigured,
      provider: 'hetzner_s3',
      status: hetznerConfigured ? 'Configured' : 'Local storage active',
      detail: hetznerConfigured
        ? 'S3-compatible Hetzner storage credentials are present for KYC/proof uploads.'
        : 'KYC/proof uploads currently use local protected storage; Hetzner containers are deferred until handover.',
      required_now: false,
      features: ['KYC documents', 'proof photos', 'signed file storage'],
    }),
    buildStatus({
      key: 'support_channels',
      name: 'Support Channels',
      configured: supportConfig.channels.whatsapp.enabled && supportConfig.channels.voice.enabled,
      provider: supportConfig.channels.whatsapp.provider,
      status: 'Configured for live testing',
      detail: `WhatsApp and voice support route centrally to ${supportConfig.channels.whatsapp.display_number}. Future WhatsApp Business API, YCloud, CRM, chatbot, or call center providers can be changed through backend configuration/webhooks.`,
      required_now: true,
      features: ['merchant support', 'customer support', 'help center', 'provider webhooks'],
    }),
  ];

  return successResponse(res, 'Integration status fetched successfully', { integrations });
});

module.exports = {
  getIntegrationStatus,
};
