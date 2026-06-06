import { useEffect, useMemo, useState } from "react";
import { LoaderGlyph } from "../components/AppLoader";
import { ReportsSkeleton } from "../components/DashboardSkeletons";
import Header from "../components/Header";
import { CustomSelect } from "../components/ui/custom-select";
import api from "../lib/api";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  BarChart2Icon,
  CalendarIcon,
  CheckCircleIcon,
  DatabaseIcon,
  DownloadIcon,
  PackageIcon,
  RefreshCwIcon,
  StarIcon,
  TrendingUpIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

type ReportPayload = {
  scope: {
    actor_role: string;
    hub_id: string | null;
    hub_name: string;
    hub_code?: string | null;
    generated_at?: string;
  };
  period: {
    key: string;
    label: string;
    start: string;
    end: string;
    granularity: "day" | "month";
  };
  overview: {
    total_orders: number;
    completed_orders: number;
    pending_orders: number;
    active_orders: number;
    failed_orders: number;
    returned_orders: number;
    status_breakdown: Record<OrderStatus, number>;
    delivery_fee_total: number;
    revenue: number;
    cod_total: number;
    declared_value_total: number;
    failed_rate: number;
    avg_pickup_to_delivery_minutes: number;
    avg_placement_to_delivery_minutes: number;
    avg_driver_response_minutes: number;
    avg_rider_rating: number;
    online_riders: number;
    total_riders: number;
    active_merchants: number;
  };
  trends: Array<{ date: string; orders: number; delivered: number; failed: number; revenue: number; cod: number }>;
  zones: Array<{ name: string; total_orders: number; delivered: number; failed: number; returned: number; active: number; revenue: number; cod: number; share_percentage: number; success_rate: number }>;
  drivers: Array<{
    id: string;
    full_name: string;
    phone: string;
    vehicle_type?: string;
    bike_plate?: string;
    current_status: string;
    hub?: { name?: string; code?: string } | null;
    period_deliveries: number;
    period_delivered: number;
    period_failed: number;
    period_returned: number;
    success_rate: number;
    rating: number;
    total_ratings: number;
    current_cod: number;
    pending_payout: number;
    is_active: boolean;
    kyc_status?: string;
  }>;
  cod: {
    total_order_cod: number;
    in_field_total: number;
    active_cod_orders: number;
    completed_cod_settlements: number;
    completed_payouts: number;
    pending_withdrawals: number;
    settlement_summary: Array<{ type: string; status: string; count: number; amount: number; payout_amount: number; cod_amount: number }>;
    recent_settlements: Array<{
      id: string;
      reference: string;
      type: string;
      status: string;
      amount: number;
      payout_amount: number;
      cod_amount: number;
      rider?: { full_name?: string; phone?: string } | null;
      hub?: { name?: string; code?: string } | null;
      createdAt?: string;
      completed_at?: string | null;
    }>;
    riders_with_cod: ReportPayload["drivers"];
  };
  customers: {
    unique_customers: number;
    repeat_customers: number;
    repeat_rate: number;
    avg_orders_per_customer: number;
    total_customer_orders: number;
    delivered_orders: number;
    failed_orders: number;
    support_complaints_configured: boolean;
    support_complaints_note: string;
  };
  cross_hub: {
    mode: "macro_only" | "full_admin" | "not_available";
    comparison: Array<Record<string, any>>;
  };
  data_sources: Record<string, boolean>;
};

const tabs = ["Overview", "Driver Performance", "COD Reconciliation", "Zone Heatmap", "Customer Reports"];

const periodOptions = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
];

const chartTheme = {
  primary: "#4B0082",
  primarySoft: "#7C3AED",
  grid: "#E8DEF2",
  tick: "#6B5C78",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#D9CBE8",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  blue: "#2563EB",
};

const zoneColors = [chartTheme.primary, chartTheme.success, chartTheme.warning, chartTheme.primarySoft, chartTheme.danger, chartTheme.blue];

