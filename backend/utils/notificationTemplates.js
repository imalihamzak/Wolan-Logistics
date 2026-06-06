/**
 * Notification Templates
 * Centralized template storage for all notification types
 */

const templates = {
  // ========== IN-APP TEMPLATES ==========
  in_app: {
    system_alert: {
      subject: 'Wolan notification',
      template: '{message}',
      description: 'Generic in-app notification for manual admin testing',
    },
    order_assigned: {
      subject: 'Order assigned',
      template: 'Order {order_id} has been assigned to {rider_name}.',
      description: 'In-app order assignment notification',
    },
    order_picked_up: {
      subject: 'Order picked up',
      template: 'Order {order_id} was picked up by {rider_name}.',
      description: 'In-app pickup notification',
    },
    out_for_delivery: {
      subject: 'Order out for delivery',
      template: 'Order {order_id} is out for delivery with {rider_name}.',
      description: 'In-app dispatch notification',
    },
    order_delivered: {
      subject: 'Order delivered',
      template: 'Order {order_id} was delivered successfully.',
      description: 'In-app completion notification',
    },
    order_failed: {
      subject: 'Delivery failed',
      template: 'Order {order_id} delivery failed. Reason: {failed_reason}',
      description: 'In-app failed delivery notification',
    },
    order_returned: {
      subject: 'Order returned',
      template: 'Order {order_id} was returned to merchant. Reason: {return_reason}',
      description: 'In-app return notification',
    },
    merchant_kyc_submitted: {
      subject: 'Merchant KYC pending review',
      template: '{merchant_name} submitted merchant KYC for admin review.',
      description: 'Admin alert when a merchant submits KYC documents',
    },
    merchant_kyc_approved: {
      subject: 'Merchant KYC approved',
      template: '{merchant_name}, your merchant verification is approved. Order creation is now unlocked.',
      description: 'Merchant alert when KYC is approved',
    },
    merchant_kyc_rejected: {
      subject: 'Merchant KYC rejected',
      template: '{merchant_name}, your merchant verification was rejected. Reason: {rejection_reason}. Upload corrected documents to resubmit.',
      description: 'Merchant alert when KYC is rejected',
    },
  },

  // ========== SMS TEMPLATES ==========
  sms: {
    system_alert: {
      template: 'Wolan: {message}',
      description: 'Generic SMS notification for manual admin testing',
    },
    // Order Dispatch Alerts
    order_assigned: {
      template: 'Your order {order_id} has been assigned to {rider_name}. Track: {tracking_url}',
      description: 'Order assigned to rider',
    },
    order_picked_up: {
      template: 'Order {order_id} picked up by {rider_name}. ETA: {eta}',
      description: 'Order picked up from merchant',
    },
    order_at_hub: {
      template: 'Your order {order_id} has arrived at {hub_name} hub.',
      description: 'Order arrived at hub',
    },
    out_for_delivery: {
      template: 'Your order {order_id} is out for delivery by {rider_name}. Phone: {rider_phone}',
      description: 'Out for delivery',
    },
    order_delivered: {
      template: 'Order {order_id} delivered successfully! Thank you for choosing Wolan.',
      description: 'Order delivered',
    },
    order_failed: {
      template: 'Delivery failed for order {order_id}. Reason: {failed_reason}. Wolan support will follow up.',
      description: 'Order delivery failed',
    },

    // OTP Notifications
    otp_sent: {
      template: 'Your delivery OTP for order {order_id} is {otp}. Share only with delivery person.',
      description: 'OTP for delivery',
    },
    login_otp: {
      template: 'Your Wolan driver login OTP is {otp}. It expires in 10 minutes.',
      description: 'Driver login OTP',
    },
    auth_otp: {
      template: 'Your Wolan {account_type} {purpose} OTP is {otp}. It expires in {expires_minutes} minutes.',
      description: 'Phone authentication OTP',
    },

    // Delay Alerts
    delay_notification: {
      template: 'Delay alert: Your order {order_id} will be delayed by {delay_minutes} mins. We apologize for inconvenience.',
      description: 'Delivery delay notification',
    },

    // COD Alerts
    cod_collect: {
      template: 'Collect ₹{cod_amount} from delivery person for order {order_id}.',
      description: 'COD collection',
    },
    cod_collected: {
      template: 'COD of ₹{cod_amount} collected for order {order_id}. Ref: {transaction_id}',
      description: 'COD collected confirmation',
    },

    // Rider Alerts
    new_route_assigned: {
      template: 'New route assigned! {order_count} orders for {delivery_zone}. Start your route in app.',
      description: 'New delivery route',
    },
    rider_login: {
      template: 'Welcome {rider_name}! You have {pending_orders} pending orders.',
      description: 'Rider login notification',
    },
    rider_payout: {
      template: 'Payout of ₹{amount} credited. Deliveries: {delivery_count}, Bonus: ₹{bonus}',
      description: 'Rider payout notification',
    },

    // Daily Reports
    daily_summary: {
      template: 'Daily Report: {delivered} delivered, {failed} failed, {returned} returned. Earnings: ₹{earnings}',
      description: 'Daily delivery summary',
    },

    // Merchant Notifications
    order_created: {
      template: 'New order {order_id} created. Items: {item_description}. COD: ₹{cod_amount}',
      description: 'New order for merchant',
    },
    order_update: {
      template: 'Order {order_id} status: {order_status}. Track: {tracking_url}',
      description: 'Order status update',
    },
  },

  // ========== WHATSAPP TEMPLATES ==========
  whatsapp: {
    system_alert: {
      template: `*Wolan Logistics*\n\n{message}`,
      description: 'Generic WhatsApp notification for manual admin testing',
    },
    order_assigned: {
      template: `*Wolan Logistics*\n\n📦 Order {order_id} assigned to rider\n\nDriver: {rider_name}\nTrack: {tracking_url}`,
      description: 'Order assigned to rider',
    },
    order_delivered: {
      template: `*Wolan Logistics*\n\n✅ Order {order_id} Delivered!\n\nThank you for choosing Wolan.`,
      description: 'Order delivered confirmation',
    },
    order_picked_up: {
      template: `*Wolan Logistics*\n\nOrder {order_id} has been picked up by {rider_name}.\nETA: {eta}`,
      description: 'Order picked up from merchant',
    },
    out_for_delivery: {
      template: `*Wolan Logistics*\n\nOrder {order_id} is out for delivery.\nDriver: {rider_name}\nPhone: {rider_phone}`,
      description: 'Out for delivery',
    },
    order_failed: {
      template: `*Wolan Logistics*\n\nDelivery failed for order {order_id}.\nReason: {failed_reason}`,
      description: 'Order delivery failed',
    },
    otp_verification: {
      template: `*Wolan Delivery OTP*\n\nYour verification code: *{otp}*\n\nShare with delivery person only.`,
      description: 'OTP for verification',
    },
    delay_alert: {
      template: `*Delay Notice*\n\nYour order {order_id} is delayed by {delay_minutes} mins.\n\nWe apologize for the inconvenience.`,
      description: 'Delivery delay',
    },
    daily_report: {
      template: `*Daily Report - {date}*\n\n✅ Delivered: {delivered}\n❌ Failed: {failed}\n↩️ Returned: {returned}\n\n💰 Earnings: ₹{earnings}\n📦 Pending: {pending}`,
      description: 'Daily report for rider',
    },
  },

  // ========== EMAIL TEMPLATES ==========
  email: {
    system_alert: {
      subject: 'Wolan Notification',
      template: `
        <h2>Wolan Notification</h2>
        <p>{message}</p>
      `,
      description: 'Generic email notification for manual admin testing',
    },
    // Order Dispatch
    order_assigned: {
      subject: 'Order {order_id} Assigned - Wolan Logistics',
      template: `
        <h2>Order Assigned</h2>
        <p>Dear {recipient_name},</p>
        <p>Your order has been assigned to a rider.</p>
        <table>
          <tr><td><strong>Order ID</strong></td><td>{order_id}</td></tr>
          <tr><td><strong>Rider</strong></td><td>{rider_name}</td></tr>
          <tr><td><strong>Phone</strong></td><td>{rider_phone}</td></tr>
          <tr><td><strong>ETA</strong></td><td>{eta}</td></tr>
        </table>
        <p>Track your order: <a href="{tracking_url}">{tracking_url}</a></p>
        <p>Thank you,<br>Wolan Logistics</p>
      `,
    },
    order_delivered: {
      subject: 'Order {order_id} Delivered - Wolan Logistics',
      template: `
        <h2>Order Delivered ✓</h2>
        <p>Dear {recipient_name},</p>
        <p>Your order has been delivered successfully.</p>
        <table>
          <tr><td><strong>Order ID</strong></td><td>{order_id}</td></tr>
          <tr><td><strong>Delivered At</strong></td><td>{delivered_at}</td></tr>
        </table>
        <p>Thank you for choosing Wolan Logistics!</p>
      `,
    },
    otp_verification: {
      subject: 'Delivery OTP - Wolan Logistics',
      template: `
        <h2>Delivery Verification Code</h2>
        <p>Dear {recipient_name},</p>
        <p>Your verification code is:</p>
        <h1 style="font-size: 32px; letter-spacing: 5px;">{otp}</h1>
        <p>Share this only with the delivery person.</p>
        <p>Order ID: {order_id}</p>
      `,
    },
    delay_notification: {
      subject: 'Delay Notice - Order {order_id}',
      template: `
        <h2>Delivery Delay Notice</h2>
        <p>Dear {recipient_name},</p>
        <p>We regret to inform you that your order delivery is delayed.</p>
        <table>
          <tr><td><strong>Order ID</strong></td><td>{order_id}</td></tr>
          <tr><td><strong>Expected Delay</strong></td><td>{delay_minutes} minutes</td></tr>
          <tr><td><strong>Reason</strong></td><td>{reason}</td></tr>
        </table>
        <p>We apologize for the inconvenience.</p>
      `,
    },
    cod_collected: {
      subject: 'COD Collected - Order {order_id}',
      template: `
        <h2>COD Collected</h2>
        <p>Dear Merchant,</p>
        <p>Cash on Delivery collected for order {order_id}.</p>
        <table>
          <tr><td><strong>Amount</strong></td><td>₹{cod_amount}</td></tr>
          <tr><td><strong>Transaction ID</strong></td><td>{transaction_id}</td></tr>
        </table>
      `,
    },
    rider_daily_report: {
      subject: 'Daily Report - {date}',
      template: `
        <h2>Daily Performance Report</h2>
        <p>Dear {rider_name},</p>
        <table>
          <tr><td><strong>Date</strong></td><td>{date}</td></tr>
          <tr><td><strong>Delivered</strong></td><td>{delivered}</td></tr>
          <tr><td><strong>Failed</strong></td><td>{failed}</td></tr>
          <tr><td><strong>Returned</strong></td><td>{returned}</td></tr>
        </table>
        <h3>Earnings</h3>
        <table>
          <tr><td><strong>Delivery Charges</strong></td><td>₹{delivery_charges}</td></tr>
          <tr><td><strong>Bonus</strong></td><td>₹{bonus}</td></tr>
          <tr><td><strong>Total</strong></td><td>₹{total}</td></tr>
        </table>
      `,
    },
    daily_summary: {
      subject: 'Daily Summary - {date}',
      template: `
        <h2>{hub_name} - Daily Summary</h2>
        <table>
          <tr><td><strong>Total Orders</strong></td><td>{total_orders}</td></tr>
          <tr><td><strong>Delivered</strong></td><td>{delivered}</td></tr>
          <tr><td><strong>Failed</strong></td><td>{failed}</td></tr>
          <tr><td><strong>Pending</strong></td><td>{pending}</td></tr>
        </table>
        <h3>Revenue</h3>
        <table>
          <tr><td><strong>Delivery Revenue</strong></td><td>₹{revenue}</td></tr>
          <tr><td><strong>COD Collected</strong></td><td>₹{cod_collected}</td></tr>
        </table>
      `,
    },
  },

  // ========== PUSH NOTIFICATION TEMPLATES ==========
  push: {
    system_alert: {
      title: 'Wolan Notification',
      body: '{message}',
      description: 'Generic push notification for manual admin testing',
    },
    order_assigned: {
      title: 'New Order Assigned',
      body: 'Order {order_id} assigned. Tap to view details.',
      description: 'Order dispatch notification',
    },
    order_delivered: {
      title: '✓ Order Delivered',
      body: 'Order {order_id} delivered successfully!',
      description: 'Delivery confirmation',
    },
    otp_received: {
      title: 'OTP Received',
      body: 'Verify delivery with code: {otp}',
      description: 'OTP for delivery',
    },
    delay_alert: {
      title: 'Delivery Delay',
      body: 'Order {order_id} delayed by {delay_minutes} mins',
      description: 'Delay notification',
    },
    new_route: {
      title: 'New Route Available',
      body: '{order_count} orders ready for delivery',
      description: 'New route for rider',
    },
    daily_report: {
      title: 'Daily Report Ready',
      body: '{delivered} delivered. Earnings: ₹{earnings}',
      description: 'Daily earnings',
    },
  },
};

