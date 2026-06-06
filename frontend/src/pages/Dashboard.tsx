import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminDashboardSkeleton } from "../components/DashboardSkeletons";
import { LoaderGlyph } from "../components/AppLoader";
import api from "../lib/api";
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  BellIcon,
  CheckCircleIcon,
  MapPinIcon,
  PackageIcon,
  RefreshCwIcon,
  RouteIcon,
  SearchIcon,
  TargetIcon,
  TimerIcon,
  TruckIcon,
  WalletIcon,
  WifiIcon,
  XCircleIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type OrderStatus = "pending" | "picked_up" | "at_hub" | "out_for_delivery" | "delivered" | "failed" | "returned";

type DashboardOrder = {
  id: string;
  order_id: string;
  merchant: string;
  zone: string;
  status: OrderStatus;
  rider: string;
  cod_amount: number;
  delivery_fee: number;
  createdAt?: string;
  updatedAt?: string;
};

type DashboardPayload = {
  scope: {
    hub_id: string | null;
    hub_ids?: string[];
    level?: "hub" | "regional" | "hq" | null;
    cross_hub_access?: string;
    hub_name: string;
    hub_code?: string | null;
    date: string;
    generated_at?: string;
  };
  counts: {
    completed_orders: number;
    completed_today: number;
    pending_orders: number;
    failed_orders: number;
    failed_today: number;
    returned_today: number;
    online_riders: number;
    total_today_orders: number;
    status_breakdown: {
      today: Record<OrderStatus, number>;
      all: Record<OrderStatus, number>;
      riders: Record<string, number>;
    };
  };
  cod: {
    total: number;
    today_total: number;
    in_field_total: number;
    active_cod_orders: number;
  };
  daily_target: {
    target: number;
    completed: number;
    remaining: number;
    percent: number;
  };
  macro_comparison?: HubMacroComparison[];
  today_orders: DashboardOrder[];
  order_volume: Array<{ time: string; orders: number }>;
  weekly_deliveries: Array<{ date: string; day: string; completed: number; failed: number }>;
  staging: Array<{ key: string; label: string; count: number; color: string }>;
  alerts: Array<{ type: string; desc: string; level: "destructive" | "warning"; related_id?: string }>;
  performance: {
    avg_pickup_to_delivery_minutes: number;
    avg_placement_to_delivery_minutes: number;
    avg_driver_response_minutes: number;
    failed_delivery_rate: number;
    cod_in_field_total: number;
  };
};

type LiveRiderRow = {
  name: string;
  packages: number;
  zone: string;
  status: OrderStatus;
  latest?: string;
  codAmount: number;
};

type HubMacroComparison = {
  hub_id?: string;
  hub_name: string;
  hub_code: string;
  target_hit_percentage: number;
  high_level_totals?: {
    total_orders: number;
    delivered: number;
    failed: number;
    active: number;
    target: number;
  };
  graph_ready: Array<{ metric: string; value: number }>;
};

const emptyStatusBreakdown: Record<OrderStatus, number> = {
  pending: 0,
  picked_up: 0,
  at_hub: 0,
  out_for_delivery: 0,
  delivered: 0,
  failed: 0,
  returned: 0,
};

const defaultDashboard: DashboardPayload = {
  scope: {
    hub_id: null,
    hub_name: "All hubs",
    hub_code: null,
    date: new Date().toISOString().slice(0, 10),
  },
  counts: {
    completed_orders: 0,
    completed_today: 0,
    pending_orders: 0,
    failed_orders: 0,
    failed_today: 0,
    returned_today: 0,
    online_riders: 0,
    total_today_orders: 0,
    status_breakdown: {
      today: emptyStatusBreakdown,
      all: emptyStatusBreakdown,
      riders: {},
    },
  },
  cod: {
    total: 0,
    today_total: 0,
    in_field_total: 0,
    active_cod_orders: 0,
  },
  daily_target: {
    target: 150,
    completed: 0,
    remaining: 150,
    percent: 0,
  },
  macro_comparison: [],
  today_orders: [],
  order_volume: [],
  weekly_deliveries: [],
  staging: [],
  alerts: [],
  performance: {
    avg_pickup_to_delivery_minutes: 0,
    avg_placement_to_delivery_minutes: 0,
    avg_driver_response_minutes: 0,
    failed_delivery_rate: 0,
    cod_in_field_total: 0,
  },
};

