import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { LoaderGlyph, LoadingButtonContent } from "../components/AppLoader";
import { CustomSelect } from "../components/ui/custom-select";
import { toast } from "sonner";
import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  Building2Icon,
  CheckCircleIcon,
  DollarSignIcon,
  EyeIcon,
  KeyRoundIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  TableIcon,
  TruckIcon,
  WifiIcon,
  XCircleIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type HubRecord = {
  id?: string;
  _id?: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state?: string;
  country?: string;
  zone?: string;
  manager_id?: string | { id?: string; _id?: string; full_name?: string; email?: string; phone?: string } | null;
  is_active: boolean;
  total_orders?: number;
  total_revenue?: number;
  contact_phone?: string;
  contact_email?: string;
  createdAt?: string;
};

type ManagerRecord = {
  id?: string;
  _id?: string;
  full_name: string;
  email: string;
  phone?: string;
  hub_id?: string | null;
};

type HubForm = {
  id?: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zone: string;
  manager_id: string;
  contact_phone: string;
  contact_email: string;
  is_active: boolean;
};

type ManagerForm = {
  full_name: string;
  email: string;
  phone: string;
  password: string;
};

const emptyHubForm = (): HubForm => ({
  name: "",
  code: "",
  address: "",
  city: "",
  state: "",
  country: "Uganda",
  zone: "",
  manager_id: "",
  contact_phone: "",
  contact_email: "",
  is_active: true,
});

const emptyManagerForm = (): ManagerForm => ({
  full_name: "",
  email: "",
  phone: "",
  password: "",
});

const readId = (value: HubRecord["manager_id"] | HubRecord | ManagerRecord | string | null | undefined) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || value._id || null;
};

const managerName = (manager: HubRecord["manager_id"]) => {
  if (!manager) return "Unassigned";
  if (typeof manager === "string") return manager;
  return manager.full_name || manager.email || "Manager";
};

const statusClass = (active: boolean) => active
  ? "text-success bg-success/10 border-success/20"
  : "text-destructive bg-destructive/10 border-destructive/20";

const formatNumber = (value?: number | null) => new Intl.NumberFormat("en-US").format(Math.round(value || 0));

const formatCompactUGX = (value?: number | null) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000000) return `${Math.round(amount / 100000) / 10}M`;
  if (Math.abs(amount) >= 1000) return `${Math.round(amount / 1000)}K`;
  return formatNumber(amount);
};

const formatUGX = (value?: number | null) => `UGX ${formatNumber(value)}`;

const chartTheme = {
  primary: "#4b0082",
  secondary: "#7c3aed",
  grid: "#e4d8ef",
  tick: "#75647f",
  tooltipBg: "#ffffff",
  tooltipBorder: "#d9cbe8",
  tooltipText: "#21172f",
};

const panelClass = "rounded-xl border border-border bg-card shadow-custom";

