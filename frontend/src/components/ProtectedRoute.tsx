import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppLoader from './AppLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  loginPath?: string;
}

const homeForRole = (role?: string) => {
  if (role === 'merchant') return '/merchant/dashboard';
  if (role === 'rider') return '/driver/dashboard';
  return '/dashboard';
};

export default function ProtectedRoute({ children, roles, loginPath = '/login' }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <AppLoader
        variant="page"
        label="Preparing Wolan workspace"
        subtitle="Checking your secure session and routing access."
      />
    );
  }

  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return <>{children}</>;
}

