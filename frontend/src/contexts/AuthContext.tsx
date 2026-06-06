import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

import { toast } from 'sonner';
import api from '../lib/api';

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  hub_id?: string;
  assigned_hub_ids?: string[];
  phone?: string;
  profile_image?: string;
  is_active: boolean;
  kyc_status?: 'unverified' | 'not_submitted' | 'pending' | 'pending_review' | 'verified' | 'rejected';
  kyc_rejection_reason?: string | null;
  account_locked?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, accountType?: 'staff' | 'merchant' | 'driver') => Promise<void>;
  loginWithOtp: (phone: string, otp: string, accountType: 'merchant' | 'driver') => Promise<void>;
  registerWithPhone: (accountType: 'merchant' | 'driver', payload: Record<string, any>) => Promise<any>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOGOUT_MARKER_KEY = 'wolanLogoutAt';
const LOGOUT_MARKER_TTL_MS = 30000;

const markLogoutInProgress = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(LOGOUT_MARKER_KEY, String(Date.now()));
};

const clearLogoutMarker = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(LOGOUT_MARKER_KEY);
};

const logoutMarkerIsFresh = () => {
  if (typeof window === 'undefined') return false;
  const logoutAt = Number(sessionStorage.getItem(LOGOUT_MARKER_KEY) || 0);
  if (!logoutAt) return false;

  const isFresh = Date.now() - logoutAt < LOGOUT_MARKER_TTL_MS;
  if (!isFresh) {
    clearLogoutMarker();
  }
  return isFresh;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    const hasOAuthRedirect = params.has('oauth');
    const oauthCode = params.get('oauth_code');
    const oauthAccount = params.get('account');

    if (hasOAuthRedirect) {
      clearLogoutMarker();
      localStorage.removeItem('accessToken');
      localStorage.removeItem('authAccountType');
      delete api.defaults.headers.common.Authorization;
      if (oauthCode) {
        exchangeOAuthSession(oauthCode, oauthAccount, { cleanOAuthQuery: true });
        return;
      }
      restoreCookieSession({ cleanOAuthQuery: true });
      return;
    }

    if (logoutMarkerIsFresh()) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('authAccountType');
      delete api.defaults.headers.common.Authorization;
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }

    const savedToken = localStorage.getItem('accessToken');

    if (savedToken) {
      setToken(savedToken);

      api.defaults.headers.common[
        'Authorization'
      ] = `Bearer ${savedToken}`;

      fetchUser();
    } else {
      restoreCookieSession();
    }
  }, []);

  const accountTypeForRole = (role?: string) => {
    if (role === 'merchant') return 'merchant';
    if (role === 'rider') return 'driver';
    return 'staff';
  };

  const accountTypeForCurrentSession = () => {
    const storedAccountType = localStorage.getItem('authAccountType');
    if (storedAccountType === 'merchant' || storedAccountType === 'driver' || storedAccountType === 'staff') {
      return storedAccountType;
    }

    const pathname = window.location.pathname;
    if (pathname.startsWith('/merchant')) return 'merchant';
    if (pathname.startsWith('/driver')) return 'driver';
    return 'staff';
  };

  const meEndpointForAccountType = (accountType: string | null) => (
    accountType === 'merchant' ? '/auth/merchants/me' : '/auth/me'
  );

  const normalizeAuthResponse = (data: any) => {
    const merchantData = data.merchant || data.data?.merchant;
    const userData = data.user || data.data?.user;

    return merchantData
        ? {
          id: merchantData.id,
          full_name: merchantData.shop_name || merchantData.merchant_name,
          email: merchantData.email,
          role: 'merchant',
          hub_id: merchantData.hub_id,
          phone: merchantData.phone,
          profile_image: undefined,
          is_active: merchantData.status === 'active',
          kyc_status: merchantData.kyc_status,
          kyc_rejection_reason: merchantData.kyc_rejection_reason,
          account_locked: merchantData.account_locked,
        }
        : userData || null;
  };

  const applyUserSession = (data: any) => {
    const nextUser = normalizeAuthResponse(data);
    setUser(nextUser);
    if (nextUser?.role) {
      localStorage.setItem('authAccountType', accountTypeForRole(nextUser.role));
    }
    return nextUser;
  };

  const cleanOAuthQueryString = () => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (!params.has('oauth')) return;

    params.delete('oauth');
    params.delete('account');
    params.delete('oauth_code');
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  };

  const exchangeOAuthSession = async (
    code: string,
    account: string | null,
    options: { cleanOAuthQuery?: boolean } = {}
  ) => {
    setLoading(true);
    try {
      const accountType = account === 'merchant' || account === 'driver' || account === 'staff'
        ? account
        : accountTypeForCurrentSession();
      const { data } = await api.post('/auth/google/session', { code, account: accountType });
      applyAuthSession(data.data || data, accountType);
      if (options.cleanOAuthQuery) {
        cleanOAuthQueryString();
      }
    } catch (error: any) {
      setUser(null);
      setToken(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('authAccountType');
      toast.error(error.response?.data?.message || 'Google login session expired. Please sign in again.');
      if (options.cleanOAuthQuery) {
        cleanOAuthQueryString();
      }
    } finally {
      setLoading(false);
    }
  };

  const restoreCookieSession = async (options: { cleanOAuthQuery?: boolean } = {}) => {
    if (logoutMarkerIsFresh()) {
      setUser(null);
      setToken(null);
      setLoading(false);
      if (options.cleanOAuthQuery) {
        cleanOAuthQueryString();
      }
      return;
    }

    try {
      const accountType = accountTypeForCurrentSession();
      const { data } = await api.get(meEndpointForAccountType(accountType));
      applyUserSession(data);
      if (options.cleanOAuthQuery) {
        cleanOAuthQueryString();
      }
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchUser = async () => {
    try {
      const accountType = accountTypeForCurrentSession();
      const { data } = await api.get(meEndpointForAccountType(accountType));
      applyUserSession(data);
    } catch (error: any) {
      logout();
    } finally {
      setLoading(false);
    }
  };

  const applyAuthSession = (data: any, accountType: 'staff' | 'merchant' | 'driver') => {
    const accessToken =
      data.accessToken || data.token || data.data?.accessToken;

    const merchantData = data.merchant || data.data?.merchant;
    const userData = data.user || data.data?.user || (merchantData
      ? {
        id: merchantData.id,
        full_name: merchantData.shop_name || merchantData.merchant_name,
        email: merchantData.email,
        role: 'merchant',
        hub_id: merchantData.hub_id,
        phone: merchantData.phone,
        is_active: merchantData.status === 'active',
        kyc_status: merchantData.kyc_status,
        kyc_rejection_reason: merchantData.kyc_rejection_reason,
        account_locked: merchantData.account_locked,
      }
      : null);

    if (!accessToken) {
      throw new Error('Access token missing');
    }

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('authAccountType', accountType);
    clearLogoutMarker();

    setToken(accessToken);
    setUser(userData);

    api.defaults.headers.common[
      'Authorization'
    ] = `Bearer ${accessToken}`;
  };

  const login = async (email: string, password: string, accountType: 'staff' | 'merchant' | 'driver' = 'staff') => {
    try {
      const endpoint = accountType === 'merchant' ? '/auth/merchants/login' : '/auth/login';
      const { data } = await api.post(endpoint, {
        email,
        password,
      });
      applyAuthSession(data, accountType);

      toast.success('Login successful!');
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Invalid credentials or server error';

      toast.error(errorMessage);

      throw error;
    }
  };

  const loginWithOtp = async (phone: string, otp: string, accountType: 'merchant' | 'driver') => {
    try {
      const endpoint = accountType === 'merchant' ? '/auth/merchants/verify-otp' : '/auth/verify-otp';
      const { data } = await api.post(endpoint, {
        phone,
        otp,
        purpose: 'login',
      });

      applyAuthSession(data.data || data, accountType);
      toast.success('Login successful!');
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Invalid OTP or server error';

      toast.error(errorMessage);
      throw error;
    }
  };

  const registerWithPhone = async (accountType: 'merchant' | 'driver', payload: Record<string, any>) => {
    try {
      const endpoint = accountType === 'merchant' ? '/auth/merchants/register' : '/auth/riders/register';
      const { data } = await api.post(endpoint, payload);

      applyAuthSession(data.data || data, accountType);
      toast.success('Registration successful!');
      return data.data || data;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Registration failed';

      toast.error(errorMessage);
      throw error;
    }
  };

  const logout = async () => {
    const accountType = localStorage.getItem('authAccountType');
    const loginPath =
      user?.role === 'merchant' || accountType === 'merchant'
        ? '/merchant-login'
        : user?.role === 'rider' || accountType === 'driver'
          ? '/driver-login'
          : '/login';
    const logoutEndpoint = user?.role === 'merchant' || accountType === 'merchant'
      ? '/auth/merchants/logout'
      : '/auth/logout';
    const fallbackLogoutEndpoint = logoutEndpoint === '/auth/merchants/logout'
      ? '/auth/logout'
      : '/auth/merchants/logout';

    markLogoutInProgress();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('authAccountType');

    setToken(null);
    setUser(null);
    setLoading(false);

    delete api.defaults.headers.common[
      'Authorization'
    ];

    try {
      await api.post(logoutEndpoint, {});
    } catch (error) {
      try {
        await api.post(fallbackLogoutEndpoint, {});
      } catch (fallbackError) {
        // Keep the local logout final even if the network is unavailable.
      }
    }

    toast.success('Logged out successfully');

    window.location.replace(loginPath);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        loginWithOtp,
        registerWithPhone,
        logout,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error(
      'useAuth must be used within AuthProvider'
    );
  }

  return context;
};
