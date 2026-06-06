const SUPPORT_TEST_NUMBER = '+256 761 253001';

const hasValue = (value) => String(value || '').trim().length > 0;

const normalizePhoneDisplay = (value) => {
  const raw = hasValue(value) ? String(value).trim() : SUPPORT_TEST_NUMBER;
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : SUPPORT_TEST_NUMBER;
};

const normalizePhoneForUrl = (value) => normalizePhoneDisplay(value).replace(/\D/g, '');

const buildSupportConfig = () => {
  const whatsappNumber = normalizePhoneDisplay(process.env.SUPPORT_WHATSAPP_NUMBER || process.env.SUPPORT_PHONE);
  const voiceNumber = normalizePhoneDisplay(process.env.SUPPORT_VOICE_NUMBER || process.env.SUPPORT_PHONE);
  const email = String(process.env.SUPPORT_EMAIL || '').trim();
  const helpCenterUrl = String(process.env.SUPPORT_HELP_CENTER_URL || '').trim();
  const whatsappText = process.env.SUPPORT_WHATSAPP_TEXT || 'Hello Wolan Support';
  const whatsappUrl = process.env.SUPPORT_WHATSAPP_URL
    || `https://wa.me/${normalizePhoneForUrl(whatsappNumber)}?text=${encodeURIComponent(whatsappText)}`;

  return {
    version: '2026-06-testing',
    managed_by_api: true,
    provider_change_mode: 'server_config_or_provider_webhook',
    temporary_testing_line: true,
    channels: {
      whatsapp: {
        enabled: true,
        provider: process.env.SUPPORT_WHATSAPP_PROVIDER || 'testing_whatsapp_redirect',
        display_number: whatsappNumber,
        href: whatsappUrl,
        label: 'WhatsApp Support',
      },
      voice: {
        enabled: true,
        provider: process.env.SUPPORT_VOICE_PROVIDER || 'testing_voice_call',
        display_number: voiceNumber,
        href: `tel:${voiceNumber.replace(/\s/g, '')}`,
        label: 'Call Support',
      },
      email: {
        enabled: hasValue(email),
        provider: process.env.SUPPORT_EMAIL_PROVIDER || null,
        address: email || null,
        href: email ? `mailto:${email}?subject=${encodeURIComponent('Wolan Delivery Support')}` : null,
        label: 'Email Support',
      },
    },
    merchant_support: {
      enabled: true,
      primary_channel: 'whatsapp',
      escalation_channel: 'voice',
    },
    customer_support: {
      enabled: true,
      primary_channel: 'whatsapp',
      escalation_channel: 'voice',
    },
    help_center: {
      enabled: true,
      source: helpCenterUrl ? 'external_url' : 'in_app_faq',
      href: helpCenterUrl || null,
    },
    webhooks: {
      provider_events_url: '/api/v1/support/webhooks/provider-events',
      accepts_future_providers: [
        'whatsapp_business_api',
        'ycloud',
        'call_center',
        'crm',
        'chatbot',
      ],
      secret_configured: hasValue(process.env.SUPPORT_WEBHOOK_SECRET),
    },
    updated_at: new Date().toISOString(),
  };
};

module.exports = {
  buildSupportConfig,
};
