import { useState, useEffect } from "react";
import Header from "../components/Header";
import AppLoader from "../components/AppLoader";
import { CustomSelect } from "../components/ui/custom-select";
import { toast } from "sonner";
import {
  BellIcon,
  PlusIcon,
  SearchIcon,
  FilterIcon,
  MessageSquareIcon,
  MailIcon,
  SmartphoneIcon,
  SendIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  TrashIcon,
  EyeIcon,
} from "lucide-react";
import { notificationApi } from "../lib/api";

interface Notification {
  _id: string;
  type: 'in_app' | 'sms' | 'whatsapp' | 'email' | 'push';
  category: string;
  recipient_id?: string;
  recipient_phone?: string;
  recipient_email?: string;
  template_key: string;
  variables?: Record<string, any>;
  message: string;
  subject?: string;
  status: 'pending' | 'queued' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  priority: 'high' | 'normal' | 'low';
  createdAt: string;
  sent_at?: string;
  delivered_at?: string;
  failed_at?: string;
  failure_reason?: string;
  provider_response?: Record<string, any>;
  metadata?: Record<string, any>;
  related_type?: string;
  related_id?: string;
  sent_by?: {
    name: string;
    full_name?: string;
    email: string;
  };
}

const statusConfig = {
  pending: { icon: ClockIcon, color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Pending' },
  queued: { icon: ClockIcon, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Queued' },
  sent: { icon: CheckCircleIcon, color: 'text-green-500', bg: 'bg-green-50', label: 'Sent' },
  delivered: { icon: CheckCircleIcon, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Delivered' },
  failed: { icon: XCircleIcon, color: 'text-red-500', bg: 'bg-red-50', label: 'Failed' },
  cancelled: { icon: XCircleIcon, color: 'text-gray-500', bg: 'bg-gray-50', label: 'Cancelled' },
};

const typeConfig = {
  in_app: { icon: BellIcon, color: 'text-amber-500', label: 'In-app' },
  sms: { icon: MessageSquareIcon, color: 'text-blue-500', label: 'SMS' },
  whatsapp: { icon: MessageSquareIcon, color: 'text-green-500', label: 'WhatsApp' },
  email: { icon: MailIcon, color: 'text-purple-500', label: 'Email' },
  push: { icon: SmartphoneIcon, color: 'text-orange-500', label: 'Push' },
};

const categoryOptions = [
  { value: "system", label: "System" },
  { value: "order_dispatch", label: "Order Dispatch" },
  { value: "delay", label: "Delay" },
  { value: "cod", label: "COD" },
  { value: "rider", label: "Rider" },
  { value: "daily_report", label: "Daily Report" },
  { value: "merchant", label: "Merchant" },
];

const templateOptionsByType: Record<Notification["type"], { value: string; label: string }[]> = {
  in_app: [
    { value: "system_alert", label: "System alert" },
    { value: "order_assigned", label: "Order assigned" },
    { value: "order_picked_up", label: "Order picked up" },
    { value: "out_for_delivery", label: "Out for delivery" },
    { value: "order_delivered", label: "Order delivered" },
    { value: "order_failed", label: "Order failed" },
    { value: "order_returned", label: "Order returned" },
    { value: "merchant_kyc_submitted", label: "Merchant KYC submitted" },
    { value: "merchant_kyc_approved", label: "Merchant KYC approved" },
    { value: "merchant_kyc_rejected", label: "Merchant KYC rejected" },
  ],
  sms: [
    { value: "system_alert", label: "System alert" },
    { value: "order_assigned", label: "Order assigned" },
    { value: "order_picked_up", label: "Order picked up" },
    { value: "order_at_hub", label: "Order at hub" },
    { value: "out_for_delivery", label: "Out for delivery" },
    { value: "order_delivered", label: "Order delivered" },
    { value: "order_failed", label: "Order failed" },
    { value: "order_update", label: "Order update" },
  ],
  whatsapp: [
    { value: "system_alert", label: "System alert" },
    { value: "order_assigned", label: "Order assigned" },
    { value: "order_picked_up", label: "Order picked up" },
    { value: "out_for_delivery", label: "Out for delivery" },
    { value: "order_delivered", label: "Order delivered" },
    { value: "order_failed", label: "Order failed" },
    { value: "delay_alert", label: "Delay alert" },
    { value: "daily_report", label: "Daily report" },
  ],
  email: [
    { value: "system_alert", label: "System alert" },
    { value: "order_assigned", label: "Order assigned" },
    { value: "order_delivered", label: "Order delivered" },
    { value: "delay_notification", label: "Delay notification" },
    { value: "cod_collected", label: "COD collected" },
    { value: "rider_daily_report", label: "Rider daily report" },
    { value: "daily_summary", label: "Daily summary" },
  ],
  push: [
    { value: "system_alert", label: "System alert" },
    { value: "order_assigned", label: "Order assigned" },
    { value: "order_delivered", label: "Order delivered" },
    { value: "delay_alert", label: "Delay alert" },
    { value: "new_route", label: "New route" },
    { value: "daily_report", label: "Daily report" },
  ],
};

const defaultNotificationForm = () => ({
  type: 'sms' as Notification["type"],
  category: 'system',
  recipient_id: '',
  recipient_phone: '',
  recipient_email: '',
  recipient_fcm_token: '',
  template_key: 'system_alert',
  variables: { message: 'Test notification from Wolan.' },
  priority: 'normal' as Notification["priority"],
});

const objectIdPattern = /^[a-f\d]{24}$/i;

const normalizePhoneForSubmit = (value = "") => {
  const raw = value.trim();
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
};

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  // Form state for creating notifications
  const [formData, setFormData] = useState<{
    type: 'in_app' | 'sms' | 'whatsapp' | 'email' | 'push';
    category: string;
    recipient_id: string;
    recipient_phone?: string;
    recipient_email?: string;
    recipient_fcm_token?: string;
    template_key: string;
    variables: Record<string, any>;
    priority: 'high' | 'normal' | 'low';
  }>(defaultNotificationForm());

  useEffect(() => {
    loadNotifications();
  }, [statusFilter, typeFilter]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;

      const response = await notificationApi.getNotifications(params);
      setNotifications(response.data?.data?.notifications || response.data?.notifications || []);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNotification = async () => {
    try {
      if (!formData.category) {
        toast.error('Choose a notification category');
        return;
      }

      if (!formData.template_key) {
        toast.error('Choose a notification template');
        return;
      }

      if ((formData.type === 'in_app' || formData.type === 'push') && !objectIdPattern.test(formData.recipient_id.trim())) {
        toast.error('Account recipient ID must be a valid app user ObjectId for in-app or push notifications');
        return;
      }

      const recipientPhone = normalizePhoneForSubmit(formData.recipient_phone || '');
      if ((formData.type === 'sms' || formData.type === 'whatsapp') && !/^\+[1-9]\d{7,14}$/.test(recipientPhone)) {
        toast.error('Enter a valid phone number in international format, e.g. +256761253001');
        return;
      }

      if (formData.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.recipient_email || '')) {
        toast.error('Enter a valid email address');
        return;
      }

      const payload = {
        ...formData,
        recipient_id: (formData.type === 'in_app' || formData.type === 'push') ? formData.recipient_id.trim() : undefined,
        recipient_phone: (formData.type === 'sms' || formData.type === 'whatsapp') ? recipientPhone : undefined,
        recipient_email: formData.type === 'email' ? formData.recipient_email?.trim() : undefined,
        recipient_fcm_token: formData.type === 'push' ? formData.recipient_fcm_token?.trim() : undefined,
      };

      await notificationApi.createNotification(payload);
      toast.success('Notification sent successfully');
      setShowCreateModal(false);
      setFormData(defaultNotificationForm());
      loadNotifications();
    } catch (error: any) {
      console.error('Failed to create notification:', error);
      toast.error(error.response?.data?.message || 'Failed to send notification');
    }
  };

  const handleRetryNotification = async (id: string) => {
    try {
      await notificationApi.retryNotification(id);
      toast.success('Notification retry initiated');
      loadNotifications();
    } catch (error) {
      console.error('Failed to retry notification:', error);
      toast.error('Failed to retry notification');
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification?')) return;

    try {
      await notificationApi.deleteNotification(id);
      toast.success('Notification deleted');
      loadNotifications();
    } catch (error) {
      console.error('Failed to delete notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = !searchTerm ||
      notification.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notification.recipient_phone?.includes(searchTerm) ||
      notification.recipient_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notification.recipient_id?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  return (
    <div data-cmp="Notifications" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <Header title="Notifications" subtitle="Manage and monitor notification delivery" />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Filters Sidebar */}
        <div className="max-h-64 w-full min-w-0 flex-shrink-0 overflow-y-auto overscroll-contain border-b border-border bg-card lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <BellIcon className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">Filters</span>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search notifications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-input rounded-lg border border-border focus:border-primary transition-colors"
              />
            </div>

            {/* Status Filter */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-2 block">Status</label>
              <CustomSelect
                value={statusFilter}
                onValueChange={setStatusFilter}
                placeholder="All Statuses"
                ariaLabel="Notification status filter"
                options={[
                  { value: "", label: "All Statuses" },
                  { value: "pending", label: "Pending" },
                  { value: "queued", label: "Queued" },
                  { value: "sent", label: "Sent" },
                  { value: "delivered", label: "Delivered" },
                  { value: "failed", label: "Failed" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
                triggerClassName="h-10 rounded-lg"
              />
            </div>

            {/* Type Filter */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-2 block">Type</label>
              <CustomSelect
                value={typeFilter}
                onValueChange={setTypeFilter}
                placeholder="All Types"
                ariaLabel="Notification type filter"
                options={[
                  { value: "", label: "All Types" },
                  { value: "in_app", label: "In-app" },
                  { value: "sms", label: "SMS" },
                  { value: "whatsapp", label: "WhatsApp" },
                  { value: "email", label: "Email" },
                  { value: "push", label: "Push" },
                ]}
                triggerClassName="h-10 rounded-lg"
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-4">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full flex items-center gap-2 gradient-orange text-white text-xs font-semibold px-3 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
            >
              <PlusIcon className="w-4 h-4" />
              Send Notification
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border sm:p-6">
            <div>
              <h2 className="text-lg font-bold text-foreground">All Notifications</h2>
              <p className="text-sm text-muted-foreground">
                {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={loadNotifications}
              className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground text-sm rounded-lg hover:bg-accent transition-colors"
            >
              <RefreshCwIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Notifications List */}
          <div className="content-scroll flex-1">
            {loading ? (
              <AppLoader
                variant="panel"
                label="Loading notifications"
                subtitle="Fetching in-app, SMS, WhatsApp, and email notification records."
              />
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <BellIcon className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No notifications found</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {filteredNotifications.map((notification) => {
                  const statusInfo = statusConfig[notification.status] || statusConfig.pending;
                  const typeInfo = typeConfig[notification.type] || typeConfig.in_app;
                  const StatusIcon = statusInfo.icon;
                  const TypeIcon = typeInfo.icon;
                  const recipientLabel = notification.recipient_phone
                    || notification.recipient_email
                    || notification.recipient_id
                    || 'In-app recipient';

                  return (
                    <div
                      key={notification._id}
                      className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedNotification(notification)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${statusInfo.bg}`}>
                            <StatusIcon className={`w-4 h-4 ${statusInfo.color}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <TypeIcon className={`w-3 h-3 ${typeInfo.color}`} />
                              <span className="text-xs font-medium text-foreground capitalize">
                                {notification.category.replace('_', ' ')}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.bg} ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {recipientLabel}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {notification.status === 'failed' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryNotification(notification._id);
                              }}
                              className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                              title="Retry"
                            >
                              <RefreshCwIcon className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNotification(notification._id);
                            }}
                            className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="mb-2">
                        <p className="text-sm text-foreground line-clamp-2">
                          {notification.subject && <span className="font-medium">{notification.subject}: </span>}
                          {notification.message}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(notification.createdAt).toLocaleString()}</span>
                        {notification.sent_by && (
                          <span>Sent by {notification.sent_by.name || notification.sent_by.full_name}</span>
                        )}
                      </div>

                      {notification.failure_reason && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                          <strong>Failed:</strong> {notification.failure_reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Notification Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-[500px] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-4 shadow-custom sm:p-6 max-h-[80dvh]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <SendIcon className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Send Notification</h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Type</label>
                  <CustomSelect
                    value={formData.type}
                    onValueChange={(nextValue) => setFormData(prev => ({
                      ...prev,
                      type: nextValue as Notification["type"],
                      template_key: "system_alert",
                      category: "system",
                      recipient_id: "",
                      recipient_phone: "",
                      recipient_email: "",
                      recipient_fcm_token: "",
                      variables: { ...prev.variables, message: prev.variables?.message || "Test notification from Wolan." },
                    }))}
                    ariaLabel="Notification type"
                    options={[
                      { value: "in_app", label: "In-app" },
                      { value: "sms", label: "SMS" },
                      { value: "whatsapp", label: "WhatsApp" },
                      { value: "email", label: "Email" },
                      { value: "push", label: "Push Notification" },
                    ]}
                    triggerClassName="h-10 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Priority</label>
                  <CustomSelect
                    value={formData.priority}
                    onValueChange={(nextValue) => setFormData(prev => ({ ...prev, priority: nextValue as any }))}
                    ariaLabel="Notification priority"
                    options={[
                      { value: "low", label: "Low" },
                      { value: "normal", label: "Normal" },
                      { value: "high", label: "High" },
                    ]}
                    triggerClassName="h-10 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Category</label>
                <CustomSelect
                  value={formData.category}
                  onValueChange={(nextValue) => setFormData(prev => ({ ...prev, category: nextValue }))}
                  placeholder="Choose category"
                  ariaLabel="Notification category"
                  options={categoryOptions}
                  triggerClassName="h-10 rounded-lg"
                />
              </div>

              {(formData.type === 'in_app' || formData.type === 'push') && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Account Recipient ID</label>
                  <input
                    type="text"
                    value={formData.recipient_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, recipient_id: e.target.value }))}
                    placeholder="24-character user, rider, or merchant ObjectId"
                    className="w-full px-3 py-2.5 text-xs bg-input rounded-lg border border-border focus:border-primary"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Required only for in-app and push notifications.</p>
                </div>
              )}

              {(formData.type === 'sms' || formData.type === 'whatsapp') && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.recipient_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, recipient_phone: e.target.value }))}
                    placeholder="+256 XXX XXX XXX"
                    className="w-full px-3 py-2.5 text-xs bg-input rounded-lg border border-border focus:border-primary"
                  />
                </div>
              )}

              {(formData.type as string) === 'email' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Email Address</label>
                  <input
                    type="email"
                    value={formData.recipient_email}
                    onChange={(e) => setFormData(prev => ({ ...prev, recipient_email: e.target.value }))}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2.5 text-xs bg-input rounded-lg border border-border focus:border-primary"
                  />
                </div>
              )}

              {formData.type === 'push' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">FCM Token (Optional)</label>
                  <input
                    type="text"
                    value={formData.recipient_fcm_token}
                    onChange={(e) => setFormData(prev => ({ ...prev, recipient_fcm_token: e.target.value }))}
                    placeholder="Firebase device token when provider is configured"
                    className="w-full px-3 py-2.5 text-xs bg-input rounded-lg border border-border focus:border-primary"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Template Key</label>
                <CustomSelect
                  value={formData.template_key}
                  onValueChange={(nextValue) => setFormData(prev => ({ ...prev, template_key: nextValue }))}
                  placeholder="Choose template"
                  ariaLabel="Notification template"
                  options={templateOptionsByType[formData.type]}
                  triggerClassName="h-10 rounded-lg"
                />
              </div>

              {formData.template_key === "system_alert" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Message</label>
                  <textarea
                    value={String(formData.variables.message || "")}
                    onChange={(e) => setFormData(prev => ({ ...prev, variables: { ...prev.variables, message: e.target.value } }))}
                    placeholder="Type the message to send"
                    rows={3}
                    className="w-full px-3 py-2.5 text-xs bg-input rounded-lg border border-border focus:border-primary"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Variables (JSON)</label>
                <textarea
                  value={JSON.stringify(formData.variables, null, 2)}
                  onChange={(e) => {
                    try {
                      const variables = JSON.parse(e.target.value);
                      setFormData(prev => ({ ...prev, variables }));
                    } catch (error) {
                      // Invalid JSON, keep current value
                    }
                  }}
                  placeholder='{"order_id": "123", "rider_name": "John"}'
                  rows={3}
                  className="w-full px-3 py-2.5 text-xs bg-input rounded-lg border border-border focus:border-primary font-mono"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 bg-muted text-foreground text-sm font-medium py-2.5 rounded-lg hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNotification}
                className="flex-1 gradient-orange text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity"
              >
                Send Notification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Detail Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-[600px] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-4 shadow-custom sm:p-6 max-h-[80dvh]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <EyeIcon className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Notification Details</h2>
              </div>
              <button
                onClick={() => setSelectedNotification(null)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Type</label>
                  <p className="text-sm font-medium text-foreground capitalize">{selectedNotification.type}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Status</label>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${statusConfig[selectedNotification.status].bg} ${statusConfig[selectedNotification.status].color}`}>
                      {statusConfig[selectedNotification.status].label}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Category</label>
                  <p className="text-sm font-medium text-foreground capitalize">
                    {selectedNotification.category.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Priority</label>
                  <p className="text-sm font-medium text-foreground capitalize">{selectedNotification.priority}</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Recipient</label>
                <p className="text-sm text-foreground">
                  {selectedNotification.recipient_phone || selectedNotification.recipient_email || selectedNotification.recipient_id || 'In-app recipient'}
                </p>
              </div>

              {selectedNotification.subject && (
                <div>
                  <label className="text-xs text-muted-foreground">Subject</label>
                  <p className="text-sm font-medium text-foreground">{selectedNotification.subject}</p>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground">Message</label>
                <div className="bg-input rounded-lg p-3 mt-1">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{selectedNotification.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Created</label>
                  <p className="text-sm text-foreground">
                    {new Date(selectedNotification.createdAt).toLocaleString()}
                  </p>
                </div>
                {selectedNotification.sent_at && (
                  <div>
                    <label className="text-xs text-muted-foreground">Sent</label>
                    <p className="text-sm text-foreground">
                      {new Date(selectedNotification.sent_at).toLocaleString()}
                    </p>
                  </div>
                )}
                {selectedNotification.delivered_at && (
                  <div>
                    <label className="text-xs text-muted-foreground">Delivered</label>
                    <p className="text-sm text-foreground">
                      {new Date(selectedNotification.delivered_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {selectedNotification.related_type && (
                <div>
                  <label className="text-xs text-muted-foreground">Related</label>
                  <p className="text-sm text-foreground">
                    {selectedNotification.related_type}
                    {selectedNotification.related_id ? ` - ${selectedNotification.related_id}` : ''}
                  </p>
                </div>
              )}

              {selectedNotification.sent_by && (
                <div>
                  <label className="text-xs text-muted-foreground">Sent By</label>
                  <p className="text-sm text-foreground">
                    {selectedNotification.sent_by.name || selectedNotification.sent_by.full_name}
                  </p>
                </div>
              )}

              {selectedNotification.provider_response && (
                <div>
                  <label className="text-xs text-muted-foreground">Provider Response</label>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-input p-3 text-xs text-foreground">
                    {JSON.stringify(selectedNotification.provider_response, null, 2)}
                  </pre>
                </div>
              )}

              {selectedNotification.metadata && Object.keys(selectedNotification.metadata).length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground">Metadata</label>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-input p-3 text-xs text-foreground">
                    {JSON.stringify(selectedNotification.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {selectedNotification.failure_reason && (
                <div>
                  <label className="text-xs text-muted-foreground">Failure Reason</label>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-1">
                    <p className="text-sm text-red-700">{selectedNotification.failure_reason}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              {selectedNotification.status === 'failed' && (
                <button
                  onClick={() => {
                    handleRetryNotification(selectedNotification._id);
                    setSelectedNotification(null);
                  }}
                  className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Retry Notification
                </button>
              )}
              <button
                onClick={() => setSelectedNotification(null)}
                className="flex-1 bg-muted text-foreground text-sm font-medium py-2.5 rounded-lg hover:bg-accent transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