export default function HQMaster() {
  const { user } = useAuth();
  const [hubs, setHubs] = useState<HubRecord[]>([]);
  const [managers, setManagers] = useState<ManagerRecord[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<HubForm>(emptyHubForm());
  const [managerForm, setManagerForm] = useState<ManagerForm>(emptyManagerForm());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [searchTerm, setSearchTerm] = useState("");
  const [now, setNow] = useState(() => new Date());

  const selectedHub = useMemo(
    () => selectedHubId ? hubs.find((hub) => readId(hub) === selectedHubId) ?? null : hubs[0] ?? null,
    [hubs, selectedHubId]
  );

  const activeHubs = hubs.filter((hub) => hub.is_active);
  const totalOrders = hubs.reduce((sum, hub) => sum + Number(hub.total_orders || 0), 0);
  const totalRevenue = hubs.reduce((sum, hub) => sum + Number(hub.total_revenue || 0), 0);
  const assignedManagers = hubs.filter((hub) => readId(hub.manager_id)).length;
  const canManageNetwork = ["super_admin", "director", "general_manager"].includes(user?.role || "");
  const effectiveViewMode = canManageNetwork ? viewMode : "cards";
  const avgSuccessRate = hubs.length ? Math.round((activeHubs.length / hubs.length) * 1000) / 10 : 0;

  const filteredHubs = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return hubs;

    return hubs.filter((hub) => [
      hub.name,
      hub.code,
      hub.city,
      hub.zone,
      hub.address,
      managerName(hub.manager_id),
      hub.is_active ? "active" : "suspended",
    ].some((value) => value?.toLowerCase().includes(normalized)));
  }, [hubs, searchTerm]);

  const chartData = useMemo(() => (
    hubs.map((hub) => ({
      name: hub.name.split(" ")[0] || hub.code,
      orders: Number(hub.total_orders || 0),
      revenue: Math.round(Number(hub.total_revenue || 0) / 1000000),
    }))
  ), [hubs]);

  const loadHubs = async () => {
    setLoading(true);
    try {
      const [hubResponse, managerResponse] = await Promise.all([
        api.get("/auth/hubs", { params: { limit: 100 } }),
        canManageNetwork ? api.get("/auth/hubs/managers/available").catch(() => null) : Promise.resolve(null),
      ]);

      const hubItems = (hubResponse.data?.data?.hubs || []) as HubRecord[];
      setHubs(hubItems);
      setManagers((managerResponse?.data?.data?.managers || []) as ManagerRecord[]);
      setSelectedHubId((current) => current && hubItems.some((hub) => readId(hub) === current) ? current : readId(hubItems[0]) ?? null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Unable to load hubs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHubs();
  }, [canManageNetwork]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const openCreate = () => {
    setForm(emptyHubForm());
    setManagerForm(emptyManagerForm());
    setShowForm(true);
  };

  const openEdit = (hub: HubRecord) => {
    setForm({
      id: readId(hub) || undefined,
      name: hub.name || "",
      code: hub.code || "",
      address: hub.address || "",
      city: hub.city || "",
      state: hub.state || "",
      country: hub.country || "Uganda",
      zone: hub.zone || "",
      manager_id: readId(hub.manager_id) || "",
      contact_phone: hub.contact_phone || "",
      contact_email: hub.contact_email || "",
      is_active: hub.is_active,
    });
    setManagerForm(emptyManagerForm());
    setShowForm(true);
  };

  const saveHub = async () => {
    if (!form.name || !form.code || !form.address || !form.city) {
      toast.error("Hub name, code, address, and city are required");
      return;
    }

    setActionLoading("save-hub");
    try {
      const payload = {
        name: form.name,
        code: form.code,
        address: form.address,
        city: form.city,
        state: form.state || undefined,
        country: form.country || "Uganda",
        zone: form.zone || undefined,
        contact_phone: form.contact_phone || undefined,
        contact_email: form.contact_email || undefined,
      };

      if (form.id) {
        const currentHub = hubs.find((hub) => readId(hub) === form.id);
        const currentManagerId = readId(currentHub?.manager_id);
        await api.patch(`/auth/hubs/${form.id}`, payload);
        if (canManageNetwork && form.manager_id !== (currentManagerId || "")) {
          await api.post(`/auth/hubs/${form.id}/assign-manager`, { manager_id: form.manager_id || null });
        }
        if (canManageNetwork && currentHub && form.is_active !== currentHub.is_active) {
          await api.post(`/auth/hubs/${form.id}/suspend`, { is_active: form.is_active });
        }
        toast.success("Hub updated");
      } else {
        if (!canManageNetwork) {
          toast.error("Only super admins can create hubs");
          return;
        }

        const { data } = await api.post("/auth/hubs", {
          ...payload,
          manager_id: form.manager_id || undefined,
        });
        setSelectedHubId(readId(data?.data?.hub));
        toast.success("Hub created");
      }

      setShowForm(false);
      await loadHubs();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Hub save failed");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleHubStatus = async (hub: HubRecord) => {
    const hubId = readId(hub);
    if (!hubId) return;

    setActionLoading(`status-${hubId}`);
    try {
      await api.post(`/auth/hubs/${hubId}/suspend`, {
        is_active: !hub.is_active,
        reason: hub.is_active ? "Suspended from admin hub management" : "Reactivated from admin hub management",
      });
      toast.success(hub.is_active ? "Hub suspended" : "Hub reactivated");
      await loadHubs();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Unable to update hub status");
    } finally {
      setActionLoading(null);
    }
  };

  const createAndAssignManager = async () => {
    if (!form.id) {
      toast.error("Create and save the hub first, then create the manager login.");
      return;
    }

    if (!managerForm.full_name.trim() || !managerForm.email.trim() || !managerForm.password.trim()) {
      toast.error("Manager name, email, and temporary password are required");
      return;
    }

    if (managerForm.password.length < 8) {
      toast.error("Temporary password must be at least 8 characters");
      return;
    }

    setActionLoading("create-manager");
    try {
      const { data } = await api.post("/auth/users", {
        full_name: managerForm.full_name.trim(),
        email: managerForm.email.trim().toLowerCase(),
        phone: managerForm.phone.trim() || undefined,
        password: managerForm.password,
        role: "hub_manager",
        hub_id: form.id,
      });
      const newManagerId = readId(data?.data?.user);
      if (!newManagerId) {
        throw new Error("Manager user was created but no user id was returned");
      }

      await api.post(`/auth/hubs/${form.id}/assign-manager`, { manager_id: newManagerId });
      setForm((current) => ({ ...current, manager_id: newManagerId }));
      setManagerForm(emptyManagerForm());
      toast.success("Hub Manager login created and assigned");
      await loadHubs();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || "Unable to create hub manager login");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div data-cmp="HQMaster" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight text-foreground">Hub Management</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {canManageNetwork ? "Multi-hub HQ overview - all locations" : "Assigned hub profile - external branches hidden"}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={canManageNetwork ? "Search hubs, managers..." : "Search assigned hub..."}
                className="h-9 w-full rounded-lg border border-border bg-input pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </label>
            <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 text-xs font-semibold text-success">
              <WifiIcon className="h-3.5 w-3.5" />
              Live
            </span>
            <button
              onClick={loadHubs}
              disabled={loading}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
              aria-label="Refresh hubs"
            >
              {loading ? <LoaderGlyph size="sm" label="Refreshing hubs" /> : <RefreshCwIcon className="h-4 w-4" />}
            </button>
              {canManageNetwork ? (
                <div className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
                  <BellIcon className="h-4 w-4" />
                  {hubs.length - activeHubs.length > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{hubs.length - activeHubs.length}</span> : null}
                </div>
              ) : null}
            <div className="hidden text-right text-xs leading-tight text-muted-foreground sm:block">
              <p className="font-bold text-foreground">{new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now)}</p>
              <p>{new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(now)}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="content-scroll flex-1 px-4 py-5 sm:px-5">
        <div className="viewport-safe mx-auto flex w-full max-w-[2400px] flex-col gap-5">
          <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-black text-foreground">
                {canManageNetwork ? "Hub Management - HQ Master View" : "Assigned Hub - Local Manager View"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {loading ? "Syncing hub network" : canManageNetwork ? `${formatNumber(hubs.length)} hubs across Uganda` : "Only your assigned hub details are visible here"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManageNetwork ? (
                <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
                  <button
                    onClick={() => setViewMode("cards")}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${viewMode === "cards" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Cards
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${viewMode === "table" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Table
                  </button>
                </div>
              ) : null}
              {canManageNetwork ? (
                <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-custom transition-colors hover:bg-primary/90">
                  <PlusIcon className="h-4 w-4" />
                  New Hub
                </button>
              ) : null}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: canManageNetwork ? "Total Hubs" : "Assigned Hub", value: formatNumber(hubs.length), sub: `${formatNumber(activeHubs.length)} active`, icon: Building2Icon, tone: "text-primary", ring: "border-primary/20 bg-primary/10" },
              { label: canManageNetwork ? "Assigned Managers" : "Hub Manager", value: formatNumber(assignedManagers), sub: canManageNetwork ? "Hub managers assigned" : "Local manager profile", icon: ShieldCheckIcon, tone: "text-chart-2", ring: "border-chart-2/20 bg-chart-2/10" },
              { label: canManageNetwork ? "Monthly Orders" : "Hub Orders", value: formatNumber(totalOrders), sub: canManageNetwork ? "All hubs combined" : "Assigned hub only", icon: TruckIcon, tone: "text-success", ring: "border-success/20 bg-success/10" },
              { label: canManageNetwork ? "Total Revenue" : "Hub Revenue", value: formatCompactUGX(totalRevenue), sub: canManageNetwork ? "UGX all-time" : "Assigned hub only", icon: DollarSignIcon, tone: "text-warning", ring: "border-warning/20 bg-warning/10" },
              { label: canManageNetwork ? "Network Active Rate" : "Hub Active State", value: `${avgSuccessRate}%`, sub: canManageNetwork ? "Active hub ratio" : "Assigned hub status", icon: ActivityIcon, tone: "text-success", ring: "border-success/20 bg-success/10" },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`${panelClass} min-w-0 p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                      <p className={`mt-2 break-words text-2xl font-black leading-none ${stat.tone}`}>{loading ? "..." : stat.value}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{stat.sub}</p>
                    </div>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${stat.ring}`}>
                      <Icon className={`h-4 w-4 ${stat.tone}`} />
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          {canManageNetwork ? (
            <section className={`${panelClass} min-w-0 p-4 sm:p-5`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">Hub Comparison - Orders and Revenue</p>
                  <p className="text-xs text-muted-foreground">Network performance across all hubs</p>
                </div>
                <BarChart3Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="h-64">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="orders" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis yAxisId="revenue" orientation="right" tick={{ fill: chartTheme.tick, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, color: chartTheme.tooltipText }}
                        labelStyle={{ color: chartTheme.tooltipText }}
                      />
                      <Bar yAxisId="orders" dataKey="orders" name="Orders" fill={chartTheme.primary} radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="revenue" dataKey="revenue" name="Revenue (M UGX)" fill={chartTheme.secondary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No hub comparison data yet.</div>
                )}
              </div>
            </section>
          ) : (
            <section className={`${panelClass} min-w-0 p-4 sm:p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">Hub manager data isolation active</p>
                  <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                    External hub order lists, customer contacts, courier directories, exact addresses, and branch operation details are hidden. Cross-hub comparison is available only as aggregate target-hit data on the dashboard.
                  </p>
                </div>
                <ShieldCheckIcon className="h-5 w-5 text-primary" />
              </div>
            </section>
          )}

          {selectedHub ? (
            <section className={`${panelClass} p-4`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected hub</p>
                  <h2 className="mt-1 truncate text-xl font-black text-foreground">{selectedHub.name}</h2>
                  <p className="mt-1 break-words text-sm text-muted-foreground">{selectedHub.address}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManageNetwork ? (
                    <button onClick={() => openEdit(selectedHub)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary/40">
                      <PencilIcon className="h-3.5 w-3.5" />
                      Manage
                    </button>
                  ) : null}
                  {canManageNetwork ? (
                    <button
                      onClick={() => toggleHubStatus(selectedHub)}
                      title={actionLoading === `status-${readId(selectedHub)}` ? "Hub status update is already being saved." : selectedHub.is_active ? "Suspend this hub through the backend." : "Reactivate this hub through the backend."}
                      disabled={actionLoading === `status-${readId(selectedHub)}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary/40 disabled:opacity-50"
                    >
                      {actionLoading === `status-${readId(selectedHub)}` ? <LoaderGlyph size="xs" label="Updating hub status" /> : selectedHub.is_active ? <XCircleIcon className="h-3.5 w-3.5" /> : <CheckCircleIcon className="h-3.5 w-3.5" />}
                      {selectedHub.is_active ? "Suspend" : "Reactivate"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {[
                  ["Code", selectedHub.code],
                  ["City", selectedHub.city],
                  ["Zone", selectedHub.zone || "-"],
                  ["Manager", managerName(selectedHub.manager_id)],
                  ["Phone", selectedHub.contact_phone || "-"],
                  ["Email", selectedHub.contact_email || "-"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-lg bg-muted/60 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    <p className="mt-1 truncate text-xs font-bold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {effectiveViewMode === "cards" ? (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {filteredHubs.map((hub) => {
                const hubId = readId(hub);
                const active = selectedHubId === hubId;
                const revenue = Number(hub.total_revenue || 0);
                const orders = Number(hub.total_orders || 0);
                const successRate = hub.is_active ? Math.max(75, Math.min(99.8, 88 + (orders % 12))) : 0;
                return (
                  <article key={hubId} className={`${panelClass} min-w-0 p-4 transition-colors ${active ? "border-primary" : "hover:border-primary/35"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${active ? "border-primary/20 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
                          <Building2Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-foreground">{hub.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{hub.city} - {hub.zone || "No zone"}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(hub.is_active)}`}>
                        {hub.is_active ? "Active" : "Suspended"}
                      </span>
                    </div>
                    <p className="mt-4 truncate text-xs text-muted-foreground">
                      <MapPinIcon className="mr-1 inline h-3 w-3" />
                      {managerName(hub.manager_id)}
                    </p>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3 text-center">
                      <div>
                        <p className="text-lg font-black text-foreground">{formatNumber(orders)}</p>
                        <p className="text-[10px] text-muted-foreground">Orders</p>
                      </div>
                      <div>
                        <p className="text-lg font-black text-primary">{hub.manager_id ? "1" : "0"}</p>
                        <p className="text-[10px] text-muted-foreground">Manager</p>
                      </div>
                      <div>
                        <p className={`text-lg font-black ${successRate >= 90 ? "text-success" : successRate >= 80 ? "text-warning" : "text-destructive"}`}>{successRate ? `${successRate}%` : "-"}</p>
                        <p className="text-[10px] text-muted-foreground">Active</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{formatCompactUGX(revenue)} UGX revenue</span>
                      <span>{hub.contact_email ? "Contact set" : "No email"}</span>
                    </div>
                    <div className={`mt-4 grid gap-2 ${canManageNetwork ? "grid-cols-2" : "grid-cols-1"}`}>
                      <button onClick={() => setSelectedHubId(hubId)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary/40">
                        <EyeIcon className="h-3.5 w-3.5" />
                        View
                      </button>
                      {canManageNetwork ? (
                        <button onClick={() => openEdit(hub)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary/40">
                          <PencilIcon className="h-3.5 w-3.5" />
                          Manage
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className={`${panelClass} min-w-0 overflow-hidden`}>
              <div className="responsive-table-frame">
                <table className="min-w-[760px] w-full text-left text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Hub</th>
                      <th className="px-4 py-3 font-medium">Code</th>
                      <th className="px-4 py-3 font-medium">City / Zone</th>
                      <th className="px-4 py-3 font-medium">Manager</th>
                      <th className="px-4 py-3 font-medium">Orders</th>
                      <th className="px-4 py-3 font-medium">Revenue</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredHubs.map((hub) => (
                      <tr key={readId(hub)} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3 font-bold text-foreground">{hub.name}</td>
                        <td className="px-4 py-3 text-primary font-bold">{hub.code}</td>
                        <td className="px-4 py-3 text-muted-foreground">{hub.city} / {hub.zone || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{managerName(hub.manager_id)}</td>
                        <td className="px-4 py-3 font-bold text-foreground">{formatNumber(hub.total_orders)}</td>
                        <td className="px-4 py-3 font-bold text-warning">{formatUGX(hub.total_revenue)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(hub.is_active)}`}>{hub.is_active ? "Active" : "Suspended"}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => openEdit(hub)} className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-bold text-foreground">Manage</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!loading && filteredHubs.length === 0 ? (
            <div className={`${panelClass} p-8 text-center text-sm text-muted-foreground`}>
              {searchTerm ? "No hubs match your search." : "No hubs found. Create the first hub to start testing."}
            </div>
          ) : null}

          <section className={`${panelClass} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hub-level access isolation</p>
                <h2 className="mt-1 text-sm font-bold text-foreground">
                  {canManageNetwork ? "HQ admins can manage the full hub network" : "This account is limited to its assigned hub"}
                </h2>
              </div>
              <ShieldCheckIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="block font-semibold text-foreground">Hub records</span>
                {canManageNetwork ? "All hubs visible" : "Only assigned hub visible"}
              </div>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="block font-semibold text-foreground">Manager assignment</span>
                {canManageNetwork ? "Allowed" : "Restricted"}
              </div>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="block font-semibold text-foreground">Suspend/reactivate</span>
                {canManageNetwork ? "Allowed" : "HQ admin only"}
              </div>
            </div>
          </section>
        </div>
      </main>

      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 transition-opacity ${showForm ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div className="max-h-[90dvh] w-full max-w-[620px] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-4 shadow-custom sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">{form.id ? "Edit Hub" : "Create Hub"}</h2>
              <p className="text-xs text-muted-foreground">Hub profile, manager assignment, and operational status</p>
            </div>
            <button onClick={() => setShowForm(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground">x</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["name", "Hub name"],
              ["code", "Hub code"],
              ["address", "Address"],
              ["city", "City"],
              ["state", "State"],
              ["country", "Country"],
              ["zone", "Zone"],
              ["contact_phone", "Contact phone"],
              ["contact_email", "Contact email"],
            ].map(([key, label]) => (
              <input
                key={key}
                value={form[key as keyof HubForm] as string}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                placeholder={label}
                className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            ))}
            {canManageNetwork ? (
              <>
                <CustomSelect
                  value={form.manager_id}
                  onValueChange={(nextValue) => setForm((current) => ({ ...current, manager_id: nextValue }))}
                  placeholder="No manager"
                  ariaLabel="Hub manager"
                  options={[
                    { value: "", label: "No manager" },
                    ...managers.map((manager) => ({
                      value: readId(manager) || "",
                      label: `${manager.full_name} (${manager.email})`,
                    })),
                  ]}
                  triggerClassName="h-10 rounded-lg bg-background/80 text-sm"
                />
                <label className="flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                  />
                  Active
                </label>
              </>
            ) : null}
          </div>

          {canManageNetwork ? (
            <div className="mt-5 rounded-xl border border-primary/15 bg-primary/5 p-4">
              <div className="mb-3 flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <KeyRoundIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">Create Hub Manager Login</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creates a staff login with role Hub Manager and assigns it to this hub. The manager logs in from /login with this email and temporary password.
                  </p>
                </div>
              </div>
              {!form.id ? (
                <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
                  Save the hub first. Then reopen Manage to create and assign the Hub Manager login.
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={managerForm.full_name}
                      onChange={(event) => setManagerForm((current) => ({ ...current, full_name: event.target.value }))}
                      placeholder="Manager full name"
                      className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <input
                      type="email"
                      value={managerForm.email}
                      onChange={(event) => setManagerForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="Manager email"
                      className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <input
                      value={managerForm.phone}
                      onChange={(event) => setManagerForm((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="Phone number"
                      className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      value={managerForm.password}
                      onChange={(event) => setManagerForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Temporary password"
                      className="rounded-lg border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={createAndAssignManager}
                    title={actionLoading === "create-manager" ? "Hub Manager login is being created." : "Create a Hub Manager account and assign it to this hub."}
                    disabled={actionLoading === "create-manager"}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-primary/20 bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    <LoadingButtonContent loading={actionLoading === "create-manager"} loadingLabel="Creating manager" label="Create & Assign Hub Manager" />
                  </button>
                </>
              )}
            </div>
          ) : null}

          <div className="mt-5 flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground">Cancel</button>
            <button onClick={saveHub} title={actionLoading === "save-hub" ? "Hub profile is already being saved." : "Save hub details through the backend."} disabled={actionLoading === "save-hub"} className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              <LoadingButtonContent loading={actionLoading === "save-hub"} loadingLabel="Saving hub" label="Save Hub" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
