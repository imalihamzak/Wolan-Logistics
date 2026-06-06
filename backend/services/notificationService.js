const Notification = require('../models/Notification');
const { templates } = require('../utils/notificationTemplates');
const https = require('https');

/**
 * Notification Service
 * Handles persisted in-app records and simulated/provider-backed outbound notifications.
 */

const toIdString = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return String(value._id || value.id || value);
  }

  return String(value);
};

const getDocField = (doc, fields, fallback = '') => {
  if (!doc || typeof doc !== 'object') {
    return fallback;
  }

  for (const field of fields) {
    if (doc[field]) {
      return doc[field];
    }
  }

  return fallback;
};

const createRecipient = (id, contact = {}) => {
  const recipientId = toIdString(id);
  if (!recipientId) {
    return null;
  }

  return {
    id: recipientId,
    phone: contact.phone || '',
    email: contact.email || '',
    fcm_token: contact.fcm_token || contact.fcmToken || '',
  };
};

const buildTrackingUrl = (order) => {
  // Local development fallback: http://localhost:5173
  const baseUrl = (process.env.FRONTEND_URL || 'https://wolan.catrinafreshmex.host').replace(/\/$/, '');
  const trackingId = order.package_tracking_id || order.order_id || toIdString(order._id || order.id);
  return `${baseUrl}/track/${trackingId}`;
};

const buildOrderVariables = (order) => {
  const merchant = order.merchant_id;
  const rider = order.rider_id;
  const hub = order.hub_id;

  return {
    order_id: order.order_id || toIdString(order._id || order.id),
    rider_name: getDocField(rider, ['full_name', 'name'], 'Rider'),
    rider_phone: getDocField(rider, ['phone'], ''),
    merchant_name: getDocField(merchant, ['merchant_name', 'shop_name', 'name'], 'Merchant'),
    customer_name: order.customer_name || 'Customer',
    customer_phone: order.customer_phone || '',
    delivery_address: order.delivery_address || '',
    item_description: order.item_description || '',
    delivery_zone: order.delivery_zone || '',
    hub_name: getDocField(hub, ['name', 'code'], 'hub'),
    cod_amount: order.cod_amount || 0,
    eta: order.estimated_delivery_time || '45 mins',
    failed_reason: order.failed_reason || 'Customer unavailable',
    return_reason: order.return_reason || 'Returned to merchant',
    delivered_at: order.delivered_at ? new Date(order.delivered_at).toLocaleString() : '',
    tracking_url: buildTrackingUrl(order),
  };
};

const normalizeOutboundPhone = (phone) => {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) {
    return raw.replace(/\s+/g, '');
  }

  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? `+${digits}` : '';
};

const findUnresolvedTemplateVariables = (text = '') => {
  const matches = String(text).match(/\{[a-zA-Z0-9_]+\}/g) || [];
  return [...new Set(matches.map((match) => match.slice(1, -1)))];
};

const isOtpNotification = (notification) => (
  notification.category === 'otp'
  || String(notification.template_key || '').toLowerCase().includes('otp')
  || Boolean(notification.metadata?.purpose && notification.metadata?.challenge_id)
);

const canSimulateOtpSms = () => (
  process.env.ALLOW_SIMULATED_OTP_SMS === 'true'
  || process.env.EXPOSE_DEV_OTP === 'true'
);

const postFormRequest = ({ url, auth, form }) => new Promise((resolve, reject) => {
  const parsedUrl = new URL(url);
  const body = new URLSearchParams(form).toString();

  const req = https.request({
    method: 'POST',
    hostname: parsedUrl.hostname,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    auth,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, (res) => {
    let responseBody = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      responseBody += chunk;
    });
    res.on('end', () => {
      let parsedBody = {};
      try {
        parsedBody = responseBody ? JSON.parse(responseBody) : {};
      } catch (error) {
        parsedBody = { raw: responseBody };
      }

      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(parsedBody);
        return;
      }

      reject(new Error(parsedBody.message || `Provider returned HTTP ${res.statusCode}`));
    });
  });

  req.on('error', reject);
  req.write(body);
  req.end();
});

const sendTwilioSms = async ({ to, body }) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
    throw new Error('Twilio SMS credentials are not configured');
  }

  const form = {
    To: normalizeOutboundPhone(to),
    Body: body,
  };

  if (messagingServiceSid) {
    form.MessagingServiceSid = messagingServiceSid;
  } else {
    form.From = normalizeOutboundPhone(fromNumber);
  }

  const response = await postFormRequest({
    url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    auth: `${accountSid}:${authToken}`,
    form,
  });

  return {
    provider: 'twilio',
    sid: response.sid,
    status: response.status,
    to: response.to,
  };
};