const formatNumber = (value?: number | null) => new Intl.NumberFormat("en-US").format(Math.round(value || 0));
const formatUGX = (value?: number | null) => `UGX ${formatNumber(value)}`;
const formatCompactUGX = (value?: number | null) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000000) return `UGX ${Math.round(amount / 100000) / 10}M`;
  if (Math.abs(amount) >= 1000) return `UGX ${Math.round(amount / 1000)}K`;
  return formatUGX(amount);
};

const hasChartValue = (rows: Array<Record<string, any>>, keys: string[]) => (
  rows.some((row) => keys.some((key) => Number(row[key] || 0) > 0))
);

const csvEscape = (value: any) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadCsv = (fileName: string, rows: Array<Array<any>>) => {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
      <DatabaseIcon className="mb-3 h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof PackageIcon;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-custom">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [period, setPeriod] = useState("month");
  const [reports, setReports] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/auth/reports/admin", { params: { period } });
      setReports(data?.data?.reports || null);
    } catch (requestError: any) {
      const message = requestError.response?.data?.message || "Unable to load real reports from backend";
      setError(message);
      setReports(null);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [period]);

  const overview = reports?.overview;
  const hasOrders = Boolean(overview && overview.total_orders > 0);
  const exportDisabledReason = !reports
    ? "Reports must load from the backend before export."
    : activeTab === "Overview" && !hasOrders
      ? "No real order records were returned by the backend for this period."
      : activeTab === "Driver Performance" && reports.drivers.length === 0
      ? "No rider performance records were returned by the backend."
      : activeTab === "COD Reconciliation" && reports.cod.recent_settlements.length === 0 && reports.cod.riders_with_cod.length === 0
        ? "No settlement or rider COD records were returned by the backend."
        : activeTab === "Zone Heatmap" && reports.zones.length === 0
          ? "No zone report records were returned by the backend."
          : activeTab === "Customer Reports" && reports.customers.total_customer_orders === 0
            ? "No customer order records were returned by the backend."
            : null;

  const statusRows = useMemo(() => {
    if (!reports) return [];
    return Object.entries(reports.overview.status_breakdown).map(([status, count]) => ({
      status,
      count,
    }));
  }, [reports]);

  const zonePieRows = useMemo(() => reports?.zones.map((zone, index) => ({
    ...zone,
    color: zoneColors[index % zoneColors.length],
  })) || [], [reports]);

  const exportReport = () => {
    if (!reports || exportDisabledReason) {
      toast.info(exportDisabledReason || "No report data available for export.");
      return;
    }

    const fileStem = `wolan-${activeTab.toLowerCase().replace(/\s+/g, "-")}-${reports.period.key}`;

    if (activeTab === "Driver Performance") {
      downloadCsv(`${fileStem}.csv`, [
        ["driver", "status", "vehicle", "deliveries", "delivered", "failed", "returned", "success_rate", "rating", "current_cod", "pending_payout"],
        ...reports.drivers.map((driver) => [
          driver.full_name,
          driver.current_status,
          driver.vehicle_type || "",
          driver.period_deliveries,
          driver.period_delivered,
          driver.period_failed,
          driver.period_returned,
          driver.success_rate,
          driver.rating,
          driver.current_cod,
          driver.pending_payout,
        ]),
      ]);
      return;
    }

    if (activeTab === "COD Reconciliation") {
      downloadCsv(`${fileStem}.csv`, [
        ["record_kind", "reference_or_rider", "type", "status", "amount", "payout_amount", "cod_amount", "created_at", "completed_at"],
        ...reports.cod.recent_settlements.map((settlement) => [
          "settlement",
          settlement.reference,
          settlement.type,
          settlement.status,
          settlement.amount,
          settlement.payout_amount,
          settlement.cod_amount,
          settlement.createdAt || "",
          settlement.completed_at || "",
        ]),
        ...reports.cod.riders_with_cod.map((driver) => [
          "rider_balance",
          driver.full_name,
          "balance",
          driver.current_status,
          "",
          driver.pending_payout,
          driver.current_cod,
          "",
          "",
        ]),
      ]);
      return;
    }

    if (activeTab === "Zone Heatmap") {
      downloadCsv(`${fileStem}.csv`, [
        ["zone", "orders", "delivered", "failed", "returned", "active", "success_rate", "revenue", "cod"],
        ...reports.zones.map((zone) => [zone.name, zone.total_orders, zone.delivered, zone.failed, zone.returned, zone.active, zone.success_rate, zone.revenue, zone.cod]),
      ]);
      return;
    }

    if (activeTab === "Customer Reports") {
      downloadCsv(`${fileStem}.csv`, [
        ["unique_customers", "repeat_customers", "repeat_rate", "avg_orders_per_customer", "total_orders", "delivered_orders", "failed_orders", "complaints_configured"],
        [
          reports.customers.unique_customers,
          reports.customers.repeat_customers,
          reports.customers.repeat_rate,
          reports.customers.avg_orders_per_customer,
          reports.customers.total_customer_orders,
          reports.customers.delivered_orders,
          reports.customers.failed_orders,
          reports.customers.support_complaints_configured ? "yes" : "no",
        ],
      ]);
      return;
    }

    downloadCsv(`${fileStem}.csv`, [
      ["date", "orders", "delivered", "failed", "revenue", "cod"],
      ...reports.trends.map((row) => [row.date, row.orders, row.delivered, row.failed, row.revenue, row.cod]),
    ]);
  };

  return (
    <div data-cmp="Reports" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <Header title="Reports & Analytics" subtitle="Real backend reporting, COD reconciliation, and operational visibility" />

      <div className="flex flex-col gap-3 border-b border-border bg-card/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="responsive-table-frame flex max-w-full gap-1 pb-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === tab ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <div className="min-w-40 flex-1 sm:flex-none">
            <CustomSelect
              value={period}
              onValueChange={setPeriod}
              ariaLabel="Report period"
              options={periodOptions}
              triggerClassName="h-10 rounded-lg bg-muted"
            />
          </div>
          <button
            onClick={loadReports}
            title="Reload reports from the backend"
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 sm:flex-none"
          >
            {loading ? <LoaderGlyph size="xs" label="Refreshing reports" /> : <RefreshCwIcon className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <button
            onClick={exportReport}
            title={exportDisabledReason || "Download the current real backend report as CSV"}
            disabled={Boolean(exportDisabledReason)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      <div className="content-scroll flex-1 p-4 sm:p-6">
        {loading ? (
          <ReportsSkeleton activeTab={activeTab} />
        ) : error ? (
          <EmptyState title="Reports backend unavailable" message={error} />
        ) : !reports ? (
          <EmptyState title="No report payload returned" message="The reports endpoint responded without a usable report payload." />
        ) : (
          <>
            <div className="mb-4 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Scope:</span> {reports.scope.hub_name}
              {reports.scope.hub_code ? ` (${reports.scope.hub_code})` : ""} | <span className="font-semibold text-foreground">Period:</span> {reports.period.label}
              {reports.cross_hub.mode === "macro_only" ? " | Hub manager cross-hub access is macro-only." : ""}
            </div>

            <div className={activeTab === "Overview" ? "flex flex-col gap-5" : "hidden"}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <KpiCard label="Total Orders" value={formatNumber(overview?.total_orders)} helper="Backend order count for period" icon={PackageIcon} color="text-primary" />
                <KpiCard label="Revenue" value={formatCompactUGX(overview?.revenue)} helper="Delivered delivery fees only" icon={TrendingUpIcon} color="text-success" />
                <KpiCard label="Avg Delivery Time" value={`${overview?.avg_pickup_to_delivery_minutes || 0} min`} helper="Pickup to delivered" icon={TruckIcon} color="text-chart-2" />
                <KpiCard label="Avg Rider Rating" value={`${overview?.avg_rider_rating || 0}/5`} helper={`${formatNumber(overview?.total_riders)} riders in scope`} icon={StarIcon} color="text-warning" />
                <KpiCard label="Failed Rate" value={`${overview?.failed_rate || 0}%`} helper={`${formatNumber(overview?.failed_orders)} failed orders`} icon={AlertTriangleIcon} color="text-destructive" />
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
                <div className="mb-4 flex items-center gap-2">
                  <BarChart2Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Order Volume & Revenue</span>
                </div>
                {hasChartValue(reports.trends, ["orders", "revenue"]) ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reports.trends} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="reportOrders" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartTheme.primary} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={chartTheme.primary} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="orders" stroke={chartTheme.primary} strokeWidth={2} fill="url(#reportOrders)" name="Orders" />
                        <Line type="monotone" dataKey="delivered" stroke={chartTheme.success} strokeWidth={2} dot={false} name="Delivered" />
                        <Line type="monotone" dataKey="failed" stroke={chartTheme.danger} strokeWidth={2} dot={false} name="Failed" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState title="No order trend data" message="The backend returned zero orders for this report period." />
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
                  <p className="mb-4 text-sm font-semibold text-foreground">Status Mix</p>
                  {hasOrders ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {statusRows.map((row) => (
                        <div key={row.status} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                          <span className="text-xs capitalize text-muted-foreground">{row.status.replace(/_/g, " ")}</span>
                          <span className="text-sm font-bold text-foreground">{formatNumber(row.count)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No status records" message="No order statuses were returned for the selected period." />
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
                  <p className="mb-4 text-sm font-semibold text-foreground">Cross-Hub Visibility</p>
                  {reports.cross_hub.comparison.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {reports.cross_hub.comparison.slice(0, 6).map((hub, index) => {
                        const targetHit = Number(hub.target_hit_percentage ?? 0);
                        const totalOrders = Number(hub.total_orders ?? hub.high_level_totals?.orders ?? 0);
                        return (
                          <div key={`${hub.hub_code || hub.hub_name}-${index}`} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold text-foreground">{hub.hub_name || "Hub"} {hub.hub_code ? `(${hub.hub_code})` : ""}</span>
                              <span className="text-xs text-primary">{reports.cross_hub.mode === "macro_only" ? `${targetHit}% hit` : `${formatNumber(totalOrders)} orders | ${targetHit}% hit`}</span>
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-background">
                              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, targetHit)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      {reports.cross_hub.mode === "macro_only" ? (
                        <p className="text-[10px] text-muted-foreground">Hub manager view intentionally exposes only comparative target-hit data. No external hub drill-down is available.</p>
                      ) : null}
                    </div>
                  ) : (
                    <EmptyState title="No cross-hub report data" message="Cross-hub comparisons are either not available for this role or no hub data exists yet." />
                  )}
                </div>
              </div>
            </div>

            <div className={activeTab === "Driver Performance" ? "flex flex-col gap-5" : "hidden"}>
              <div className="rounded-xl border border-border bg-card shadow-custom">
                <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                  <TruckIcon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Driver Leaderboard</span>
                </div>
                {reports.drivers.length > 0 ? (
                  <div className="responsive-table-frame">
                    <div className="flex min-w-[48rem] flex-col divide-y divide-border">
                      <div className="grid px-5 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ gridTemplateColumns: "2rem 1.4fr 0.9fr 0.9fr 0.9fr 0.9fr 1fr" }}>
                        <span>#</span><span>Driver</span><span>Status</span><span>Deliveries</span><span>Success</span><span>Rating</span><span>COD Held</span>
                      </div>
                      {reports.drivers.map((driver, index) => (
                        <div key={driver.id} className="grid items-center px-5 py-3.5 text-xs hover:bg-muted/30" style={{ gridTemplateColumns: "2rem 1.4fr 0.9fr 0.9fr 0.9fr 0.9fr 1fr" }}>
                          <span className="font-bold text-muted-foreground">{index + 1}</span>
                          <div>
                            <p className="font-semibold text-foreground">{driver.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">{driver.vehicle_type || "No vehicle"} | {driver.bike_plate || "No plate"}</p>
                          </div>
                          <span className="capitalize text-muted-foreground">{driver.current_status.replace(/_/g, " ")}</span>
                          <span className="font-semibold text-foreground">{formatNumber(driver.period_deliveries)}</span>
                          <span className={driver.success_rate >= 80 ? "text-success" : driver.success_rate > 0 ? "text-warning" : "text-muted-foreground"}>{driver.success_rate}%</span>
                          <span>{driver.rating || 0}/5</span>
                          <span className={driver.current_cod > 0 ? "font-semibold text-warning" : "text-muted-foreground"}>{driver.current_cod > 0 ? formatCompactUGX(driver.current_cod) : "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-5">
                    <EmptyState title="No rider records" message="The backend returned no riders for this report scope." />
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
                <p className="mb-4 text-sm font-semibold text-foreground">Driver Period Deliveries</p>
                {hasChartValue(reports.drivers, ["period_deliveries"]) ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reports.drivers.slice(0, 10)} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                        <XAxis dataKey="full_name" tick={{ fill: chartTheme.tick, fontSize: 9 }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" />
                        <YAxis tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="period_deliveries" fill={chartTheme.primary} radius={[3, 3, 0, 0]} name="Deliveries" />
                        <Bar dataKey="period_delivered" fill={chartTheme.success} radius={[3, 3, 0, 0]} name="Delivered" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState title="No driver delivery activity" message="Riders exist, but no rider deliveries were returned for this period." />
                )}
              </div>
            </div>

            <div className={activeTab === "COD Reconciliation" ? "flex flex-col gap-5" : "hidden"}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Order COD" value={formatCompactUGX(reports.cod.total_order_cod)} helper="COD on orders in period" icon={WalletIcon} color="text-warning" />
                <KpiCard label="COD In Field" value={formatCompactUGX(reports.cod.in_field_total)} helper={`${formatNumber(reports.cod.active_cod_orders)} active COD orders`} icon={TruckIcon} color="text-primary" />
                <KpiCard label="COD Settled" value={formatCompactUGX(reports.cod.completed_cod_settlements)} helper="Completed COD settlements" icon={CheckCircleIcon} color="text-success" />
                <KpiCard label="Pending Withdrawals" value={formatCompactUGX(reports.cod.pending_withdrawals)} helper="Requested or approved payouts" icon={WalletIcon} color="text-destructive" />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
                  <p className="mb-4 text-sm font-semibold text-foreground">Rider COD / Payout Balances</p>
                  {reports.cod.riders_with_cod.length > 0 ? (
                    <div className="flex flex-col divide-y divide-border">
                      {reports.cod.riders_with_cod.map((driver) => (
                        <div key={driver.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                          <div>
                            <p className="font-semibold text-foreground">{driver.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">{driver.current_status.replace(/_/g, " ")} | payout {formatCompactUGX(driver.pending_payout)}</p>
                          </div>
                          <span className="font-bold text-warning">{formatCompactUGX(driver.current_cod)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No rider COD balances" message="No rider currently has COD or payout balance records in this scope." />
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
                  <p className="mb-4 text-sm font-semibold text-foreground">Recent Settlement Records</p>
                  {reports.cod.recent_settlements.length > 0 ? (
                    <div className="flex flex-col divide-y divide-border">
                      {reports.cod.recent_settlements.slice(0, 8).map((settlement) => (
                        <div key={settlement.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                          <div>
                            <p className="font-semibold text-foreground">{settlement.reference}</p>
                            <p className="text-[10px] text-muted-foreground">{settlement.rider?.full_name || "Rider"} | {settlement.type.replace(/_/g, " ")}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-foreground">{formatCompactUGX(settlement.amount)}</p>
                            <p className="text-[10px] capitalize text-muted-foreground">{settlement.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No settlement history" message="The backend returned no settlement or withdrawal records for this period." />
                  )}
                </div>
              </div>
            </div>

            <div className={activeTab === "Zone Heatmap" ? "flex flex-col gap-5" : "hidden"}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                {zonePieRows.map((zone) => (
                  <div key={zone.name} className="rounded-xl border border-border bg-card p-4 shadow-custom">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="h-3 w-3 shrink-0 rounded-full" style={{ background: zone.color }} />
                      <p className="text-xs font-semibold text-foreground">{zone.name}</p>
                    </div>
                    <p className="text-xl font-bold text-foreground">{zone.share_percentage}%</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{formatNumber(zone.total_orders)} orders | {zone.success_rate}% success</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
                  <p className="mb-4 text-sm font-semibold text-foreground">Deliveries by Zone</p>
                  {zonePieRows.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={zonePieRows} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="total_orders" nameKey="name">
                            {zonePieRows.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState title="No zone records" message="The backend returned no delivery zones for this period." />
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
                  <p className="mb-4 text-sm font-semibold text-foreground">Zone Success Comparison</p>
                  {zonePieRows.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={zonePieRows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                          <Bar dataKey="success_rate" fill={chartTheme.success} radius={[3, 3, 0, 0]} name="Success %" />
                          <Bar dataKey="failed" fill={chartTheme.danger} radius={[3, 3, 0, 0]} name="Failed" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState title="No zone performance data" message="No real zone performance rows are available for the selected period." />
                  )}
                </div>
              </div>
            </div>

            <div className={activeTab === "Customer Reports" ? "flex flex-col gap-5" : "hidden"}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Unique Customers" value={formatNumber(reports.customers.unique_customers)} helper="Grouped from order phone numbers" icon={UsersIcon} color="text-foreground" />
                <KpiCard label="Repeat Customers" value={`${reports.customers.repeat_rate}%`} helper={`${formatNumber(reports.customers.repeat_customers)} repeat customers`} icon={RefreshCwIcon} color="text-success" />
                <KpiCard label="Avg Orders / Customer" value={`${reports.customers.avg_orders_per_customer}`} helper="Based on orders in period" icon={PackageIcon} color="text-primary" />
                <KpiCard label="Failed Customer Orders" value={formatNumber(reports.customers.failed_orders)} helper="Actual failed order records" icon={AlertTriangleIcon} color="text-destructive" />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
                  <p className="mb-4 text-sm font-semibold text-foreground">Customer Order Trend</p>
                  {hasChartValue(reports.trends, ["orders"]) ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={reports.trends} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="customerOrders" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={chartTheme.primarySoft} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={chartTheme.primarySoft} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                          <XAxis dataKey="date" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, fontSize: 12 }} />
                          <Area type="monotone" dataKey="orders" stroke={chartTheme.primarySoft} strokeWidth={2} fill="url(#customerOrders)" name="Orders" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState title="No customer order data" message="No customer orders were returned for this period." />
                  )}
                </div>

                <div className={`rounded-xl border p-5 shadow-custom ${reports.customers.support_complaints_configured ? "border-success/25 bg-success/5" : "border-warning/25 bg-warning/5"}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <AlertTriangleIcon className="h-4 w-4 text-warning" />
                    <p className="text-sm font-semibold text-foreground">Support Complaint Pipeline</p>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{reports.customers.support_complaints_note}</p>
                  <p className={`mt-4 rounded-lg border bg-background/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider ${reports.customers.support_complaints_configured ? "border-success/20 text-success" : "border-warning/20 text-warning"}`}>
                    {reports.customers.support_complaints_configured ? "Configured through support API" : "No placeholder value shown"}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