const statusLabel: Record<OrderStatus, string> = {
  pending: "Pending",
  picked_up: "Picked Up",
  at_hub: "At Hub",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
  returned: "Returned",
};

const statusStyles: Record<OrderStatus, string> = {
  pending: "border-warning/25 bg-warning/10 text-warning",
  picked_up: "border-chart-2/25 bg-chart-2/10 text-chart-2",
  at_hub: "border-primary/25 bg-primary/10 text-primary",
  out_for_delivery: "border-chart-4/25 bg-chart-4/10 text-chart-4",
  delivered: "border-success/25 bg-success/10 text-success",
  failed: "border-destructive/25 bg-destructive/10 text-destructive",
  returned: "border-destructive/25 bg-destructive/10 text-destructive",
};

const statusPalette: Record<OrderStatus, string> = {
  pending: "#b45309",
  picked_up: "#7c3aed",
  at_hub: "#4b0082",
  out_for_delivery: "#0f766e",
  delivered: "#15803d",
  failed: "#dc2626",
  returned: "#f43f5e",
};

const stagingPalette: Record<string, string> = {
  primary: "#4b0082",
  warning: "#b45309",
  "chart-2": "#7c3aed",
  success: "#15803d",
};

const chartTheme = {
  primary: "#4b0082",
  primarySoft: "#7c3aed",
  success: "#15803d",
  destructive: "#dc2626",
  warning: "#b45309",
  grid: "#e4d8ef",
  tick: "#75647f",
  tooltipBg: "#ffffff",
  tooltipBorder: "#d9cbe8",
  tooltipText: "#21172f",
};

const panelClass = "rounded-xl border border-border bg-card shadow-custom";

const formatNumber = (value?: number | null) => new Intl.NumberFormat("en-US").format(Math.round(value || 0));

const formatCompactUGX = (value?: number | null) => {
  const amount = Number(value || 0);

  if (Math.abs(amount) >= 1000000) {
    return `UGX ${Math.round(amount / 100000) / 10}M`;
  }

  if (Math.abs(amount) >= 1000) {
    return `UGX ${Math.round(amount / 1000)}K`;
  }

  return `UGX ${Math.round(amount)}`;
};

const formatUGX = (value?: number | null) => `UGX ${formatNumber(value)}`;

const formatMinutes = (value?: number | null) => {
  if (!value) {
    return "No data";
  }

  return `${Math.round(value)} min`;
};

const formatRelativeTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "-";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(timestamp));
};

const formatClock = (value?: string) => {
  if (!value) return "-";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp);
};

const getLatestTime = (current?: string, next?: string) => {
  if (!current) return next;
  if (!next) return current;
  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
};

type DashboardLevel = "auto" | "hub" | "regional" | "hq";

const dashboardEndpointForLevel = (level: DashboardLevel) => {
  if (level === "hub") return "/auth/dashboard/hub";
  if (level === "regional") return "/auth/dashboard/regional";
  if (level === "hq") return "/auth/dashboard/hq";
  return "/auth/dashboard/admin";
};

const titleForLevel = (level: DashboardLevel, scopeLevel?: string | null) => {
  const resolved = level === "auto" ? scopeLevel : level;
  if (resolved === "hub") return "Hub Dashboard";
  if (resolved === "regional") return "Regional Dashboard";
  if (resolved === "hq") return "HQ Master Dashboard";
  return "Dashboard";
};