class NotificationService {
  /**
   * Send a notification
   */
  async send(type, category, recipient, templateKey, variables = {}, options = {}) {
    const {
      priority = 'normal',
      scheduled_at = null,
      related_type = null,
      related_id = null,
      sent_by = null,
      metadata = {},
      wait_for_provider = false,
    } = options;

    const recipientId = toIdString(recipient?.id || recipient?._id || recipient?.recipient_id);
    if (!recipientId) {
      throw new Error('recipient.id is required for notifications');
    }

    // Validate template exists
    if (!templates[type] || !templates[type][templateKey]) {
      throw new Error(`Template '${templateKey}' not found for type '${type}'`);
    }

    const template = templates[type][templateKey];

    // Build message from template
    let message = template.template || template.body || '';
    let subject = template.subject || template.title || '';

    // Replace variables in template
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'g');
      const value = variables[key] ?? '';
      message = message.replace(regex, value);
      if (subject) {
        subject = subject.replace(regex, value);
      }
    });

    if (!message) {
      message = subject || templateKey;
    }

    const missingVariables = [
      ...findUnresolvedTemplateVariables(subject),
      ...findUnresolvedTemplateVariables(message),
    ];
    if (missingVariables.length > 0) {
      throw new Error(`Template '${templateKey}' requires variables: ${[...new Set(missingVariables)].join(', ')}`);
    }

    // Create notification record
    const notification = await Notification.create({
      type,
      category,
      recipient_id: recipientId,
      recipient_phone: recipient.phone,
      recipient_email: recipient.email,
      recipient_fcm_token: recipient.fcm_token,
      template_key: templateKey,
      variables,
      message,
      subject,
      priority,
      scheduled_at,
      related_type,
      related_id,
      sent_by,
      metadata,
    });

    if (wait_for_provider) {
      await this.processNotification(notification);
      if (notification.status === 'failed') {
        throw new Error(notification.failure_reason || 'Notification provider failed');
      }
    } else {
      // Send notification asynchronously; the persisted record is available immediately for testing.
      this.processNotification(notification).catch((error) => {
        console.error('Notification processing failed:', error);
      });
    }

    return notification;
  }

  /**
   * Send bulk notifications
   */
  async sendBulk(notifications) {
    const results = await Promise.allSettled(notifications.map((notifData) => {
      const {
        type,
        category,
        recipient,
        templateKey,
        variables = {},
        options = {},
      } = notifData;

      return this.send(type, category, recipient, templateKey, variables, options);
    }));

    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0) {
      console.warn('Some notifications could not be created:', failed.map((result) => result.reason?.message));
    }

    return results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  /**
   * Process and send notification
   */
  async processNotification(notification) {
    try {
      // Update status to queued
      notification.status = 'queued';
      notification.attempts = (notification.attempts || 0) + 1;
      notification.failure_reason = null;
      await notification.save();

      // Send based on type
      switch (notification.type) {
        case 'in_app':
          await this.sendInApp(notification);
          break;
        case 'sms':
          await this.sendSMS(notification);
          break;
        case 'whatsapp':
          await this.sendWhatsApp(notification);
          break;
        case 'email':
          await this.sendEmail(notification);
          break;
        case 'push':
          await this.sendPushNotification(notification);
          break;
        default:
          throw new Error(`Unsupported notification type: ${notification.type}`);
      }

      // Mark as sent/delivered
      notification.status = notification.type === 'in_app' ? 'delivered' : 'sent';
      notification.sent_at = new Date();
      if (notification.type === 'in_app') {
        notification.delivered_at = notification.sent_at;
      }
      await notification.save();

    } catch (error) {
      // Mark as failed
      notification.status = 'failed';
      notification.failed_at = new Date();
      notification.failure_reason = error.message;
      await notification.save();

      console.error('Notification failed:', error);
    }
  }

  /**
   * Persisted in-app notifications are considered locally delivered.
   */
  async sendInApp(notification) {
    notification.provider_response = {
      provider: 'in_app',
      simulated: false,
      delivered_locally: true,
    };
  }

  /**
   * Send SMS via configured provider.
   */
  async sendSMS(notification) {
    if (!notification.recipient_phone) {
      throw new Error('Recipient phone is required for SMS notifications');
    }

    const twilioConfigured = Boolean(
      process.env.TWILIO_ACCOUNT_SID
      && process.env.TWILIO_AUTH_TOKEN
      && (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
    );

    if (isOtpNotification(notification) && !twilioConfigured && !canSimulateOtpSms()) {
      throw new Error('Real Twilio SMS credentials are required for OTP delivery. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID in the backend environment, then restart the Node app.');
    }

    if (twilioConfigured) {
      const providerResponse = await sendTwilioSms({
        to: notification.recipient_phone,
        body: notification.message,
      });
      notification.provider_response = providerResponse;
      return;
    }

    if (!process.env.AFRICAS_TALKING_USERNAME || !process.env.AFRICAS_TALKING_API_KEY) {
      if (isOtpNotification(notification) && !canSimulateOtpSms()) {
        throw new Error('Real SMS provider credentials are required for OTP delivery. Configure Twilio or Africa\'s Talking, or explicitly enable ALLOW_SIMULATED_OTP_SMS for development only.');
      }

      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SIMULATED_SMS !== 'true') {
        throw new Error('SMS provider credentials are required in production');
      }
      console.warn('SMS credentials not configured, simulating SMS send.');
      notification.provider_response = {
        provider: 'sms',
        simulated: true,
        reason: 'SMS provider credentials are not configured',
      };
      return;
    }

    // Placeholder - integrate with Africa's Talking API
    console.log('Sending SMS:', {
      to: notification.recipient_phone,
      message: notification.message,
    });

    // Simulate API call for development
    await new Promise(resolve => setTimeout(resolve, 500));
    notification.provider_response = { provider: 'sms', simulated: false };
  }

  /**
   * Send WhatsApp message
   */
  async sendWhatsApp(notification) {
    if (!notification.recipient_phone) {
      throw new Error('Recipient phone is required for WhatsApp notifications');
    }

    if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
      console.warn('WhatsApp credentials not configured, simulating WhatsApp send.');
      notification.provider_response = {
        provider: 'whatsapp',
        simulated: true,
        reason: 'WhatsApp credentials are not configured',
      };
      return;
    }

    // Placeholder - integrate with WhatsApp Business API
    console.log('Sending WhatsApp:', {
      to: notification.recipient_phone,
      message: notification.message,
    });

    // Simulate API call for development
    await new Promise(resolve => setTimeout(resolve, 500));
    notification.provider_response = { provider: 'whatsapp', simulated: false };
  }

  /**
   * Send email
   */
  async sendEmail(notification) {
    if (!notification.recipient_email) {
      throw new Error('Recipient email is required for email notifications');
    }

    if (!process.env.SENDGRID_API_KEY && !process.env.AWS_SES_ACCESS_KEY) {
      console.warn('Email service credentials not configured, simulating email send.');
      notification.provider_response = {
        provider: 'email',
        simulated: true,
        reason: 'Email service credentials are not configured',
      };
      return;
    }

    // Placeholder - integrate with email service (SendGrid, AWS SES, etc.)
    console.log('Sending Email:', {
      to: notification.recipient_email,
      subject: notification.subject,
      message: notification.message,
    });

    // Simulate API call for development
    await new Promise(resolve => setTimeout(resolve, 500));
    notification.provider_response = { provider: 'email', simulated: false };
  }

  /**
   * Send push notification
   */
  async sendPushNotification(notification) {
    if (!process.env.FCM_SERVER_KEY) {
      console.warn('FCM credentials not configured, simulating push send.');
      notification.provider_response = {
        provider: 'push',
        simulated: true,
        reason: 'FCM credentials are not configured',
      };
      return;
    }

    // Placeholder - integrate with FCM or similar
    console.log('Sending Push:', {
      to: notification.recipient_fcm_token,
      title: notification.subject,
      body: notification.message,
    });

    // Simulate API call for development
    await new Promise(resolve => setTimeout(resolve, 500));
    notification.provider_response = { provider: 'push', simulated: false };
  }

  /**
   * Create testing notifications for the order lifecycle without blocking the order mutation.
   */
  async logOrderLifecycleNotifications(order, event, actor = {}) {
    const eventTemplates = {
      assigned: 'order_assigned',
      picked_up: 'order_picked_up',
      out_for_delivery: 'out_for_delivery',
      delivered: 'order_delivered',
      failed: 'order_failed',
      returned: 'order_returned',
    };

    const templateKey = eventTemplates[event];
    if (!templateKey || !order) {
      return [];
    }

    const merchant = order.merchant_id;
    const rider = order.rider_id;
    const merchantId = toIdString(merchant);
    const riderId = toIdString(rider);
    const hubId = toIdString(order.hub_id);
    const orderId = toIdString(order._id || order.id);
    const variables = buildOrderVariables(order);
    const notifications = [];

    const addNotification = (type, recipient, recipientKind) => {
      if (!recipient?.id) {
        return;
      }

      notifications.push({
        type,
        category: 'order_dispatch',
        recipient,
        templateKey,
        variables,
        options: {
          priority: event === 'assigned' || event === 'failed' ? 'high' : 'normal',
          related_type: 'order',
          related_id: orderId,
          sent_by: actor.id || null,
          metadata: {
            lifecycle_event: event,
            recipient_kind: recipientKind,
            order_id: variables.order_id,
            order_status: order.order_status,
            merchant_id: merchantId,
            rider_id: riderId,
            hub_id: hubId,
            simulated_provider_allowed: ['sms', 'whatsapp'].includes(type),
          },
        },
      });
    };

    const merchantRecipient = createRecipient(merchantId, {
      phone: getDocField(merchant, ['phone'], ''),
      email: getDocField(merchant, ['email'], ''),
    });
    const riderRecipient = createRecipient(riderId, {
      phone: getDocField(rider, ['phone'], ''),
      email: getDocField(rider, ['email'], ''),
    });
    const customerRecipient = createRecipient(merchantId, {
      phone: order.customer_phone,
    });

    addNotification('in_app', merchantRecipient, 'merchant');

    if (riderRecipient) {
      addNotification('in_app', riderRecipient, 'rider');
    }

    if (event === 'assigned' && riderRecipient?.phone) {
      addNotification('sms', riderRecipient, 'rider');
    }

    if (customerRecipient?.phone) {
      addNotification('sms', customerRecipient, 'customer');
      addNotification('whatsapp', customerRecipient, 'customer');
    }

    return this.sendBulk(notifications);
  }

  /**
   * Send order-related notifications
   */
  async sendOrderNotification(order, event, recipient) {
    const templateMap = {
      assigned: 'order_assigned',
      picked_up: 'order_picked_up',
      out_for_delivery: 'out_for_delivery',
      delivered: 'order_delivered',
      failed: 'order_failed',
      returned: 'order_returned',
      delayed: 'delay_notification',
    };

    const templateKey = templateMap[event];
    if (!templateKey) return null;

    return this.send('sms', 'order_dispatch', recipient, templateKey, buildOrderVariables(order), {
      related_type: 'order',
      related_id: order._id,
    });
  }

  /**
   * Send rider notifications
   */
  async sendRiderNotification(rider, event, variables = {}) {
    const baseVariables = {
      rider_name: rider.name || rider.full_name,
      rider_id: rider.id || rider._id,
      ...variables,
    };

    const templateMap = {
      login: 'rider_login',
      new_route: 'new_route_assigned',
      payout: 'rider_payout',
      daily_report: 'daily_report',
    };

    const templateKey = templateMap[event];
    if (!templateKey) return null;

    return this.send('sms', 'rider', rider, templateKey, baseVariables, {
      related_type: 'rider',
      related_id: rider._id,
    });
  }

  /**
   * Send merchant notifications
   */
  async sendMerchantNotification(merchant, event, variables = {}) {
    const baseVariables = {
      merchant_name: merchant.name || merchant.merchant_name || merchant.shop_name,
      merchant_id: merchant.id || merchant._id,
      ...variables,
    };

    const templateMap = {
      order_created: 'order_created',
      order_update: 'order_update',
      cod_collected: 'cod_collected',
    };

    const templateKey = templateMap[event];
    if (!templateKey) return null;

    return this.send('sms', 'merchant', merchant, templateKey, baseVariables, {
      related_type: 'merchant',
      related_id: merchant._id,
    });
  }

  /**
   * Send system alerts
   */
  async sendSystemAlert(recipient, alertType, variables = {}) {
    const templateMap = {
      gps_dark: 'gps_dark_alert',
      cod_overdue: 'cod_overdue_alert',
      low_riders: 'low_rider_count',
      daily_report: 'daily_summary',
    };

    const templateKey = templateMap[alertType];
    if (!templateKey) return null;

    return this.send('sms', 'system', recipient, templateKey, variables, {
      priority: 'high',
    });
  }
}

module.exports = new NotificationService();
