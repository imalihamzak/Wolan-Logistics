// src/lib/api.ts

import axios from "axios";
import { getDeviceSecurityHeaders } from "./deviceSecurity";

const normalizeConfiguredUrl = (value: string) => value
  .trim()
  .replace(/^https\/\//i, 'https://')
  .replace(/^http\/\//i, 'http://')
  .replace(/([^:/])\/+/g, '$1/');

const rawBaseURL = import.meta.env.VITE_API_URL || '/api/v1';
const baseURL = normalizeConfiguredUrl(rawBaseURL);

const accountTypeForCurrentSession = () => {
  const accountType = localStorage.getItem('authAccountType');
  if (accountType === 'merchant' || accountType === 'driver' || accountType === 'staff') {
    return accountType;
  }

  const pathname = window.location.pathname;
  if (pathname.startsWith('/merchant')) return 'merchant';
  if (pathname.startsWith('/driver')) return 'driver';

  return 'staff';
};

const loginPathForStoredAccount = () => {
  const accountType = accountTypeForCurrentSession();
  if (accountType === 'merchant') return '/merchant-login';
  if (accountType === 'driver') return '/driver-login';
  return '/login';
};

const clearStoredSession = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('authAccountType');
  delete api.defaults.headers.common.Authorization;
};

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const deviceHeaders = getDeviceSecurityHeaders();
  Object.entries(deviceHeaders).forEach(([key, value]) => {
    config.headers[key] = value;
  });
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || '';
    const accountType = accountTypeForCurrentSession();
    const isMerchantSession = accountType === 'merchant';
    const loginPath = loginPathForStoredAccount();
    const storedAccessToken = localStorage.getItem('accessToken');
    const storedAccountType = localStorage.getItem('authAccountType');
    const requestHadBearer = Boolean(originalRequest?.headers?.Authorization || originalRequest?.headers?.authorization);
    const hasOAuthRedirect = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).has('oauth');
    const hasRefreshCandidate = Boolean(storedAccessToken || storedAccountType || requestHadBearer || hasOAuthRedirect);
    const authFragments = [
      '/auth/login',
      '/auth/logout',
      '/auth/refresh-token',
      '/auth/register',
      '/auth/send-otp',
      '/auth/verify-otp',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/google',
      '/auth/merchants/login',
      '/auth/merchants/logout',
      '/auth/merchants/refresh-token',
      '/auth/merchants/register',
      '/auth/merchants/send-otp',
      '/auth/merchants/verify-otp',
      '/auth/merchants/forgot-password',
      '/auth/merchants/reset-password',
    ];
    const isAuthEndpoint = authFragments.some((fragment) => requestUrl.includes(fragment));

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint && hasRefreshCandidate) {
      originalRequest._retry = true;
      try {
        const refreshEndpoint = isMerchantSession ? '/auth/merchants/refresh-token' : '/auth/refresh-token';
        const { data } = await api.post(refreshEndpoint, {}, { withCredentials: true });
        const refreshedToken = data.accessToken || data.data?.accessToken;
        if (!refreshedToken) {
          throw new Error('Missing refreshed access token');
        }

        localStorage.setItem('accessToken', refreshedToken);
        originalRequest.headers.Authorization = `Bearer ${refreshedToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        clearStoredSession();
        window.location.href = loginPath;
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Notification API functions
export const notificationApi = {
  // Get notifications with filtering
  getNotifications: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    category?: string;
  }) => api.get('/auth/notifications', { params }),

  // Get single notification
  getNotification: (id: string) => api.get(`/auth/notifications/${id}`),

  // Create notification
  createNotification: (data: {
    type: 'in_app' | 'sms' | 'whatsapp' | 'email' | 'push';
    category: string;
    recipient_id?: string;
    recipient_phone?: string;
    recipient_email?: string;
    recipient_fcm_token?: string;
    template_key: string;
    variables?: Record<string, any>;
    priority?: 'high' | 'normal' | 'low';
    scheduled_at?: string;
    related_type?: string;
    related_id?: string;
  }) => api.post('/auth/notifications', data),

  // Bulk create notifications
  bulkCreateNotifications: (data: { notifications: any[] }) =>
    api.post('/auth/notifications/bulk', data),

  // Update notification status
  updateNotificationStatus: (id: string, status: string, failure_reason?: string) =>
    api.patch(`/auth/notifications/${id}/status`, { status, failure_reason }),

  // Retry failed notification
  retryNotification: (id: string) => api.post(`/auth/notifications/${id}/retry`),

  // Delete notification
  deleteNotification: (id: string) => api.delete(`/auth/notifications/${id}`),

  // Get notification statistics
  getNotificationStats: (params?: { start_date?: string; end_date?: string }) =>
    api.get('/auth/notifications/stats', { params }),
};

