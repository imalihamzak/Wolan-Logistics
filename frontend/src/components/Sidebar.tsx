import logo from "@/assets/logo.jpeg";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboardIcon,
  PackageIcon,
  MapIcon,
  StoreIcon,
  BarChart3Icon,
  SettingsIcon,
  BuildingIcon,
  TruckIcon,
  BellIcon,
  CircleHelpIcon,
  ChevronRightIcon,
  PlusIcon,
  UserIcon,
  WalletIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

type SidebarItem = {
  label: string;
  icon: typeof LayoutDashboardIcon;
  path: string;
  aliases?: string[];
};

const hqRoles = ['super_admin', 'director', 'general_manager'];
const regionalRoles = ['coo', 'regional_manager'];

const dashboardPathForRole = (role?: string) => {
  if (hqRoles.includes(role || '')) return '/hq-dashboard';
  if (regionalRoles.includes(role || '')) return '/regional-dashboard';
  return '/hub-dashboard';
};

const scopeLabelForRole = (role?: string, hasHub?: boolean) => {
  if (hqRoles.includes(role || '')) return 'HQ Master View';
  if (regionalRoles.includes(role || '')) return 'Regional Hubs';
  if (hasHub) return 'Assigned Hub';
  return 'Hub Not Assigned';
};

const buildAdminNavItems = (role?: string): SidebarItem[] => [
  {
    label: `Dashboard`,
    icon: LayoutDashboardIcon,
    path: dashboardPathForRole(role),
    aliases: [`/dashboard`, `/hub-dashboard`, `/regional-dashboard`, `/hq-dashboard`],
  },
  { label: `Orders & Dispatch`, icon: PackageIcon, path: `/orders` },
  { label: `Riders`, icon: TruckIcon, path: `/riders`, aliases: [`/drivers`] },
  { label: `Live Map`, icon: MapIcon, path: `/live-map`, aliases: [`/map`] },
  { label: `Merchants`, icon: StoreIcon, path: `/merchants` },
  { label: `Reports`, icon: BarChart3Icon, path: `/reports` },
  { label: `Hub Management`, icon: BuildingIcon, path: `/hub-management`, aliases: [`/hq`] },
  { label: `Notifications`, icon: BellIcon, path: `/notifications` },
  { label: `Settings`, icon: SettingsIcon, path: `/settings` },
];

