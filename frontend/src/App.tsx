import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Drivers from "./pages/Drivers";
import LiveMap from "./pages/LiveMap";
import Merchants from "./pages/Merchants";
import Reports from "./pages/Reports";
import HQMaster from "./pages/HQMaster";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import MerchantPortal from "./pages/MerchantPortal";

const hqRoles = ['super_admin', 'director', 'general_manager'];
const regionalRoles = ['coo', 'regional_manager'];
const hubRoles = ['hub_manager', 'ops_coordinator'];
const adminRoles = [...hqRoles, ...regionalRoles, ...hubRoles];
const dispatchRoles = [...adminRoles, 'rider'];

const RouteAlias = ({ to }: { to: string }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute roles={adminRoles}>
    <Layout>{children}</Layout>
  </ProtectedRoute>
);

const DispatchRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute roles={dispatchRoles}>
    <Layout>{children}</Layout>
  </ProtectedRoute>
);

const DriverWorkspaceRoute = () => {
  const { user } = useAuth();

  if (user && adminRoles.includes(user.role)) {
    return <RouteAlias to="/riders" />;
  }

  return <RouteAlias to="/driver/dashboard" />;
};

const MerchantRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute roles={['merchant']} loginPath="/merchant-login">
    <Layout>{children}</Layout>
  </ProtectedRoute>
);

const RiderRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute roles={['rider']} loginPath="/driver-login">
    <Layout>{children}</Layout>
  </ProtectedRoute>
);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.log("ErrorBoundary caught:", error);
    toast.error("Something went wrong, please refresh the page");
  }
  render() {
    return this.state.hasError ? (
      <div className="p-8 text-center text-muted-foreground">Something went wrong</div>
    ) : (
      this.props.children
    );
  }
}

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/merchant-login" element={<Login />} />
          <Route path="/merchant/register" element={<Login />} />
          <Route path="/driver-login" element={<Login />} />
          <Route path="/driver/register" element={<Login />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={
            <AdminRoute>
              <Dashboard level="auto" />
            </AdminRoute>
          } />
          <Route path="/hub-dashboard" element={
            <AdminRoute>
              <Dashboard level="hub" />
            </AdminRoute>
          } />
          <Route path="/regional-dashboard" element={
            <AdminRoute>
              <Dashboard level="regional" />
            </AdminRoute>
          } />
          <Route path="/hq-dashboard" element={
            <AdminRoute>
              <Dashboard level="hq" />
            </AdminRoute>
          } />
          <Route path="/orders" element={
            <AdminRoute>
              <Orders />
            </AdminRoute>
          } />
          <Route path="/riders" element={
            <AdminRoute>
              <Drivers screen="admin" />
            </AdminRoute>
          } />
          <Route path="/drivers" element={
            <DispatchRoute>
              <DriverWorkspaceRoute />
            </DispatchRoute>
          } />
          <Route path="/live-map" element={
            <AdminRoute>
              <LiveMap />
            </AdminRoute>
          } />
          <Route path="/map" element={
            <AdminRoute>
              <RouteAlias to="/live-map" />
            </AdminRoute>
          } />
          <Route path="/merchants" element={
            <AdminRoute>
              <Merchants />
            </AdminRoute>
          } />
          <Route path="/reports" element={
            <AdminRoute>
              <Reports />
            </AdminRoute>
          } />
          <Route path="/hub-management" element={
            <AdminRoute>
              <HQMaster />
            </AdminRoute>
          } />
          <Route path="/hq" element={
            <AdminRoute>
              <RouteAlias to="/hub-management" />
            </AdminRoute>
          } />
          <Route path="/settings" element={
            <AdminRoute>
              <Settings />
            </AdminRoute>
          } />
          <Route path="/notifications" element={
            <AdminRoute>
              <Notifications />
            </AdminRoute>
          } />
          <Route path="/merchant" element={
            <MerchantRoute>
              <RouteAlias to="/merchant/dashboard" />
            </MerchantRoute>
          } />
          <Route path="/merchant/dashboard" element={
            <MerchantRoute>
              <MerchantPortal screen="dashboard" />
            </MerchantRoute>
          } />
          <Route path="/merchant/orders" element={
            <MerchantRoute>
              <MerchantPortal screen="orders" />
            </MerchantRoute>
          } />
          <Route path="/merchant/orders/new" element={
            <MerchantRoute>
              <MerchantPortal screen="new-order" />
            </MerchantRoute>
          } />
          <Route path="/merchant/orders/:orderId" element={
            <MerchantRoute>
              <MerchantPortal screen="order-details" />
            </MerchantRoute>
          } />
          <Route path="/merchant/kyc" element={
            <MerchantRoute>
              <MerchantPortal screen="kyc" />
            </MerchantRoute>
          } />
          <Route path="/merchant/support" element={
            <MerchantRoute>
              <MerchantPortal screen="support" />
            </MerchantRoute>
          } />
          <Route path="/driver" element={
            <RiderRoute>
              <RouteAlias to="/driver/dashboard" />
            </RiderRoute>
          } />
          <Route path="/driver/dashboard" element={
            <RiderRoute>
              <Drivers screen="dashboard" />
            </RiderRoute>
          } />
          <Route path="/driver/orders" element={
            <RiderRoute>
              <Drivers screen="orders" />
            </RiderRoute>
          } />
          <Route path="/driver/orders/:orderId" element={
            <RiderRoute>
              <Drivers screen="order-details" />
            </RiderRoute>
          } />
          <Route path="/driver/wallet" element={
            <RiderRoute>
              <Drivers screen="wallet" />
            </RiderRoute>
          } />
          <Route path="/driver/profile" element={
            <RiderRoute>
              <Drivers screen="profile" />
            </RiderRoute>
          } />
          <Route path="/driver/support" element={
            <RiderRoute>
              <Drivers screen="support" />
            </RiderRoute>
          } />
        </Routes>
      </ErrorBoundary>
      <Toaster position="top-right" />
    </BrowserRouter>
  </AuthProvider>
);

export default App;