/**
 * Get template by type and key
 */
const getTemplate = (type, key) => {
  return templates[type]?.[key] || null;
};

/**
 * Get template and interpolate variables
 */
const renderTemplate = (type, key, variables = {}) => {
  const template = getTemplate(type, key);
  if (!template) {
    return null;
  }

  let content = template.template || template.body || template;
  let subject = template.subject || template.title || '';

  // Replace variables in format {variable_name}
  Object.keys(variables).forEach((variable) => {
    const regex = new RegExp(`{${variable}}`, 'g');
    content = content.replace(regex, variables[variable]);
    subject = subject.replace(regex, variables[variable]);
  });

  return {
    ...template,
    message: content,
    subject,
  };
};

/**
 * Get available template keys for a channel
 */
const getTemplateKeys = (type) => {
  return Object.keys(templates[type] || {});
};

/**
 * Get all templates for a category
 */
const getTemplatesByCategory = (category) => {
  const keys = Object.keys(templates);
  const results = {};

keys.forEach((channel) => {
    results[channel] = Object.keys(templates[channel])
      .filter((key) => key.startsWith(category))
      .reduce((acc, key) => {
        acc[key] = templates[channel][key];
        return acc;
      }, {});

    if (Object.keys(results[channel]).length === 0) {
      delete results[channel];
    }
  });

  return results;
};

/**
 * All notification categories
 */
const NOTIFICATION_CATEGORIES = {
  ORDER_DISPATCH: 'order_',
  OTP: 'otp_',
  DELAY: 'delay_',
  COD: 'cod_',
  RIDER: 'rider_',
  DAILY_REPORT: 'daily_',
  MERCHANT: 'merchant_',
  SYSTEM: 'system_',
};

/**
 * Channel types
 */
const NOTIFICATION_CHANNELS = {
  IN_APP: 'in_app',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  PUSH: 'push',
};

/**
 * Priority levels
 */
const NOTIFICATION_PRIORITY = {
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
};

/**
 * Status types
 */
const NOTIFICATION_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

module.exports = {
  templates,
  getTemplate,
  renderTemplate,
  getTemplateKeys,
  getTemplatesByCategory,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITY,
  NOTIFICATION_STATUS,
};