export default function Sidebar() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems: SidebarItem[] = user?.role === 'merchant'
    ? [
      { label: `Dashboard`, icon: LayoutDashboardIcon, path: `/merchant/dashboard`, aliases: [`/merchant`] },
      { label: `Orders`, icon: PackageIcon, path: `/merchant/orders` },
      { label: `New Order`, icon: PlusIcon, path: `/merchant/orders/new` },
      { label: `KYC`, icon: ShieldCheckIcon, path: `/merchant/kyc` },
      { label: `Support`, icon: CircleHelpIcon, path: `/merchant/support` },
    ]
    : user?.role === 'rider'
      ? [
        { label: `Dashboard`, icon: LayoutDashboardIcon, path: `/driver/dashboard`, aliases: [`/driver`, `/drivers`] },
        { label: `Orders`, icon: PackageIcon, path: `/driver/orders` },
        { label: `Wallet`, icon: WalletIcon, path: `/driver/wallet` },
        { label: `Profile`, icon: UserIcon, path: `/driver/profile` },
        { label: `Support`, icon: CircleHelpIcon, path: `/driver/support` },
      ]
      : buildAdminNavItems(user?.role);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  const portalLabel = user?.role === 'merchant'
    ? 'Merchant Portal'
    : user?.role === 'rider'
      ? 'Driver Workspace'
      : 'Logistics Admin';
  const scopeLabel = scopeLabelForRole(user?.role, Boolean(user?.hub_id));

  const userInitials = (user?.full_name || 'Wolan User')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    setMobileOpen(false);
    logout();
  };

  const renderNavItems = (mobile = false) => navItems.map((item) => {
    const Icon = item.icon;
    const nestedOrderPath = (
      item.path === "/merchant/orders"
      && /^\/merchant\/orders\/(?!new(?:\/)?$)[^/]+/.test(location.pathname)
    ) || (
      item.path === "/driver/orders"
      && /^\/driver\/orders\/[^/]+/.test(location.pathname)
    );
    const active = location.pathname === item.path || nestedOrderPath || Boolean(item.aliases?.includes(location.pathname));

    return (
      <button
        type="button"
        key={item.path}
        onClick={() => handleNavigate(item.path)}
        className={mobile
          ? `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors ${
            active ? 'bg-white text-primary shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          }`
          : `flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-200 ${
            active
              ? `bg-accent text-primary font-medium`
              : `text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`
          }`
        }
      >
        <Icon className={`h-4.5 w-4.5 flex-shrink-0 ${active ? 'text-primary' : ''}`} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {!mobile ? (
          <div className={`ml-auto h-4 w-1 rounded-full bg-primary transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`} />
        ) : active ? (
          <ChevronRightIcon className="h-4 w-4 text-primary" />
        ) : null}
      </button>
    );
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={mobileOpen}
        className="fixed right-3 top-3 z-[70] grid h-10 w-10 place-items-center rounded-xl border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-custom transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <button
        type="button"
        aria-label="Close navigation menu"
        className={`fixed inset-0 z-[75] bg-black/45 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        data-cmp="MobileSidebar"
        className={`fixed inset-y-0 left-0 z-[80] flex w-[min(20rem,86vw)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-custom transition-transform duration-300 lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen ? true : undefined}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-custom">
              <img src={logo} alt="Wolan Logo" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold uppercase leading-tight tracking-widest text-white">Wolan</p>
              <p className="truncate text-[10px] tracking-wider text-white/70">{portalLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="grid h-9 w-9 place-items-center rounded-lg border border-sidebar-border text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <XIcon className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="border-b border-sidebar-border px-4 py-3">
          <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-white">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success status-pulse" />
              <span className="truncate text-xs font-medium">{scopeLabel}</span>
            </div>
            <ChevronRightIcon className="h-3.5 w-3.5 text-white/70" />
          </div>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-4">
          {renderNavItems(true)}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">{userInitials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{user?.full_name ?? 'Wolan User'}</p>
              <p className="truncate text-[10px] text-white/65">{user?.role ?? 'user'}</p>
            </div>
            <div className="h-2 w-2 rounded-full bg-success status-pulse" />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/15"
          >
            <LogOutIcon className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <aside
      data-cmp="Sidebar"
      className="fixed inset-y-0 left-0 z-50 hidden h-dvh w-60 flex-col border-r border-sidebar-border bg-sidebar shadow-custom lg:flex"
    >
      {/* Logo */}
      <div className="hidden px-5 py-6 border-b border-sidebar-border lg:block">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-white flex items-center justify-center shadow-custom">
            <img
              src={logo}
              alt="Wolan Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-tight tracking-widest uppercase">Wolan</p>
            <p className="text-[10px] text-white/70 tracking-wider">{portalLabel}</p>
          </div>
        </div>
      </div>

      {/* Hub selector */}
      <div className="hidden px-4 py-3 border-b border-sidebar-border lg:block">
        <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-white transition-colors hover:bg-white/15">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success status-pulse" />
            <span className="text-xs font-medium">{scopeLabel}</span>
          </div>
          <ChevronRightIcon className="w-3.5 h-3.5 text-white/70" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
        {renderNavItems(false)}
      </nav>

      {/* User */}
      <div className="hidden px-4 py-4 border-t border-sidebar-border lg:block">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white text-xs font-bold">{userInitials}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{user?.full_name ?? 'Wolan User'}</p>
            <p className="text-[10px] text-white/65 truncate">{user?.role ?? 'user'}</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-success status-pulse" />
        </div>
      </div>

      {/* Logout */}
      <div className="hidden px-4 pb-6 pt-2 border-t border-sidebar-border lg:block">
        <button 
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/5 transition-colors"
        >
          <LogOutIcon className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>

    </aside>
    </>
  );
}