export default function Dashboard({ level = "auto" }: { level?: DashboardLevel }) {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [now, setNow] = useState(() => new Date());

  const data = dashboard || defaultDashboard;
  const dashboardEndpoint = dashboardEndpointForLevel(level);
  const macroComparison = data.macro_comparison || [];
  const showMacroComparison = macroComparison.length > 0 && data.scope.level !== "hq";
  const target = data.daily_target;
  const goalPercent = Math.min(Math.max(target.percent || 0, 0), 100);
  const hubSubtitle = data.scope.hub_code
    ? `${data.scope.hub_name} - ${data.scope.hub_code}`
    : data.scope.hub_name;

  const loadDashboard = async (asRefresh = false) => {
    if (asRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const { data: response } = await api.get(dashboardEndpoint);
      setDashboard(response?.data?.dashboard || defaultDashboard);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.message || "Unable to load admin dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [dashboardEndpoint]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const onlineRiderSub = useMemo(() => {
    const statuses = data.counts.status_breakdown.riders || {};
    const available = statuses.available || 0;
    const onDelivery = statuses.on_delivery || 0;
    const breakCount = statuses.break || 0;
    const offline = statuses.offline || 0;
    return `${available} available | ${onDelivery} on delivery | ${breakCount + offline} unavailable`;
  }, [data.counts.status_breakdown.riders]);

  const statusMix = useMemo(() => (
    (Object.keys(statusLabel) as OrderStatus[])
      .map((status) => ({
        status,
        label: statusLabel[status],
        count: data.counts.status_breakdown.today[status] || 0,
        color: statusPalette[status],
      }))
      .filter((item) => item.count > 0)
  ), [data.counts.status_breakdown.today]);

  const totalStatusCount = statusMix.reduce((sum, item) => sum + item.count, 0);

  const zoneDistribution = useMemo(() => {
    const zones = new Map<string, number>();
    data.today_orders.forEach((order) => {
      const zone = order.zone?.trim() || "Unassigned";
      zones.set(zone, (zones.get(zone) || 0) + 1);
    });

    return Array.from(zones.entries())
      .map(([zone, orders]) => ({ zone, orders }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 8);
  }, [data.today_orders]);

  const liveRiders = useMemo<LiveRiderRow[]>(() => {
    const riders = new Map<string, LiveRiderRow>();

    data.today_orders.forEach((order) => {
      const riderName = order.rider?.trim();
      if (!riderName || riderName === "-" || riderName.toLowerCase() === "unassigned") {
        return;
      }

      const existing = riders.get(riderName);
      if (existing) {
        existing.packages += 1;
        existing.codAmount += Number(order.cod_amount || 0);
        existing.latest = getLatestTime(existing.latest, order.updatedAt || order.createdAt);
        if (order.status === "out_for_delivery" || existing.status !== "out_for_delivery") {
          existing.status = order.status;
          existing.zone = order.zone || existing.zone;
        }
        return;
      }

      riders.set(riderName, {
        name: riderName,
        packages: 1,
        zone: order.zone || "Unassigned",
        status: order.status,
        latest: order.updatedAt || order.createdAt,
        codAmount: Number(order.cod_amount || 0),
      });
    });

    return Array.from(riders.values())
      .sort((a, b) => (new Date(b.latest || 0).getTime() || 0) - (new Date(a.latest || 0).getTime() || 0));
  }, [data.today_orders]);

  const macroChartData = useMemo(() => macroComparison.map((hub) => ({
    name: hub.hub_code || hub.hub_name,
    target: hub.target_hit_percentage || 0,
  })), [macroComparison]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredOrders = useMemo(() => {
    if (!normalizedSearch) {
      return data.today_orders;
    }

    return data.today_orders.filter((order) => [
      order.order_id,
      order.merchant,
      order.zone,
      order.rider,
      statusLabel[order.status],
    ].some((value) => value?.toLowerCase().includes(normalizedSearch)));
  }, [data.today_orders, normalizedSearch]);

  const filteredRiders = useMemo(() => {
    if (!normalizedSearch) {
      return liveRiders;
    }

    return liveRiders.filter((rider) => [
      rider.name,
      rider.zone,
      statusLabel[rider.status],
    ].some((value) => value?.toLowerCase().includes(normalizedSearch)));
  }, [liveRiders, normalizedSearch]);

  const activePipeline = data.counts.pending_orders
    + (data.counts.status_breakdown.all.picked_up || 0)
    + (data.counts.status_breakdown.all.at_hub || 0)
    + (data.counts.status_breakdown.all.out_for_delivery || 0);

  const codCollectedToday = Math.max((data.cod.today_total || 0) - (data.cod.in_field_total || 0), 0);
  const hasAlerts = data.alerts.length > 0;

  const kpiCards = [
    {
      label: "Deliveries Today",
      value: loading ? "..." : formatNumber(data.counts.completed_today),
      sub: `${formatNumber(data.counts.total_today_orders)} total orders`,
      trend: `${goalPercent}% of ${formatNumber(target.target)} target`,
      icon: PackageIcon,
      tone: "text-primary",
      ring: "border-primary/20 bg-primary/10",
    },
    {
      label: "Online Riders",
      value: loading ? "..." : formatNumber(data.counts.online_riders),
      sub: onlineRiderSub,
      trend: `${formatNumber(data.counts.status_breakdown.riders.on_delivery || 0)} on delivery`,
      icon: TruckIcon,
      tone: "text-success",
      ring: "border-success/20 bg-success/10",
    },
    {
      label: "Avg Response",
      value: loading ? "..." : formatMinutes(data.performance.avg_driver_response_minutes),
      sub: "Driver acceptance speed",
      trend: "Target under 7 min",
      icon: TimerIcon,
      tone: "text-chart-4",
      ring: "border-chart-4/20 bg-chart-4/10",
    },
    {
      label: "COD In Field",
      value: loading ? "..." : formatCompactUGX(data.cod.in_field_total),
      sub: `${formatNumber(data.cod.active_cod_orders)} active COD orders`,
      trend: `Today ${formatCompactUGX(data.cod.today_total)}`,
      icon: WalletIcon,
      tone: "text-warning",
      ring: "border-warning/20 bg-warning/10",
    },
    {
      label: "Failed Deliveries",
      value: loading ? "..." : formatNumber(data.counts.failed_today),
      sub: `${data.performance.failed_delivery_rate || 0}% failure rate`,
      trend: `${formatNumber(data.counts.failed_orders)} total failed`,
      icon: XCircleIcon,
      tone: "text-destructive",
      ring: "border-destructive/20 bg-destructive/10",
    },
  ];

  return (
    <div data-cmp="Dashboard" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-3 py-3 pr-16 backdrop-blur sm:pl-5 sm:pr-16 lg:pr-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight text-foreground">{titleForLevel(level, data.scope.level)}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">Live overview - {hubSubtitle}</p>
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto">
            <label className="relative min-w-0 flex-[1_1_13rem] sm:w-72 sm:flex-none">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search orders, riders..."
                className="h-9 w-full rounded-lg border border-border bg-input pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </label>
            <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-2 text-xs font-semibold text-success sm:px-3">
              <WifiIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Live</span>
            </span>
            <button
              onClick={() => loadDashboard(true)}
              disabled={refreshing || loading}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
              aria-label="Refresh dashboard"
            >
              {refreshing ? <LoaderGlyph size="sm" label="Refreshing dashboard" /> : <RefreshCwIcon className="h-4 w-4" />}
            </button>
            <Link
              to="/notifications"
              className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              aria-label="Open notifications"
            >
              <BellIcon className="h-4 w-4" />
              {hasAlerts ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{data.alerts.length}</span> : null}
            </Link>
            <div className="hidden text-right text-xs leading-tight text-muted-foreground sm:block">
              <p className="font-bold text-foreground">{new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now)}</p>
              <p>{new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(now)}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="content-scroll flex-1 px-3 py-4 sm:px-5 lg:px-6 2xl:px-8">
        {loading && !dashboard ? (
          <AdminDashboardSkeleton />
        ) : (
        <div className="viewport-safe mx-auto flex w-full max-w-[2400px] flex-col gap-4 sm:gap-5">
          {errorMessage ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{errorMessage}</span>
              <button
                onClick={() => loadDashboard(true)}
                className="w-full rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-destructive/10 sm:w-auto"
              >
                Retry
              </button>
            </div>
          ) : null}

          <div className={`flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
            hasAlerts ? "rounded-xl border-destructive/25 bg-destructive/10 text-destructive" : "rounded-xl border-success/20 bg-success/10 text-success"
          }`}>
            <div className="flex min-w-0 items-start gap-3">
              {hasAlerts ? <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {hasAlerts ? `${data.alerts.length} operational alert${data.alerts.length === 1 ? "" : "s"} active` : "All dashboard signals are clear"}
                </p>
                <p className="mt-0.5 break-words text-xs opacity-80">
                  {hasAlerts ? data.alerts[0]?.desc : `Last updated ${loading ? "while loading" : formatRelativeTime(data.scope.generated_at)} from live backend data.`}
                </p>
              </div>
            </div>
            <Link
              to={hasAlerts ? "/notifications" : "/orders"}
              className={`inline-flex w-full shrink-0 items-center justify-center rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:w-auto ${
                hasAlerts ? "bg-destructive/10 text-destructive hover:bg-destructive/15" : "bg-success/10 text-success hover:bg-success/15"
              }`}
            >
              {hasAlerts ? "Investigate" : "Review Orders"}
            </Link>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className={`${panelClass} min-w-0 p-3 transition-colors hover:border-primary/35 sm:p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{card.label}</p>
                      <p className={`mt-2 break-words text-xl font-black leading-none sm:text-2xl ${card.tone}`}>{card.value}</p>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{card.sub}</p>
                    </div>
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${card.ring}`}>
                      <Icon className={`h-5 w-5 ${card.tone}`} />
                    </span>
                  </div>
                  <p className="mt-4 text-xs font-medium text-success">{card.trend}</p>
                </div>
              );
            })}
          </section>

          {showMacroComparison ? (
            <section className={`${panelClass} min-w-0 p-4 sm:p-5`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">Cross-hub target hit comparison</p>
                  <p className="text-xs text-muted-foreground">Performance graph only. External hub drill-down is disabled for hub managers.</p>
                </div>
                <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                  % hit only
                </span>
              </div>

              {macroComparison.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
                  <div className="h-56 min-w-0 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={macroChartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, color: chartTheme.tooltipText }}
                          labelStyle={{ color: chartTheme.tooltipText }}
                          formatter={(value) => [`${value}%`, "Target hit"]}
                        />
                        <Bar dataKey="target" name="Target hit %" fill={chartTheme.primary} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                    {macroComparison.slice(0, 6).map((hub) => {
                      const hit = Math.min(Math.max(Number(hub.target_hit_percentage || 0), 0), 100);
                      return (
                        <div key={`${hub.hub_code}-${hub.hub_name}`} className="rounded-xl border border-border bg-muted/40 px-3 py-3">
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-foreground">{hub.hub_name}</p>
                              <p className="text-[10px] text-muted-foreground">{hub.hub_code}</p>
                            </div>
                            <p className="shrink-0 text-lg font-black text-primary">{hit}%</p>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${hit}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                  Macro comparison data is not available yet.
                </div>
              )}
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            <div className={`${panelClass} min-w-0 p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Today's COD</p>
                  <p className="mt-2 text-2xl font-black text-foreground">{formatUGX(data.cod.today_total)}</p>
                </div>
                <WalletIcon className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-2 text-xs text-success">{formatCompactUGX(codCollectedToday)} collected estimate</p>
              <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-4 min-[420px]:grid-cols-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">COD Collected</p>
                  <p className="mt-1 break-words text-xs font-bold text-primary">{formatCompactUGX(codCollectedToday)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">In Field</p>
                  <p className="mt-1 break-words text-xs font-bold text-success">{formatCompactUGX(data.cod.in_field_total)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">All Time</p>
                  <p className="mt-1 break-words text-xs font-bold text-warning">{formatCompactUGX(data.cod.total)}</p>
                </div>
              </div>
            </div>

            <div className={`${panelClass} min-w-0 p-4`}>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Package Staging</p>
                <RouteIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-3">
                {data.staging.length === 0 ? (
                  <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">No package staging data yet.</p>
                ) : null}
                {data.staging.map((stage) => {
                  const maxStage = Math.max(...data.staging.map((item) => item.count), 1);
                  const width = `${Math.max(8, Math.round((stage.count / maxStage) * 100))}%`;
                  const color = stagingPalette[stage.color] || "#75647f";
                  return (
                    <div key={stage.key} className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(90px,0.8fr)_2.5rem] sm:gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <span className="truncate text-xs text-foreground">{stage.label}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width, backgroundColor: color }} />
                      </div>
                      <p className="text-right text-xs font-bold text-foreground">{formatNumber(stage.count)}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                Active pipeline <span className="font-bold text-foreground">{formatNumber(activePipeline)}</span>
              </p>
            </div>

            <div className={`${panelClass} min-w-0 p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Order Status Mix</p>
                <ActivityIcon className="h-4 w-4 text-success" />
              </div>
              <div className="grid gap-3 sm:grid-cols-[7.5rem_1fr]">
                <div className="relative mx-auto h-28 w-28">
                  {totalStatusCount > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusMix} dataKey="count" nameKey="label" innerRadius={34} outerRadius={52} paddingAngle={3}>
                          {statusMix.map((entry) => <Cell key={entry.status} fill={entry.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="grid h-full place-items-center rounded-full border border-border text-xs text-muted-foreground">No data</div>
                  )}
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <span className="text-lg font-black text-foreground">{formatNumber(totalStatusCount)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {(totalStatusCount > 0 ? statusMix : [{ status: "pending" as OrderStatus, label: "No active orders", count: 0, color: "#75647f" }]).map((item) => (
                    <div key={item.status} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-2 text-foreground">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="font-bold text-foreground">{formatNumber(item.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`${panelClass} min-w-0 p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Daily Target</p>
                <TargetIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="grid gap-3 sm:grid-cols-[7.5rem_1fr]">
                <div className="relative mx-auto h-28 w-28">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke={chartTheme.grid} strokeWidth="12" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={chartTheme.primary}
                      strokeWidth="12"
                      strokeDasharray={`${2 * Math.PI * 40}`}
                      strokeDashoffset={`${2 * Math.PI * 40 * (1 - goalPercent / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-foreground">{formatNumber(target.completed)}</span>
                    <span className="text-[10px] text-muted-foreground">of {formatNumber(target.target)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 self-end min-[420px]:grid-cols-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Completed</p>
                    <p className="mt-1 text-xs font-bold text-success">{formatNumber(target.completed)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                    <p className="mt-1 text-xs font-bold text-destructive">{formatNumber(data.counts.failed_today)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Pending</p>
                    <p className="mt-1 text-xs font-bold text-warning">{formatNumber(data.counts.pending_orders)}</p>
                  </div>
                  <p className="text-center text-xs text-primary min-[420px]:col-span-3">{formatNumber(target.remaining)} remaining</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
            <div className={`${panelClass} min-w-0 p-4`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">Delivery Trend</p>
                  <p className="text-xs text-muted-foreground">Order volume over time from backend data</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="inline-flex items-center gap-1 text-primary"><span className="h-1.5 w-3 rounded-full bg-primary" /> Orders</span>
                </div>
              </div>
              <div className="h-56 min-w-0 sm:h-64 lg:h-72">
                {data.order_volume.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.order_volume} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dashboardOrders" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartTheme.primary} stopOpacity={0.24} />
                          <stop offset="95%" stopColor={chartTheme.primary} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="time" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, color: chartTheme.tooltipText }}
                        labelStyle={{ color: chartTheme.tooltipText }}
                        itemStyle={{ color: chartTheme.primary }}
                      />
                      <Area type="monotone" dataKey="orders" stroke={chartTheme.primary} strokeWidth={2} fill="url(#dashboardOrders)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No order trend data yet.</div>
                )}
              </div>
            </div>

            <div className={`${panelClass} min-w-0 p-4`}>
              <div className="mb-3">
                <p className="text-sm font-bold text-foreground">Zone Distribution</p>
                <p className="text-xs text-muted-foreground">Orders by delivery zone</p>
              </div>
              <div className="h-56 min-w-0 sm:h-64 lg:h-72">
                {zoneDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={zoneDistribution} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis dataKey="zone" type="category" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} width={74} />
                      <Tooltip
                        contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, color: chartTheme.tooltipText }}
                        labelStyle={{ color: chartTheme.tooltipText }}
                      />
                      <Bar dataKey="orders" fill={chartTheme.primary} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No zone data yet.</div>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
            <div className={`${panelClass} min-w-0 overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
                <div>
                  <p className="text-sm font-bold text-foreground">Recent Orders</p>
                  <p className="text-xs text-muted-foreground">Latest dispatch activity</p>
                </div>
                <Link to="/orders" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/75">
                  View All <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="space-y-3 p-3 xl:hidden">
                {filteredOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    {searchTerm ? "No matching orders found." : "No order activity today."}
                  </div>
                ) : null}
                {filteredOrders.slice(0, 8).map((order) => (
                  <div key={order.id} className="rounded-xl border border-border bg-card/70 p-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-primary">{order.order_id}</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{order.merchant || "Unknown merchant"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusStyles[order.status] ?? statusStyles.pending}`}>
                        {statusLabel[order.status] || order.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-muted/45 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Zone</p>
                        <p className="mt-1 truncate font-semibold text-foreground">{order.zone || "-"}</p>
                      </div>
                      <div className="rounded-lg bg-muted/45 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Rider</p>
                        <p className="mt-1 truncate font-semibold text-foreground">{order.rider || "-"}</p>
                      </div>
                      <div className="rounded-lg bg-muted/45 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fee</p>
                        <p className="mt-1 break-words font-bold text-primary">{formatUGX(order.delivery_fee)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/45 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</p>
                        <p className="mt-1 font-semibold text-foreground">{formatClock(order.updatedAt || order.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="responsive-table-frame hidden xl:block">
                <table className="min-w-[760px] w-full text-left text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Order ID</th>
                      <th className="px-4 py-3 font-medium">Merchant</th>
                      <th className="px-4 py-3 font-medium">Destination</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Rider</th>
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 text-right font-medium">Fee</th>
                      <th className="px-4 py-3 text-right font-medium">COD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          {searchTerm ? "No matching orders found." : "No order activity today."}
                        </td>
                      </tr>
                    ) : null}
                    {filteredOrders.slice(0, 8).map((order) => (
                      <tr key={order.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3 font-black text-primary">{order.order_id}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{order.merchant || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{order.zone || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusStyles[order.status] ?? statusStyles.pending}`}>
                            {statusLabel[order.status] || order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">{order.rider || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatClock(order.updatedAt || order.createdAt)}</td>
                        <td className="px-4 py-3 text-right font-bold text-primary">{formatUGX(order.delivery_fee)}</td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">{formatUGX(order.cod_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${panelClass} min-w-0 overflow-hidden`}>
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
                <div>
                  <p className="text-sm font-bold text-foreground">Live Riders</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(data.counts.online_riders)} active today</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success status-pulse" />
                  Live
                </span>
              </div>
              <div className="divide-y divide-border">
                {filteredRiders.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {searchTerm ? "No matching riders found." : "No assigned rider activity yet."}
                  </div>
                ) : null}
                {filteredRiders.slice(0, 7).map((rider) => (
                  <div key={rider.name} className="flex min-w-0 items-center gap-3 px-4 py-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                      rider.status === "failed" ? "bg-destructive/10 text-destructive" : rider.status === "pending" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
                    }`}>
                      <TruckIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold text-foreground">{rider.name}</p>
                        <p className="shrink-0 text-[10px] font-bold text-foreground">{rider.packages} pkg{rider.packages === 1 ? "" : "s"}</p>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        <span className={statusStyles[rider.status].split(" ").find((item) => item.startsWith("text-")) || "text-muted-foreground"}>
                          {statusLabel[rider.status]}
                        </span>
                        {" "}- {rider.zone}
                      </p>
                    </div>
                    <p className="hidden shrink-0 text-right text-[10px] text-muted-foreground min-[380px]:block">{formatRelativeTime(rider.latest)}</p>
                  </div>
                ))}
              </div>
              <Link to="/live-map" className="flex items-center justify-center gap-2 border-t border-border px-4 py-3 text-xs font-bold text-primary hover:bg-muted/40">
                <MapPinIcon className="h-3.5 w-3.5" />
                View All on Map
              </Link>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {[
              { label: "Avg Pickup-to-Delivery", value: formatMinutes(data.performance.avg_pickup_to_delivery_minutes), target: "Target under 45 min", ok: !data.performance.avg_pickup_to_delivery_minutes || data.performance.avg_pickup_to_delivery_minutes <= 45 },
              { label: "Avg Placement-to-Delivery", value: formatMinutes(data.performance.avg_placement_to_delivery_minutes), target: "Target under 60 min", ok: !data.performance.avg_placement_to_delivery_minutes || data.performance.avg_placement_to_delivery_minutes <= 60 },
              { label: "Avg Driver Response", value: formatMinutes(data.performance.avg_driver_response_minutes), target: "Target under 7 min", ok: !data.performance.avg_driver_response_minutes || data.performance.avg_driver_response_minutes <= 7 },
              { label: "Failed Delivery Rate", value: `${data.performance.failed_delivery_rate || 0}%`, target: "Target under 5%", ok: (data.performance.failed_delivery_rate || 0) <= 5 },
              { label: "Weekly Completion", value: `${formatNumber(data.weekly_deliveries.reduce((sum, item) => sum + item.completed, 0))}`, target: `${formatNumber(data.weekly_deliveries.reduce((sum, item) => sum + item.failed, 0))} failed this week`, ok: true },
            ].map((metric) => (
              <div key={metric.label} className={`${panelClass} min-w-0 p-3 sm:p-4`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-lg font-black text-foreground">{metric.value}</p>
                <p className={`mt-1 text-[10px] ${metric.ok ? "text-success" : "text-destructive"}`}>{metric.target}</p>
              </div>
            ))}
          </section>

          <section className={`${panelClass} min-w-0 p-4`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-foreground">Weekly Deliveries</p>
                <p className="text-xs text-muted-foreground">Completed vs failed by day</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1 text-success"><span className="h-1.5 w-3 rounded-full bg-success" /> Completed</span>
                <span className="inline-flex items-center gap-1 text-destructive"><span className="h-1.5 w-3 rounded-full bg-destructive" /> Failed</span>
              </div>
            </div>
            <div className="h-52 sm:h-56 lg:h-64">
              {data.weekly_deliveries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.weekly_deliveries} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis dataKey="day" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, color: chartTheme.tooltipText }}
                      labelStyle={{ color: chartTheme.tooltipText }}
                    />
                    <Line type="monotone" dataKey="completed" stroke={chartTheme.success} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="failed" stroke={chartTheme.destructive} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No weekly delivery data yet.</div>
              )}
            </div>
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
