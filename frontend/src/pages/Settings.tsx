import { useEffect, useRef, useState } from "react";
import Header from "../components/Header";
import { LoaderGlyph, LoadingButtonContent } from "../components/AppLoader";
import SupportPanel from "../components/SupportPanel";
import { CustomSelect } from "../components/ui/custom-select";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import api from "../lib/api";
import {
  BuildingIcon,
  TruckIcon,
  BellIcon,
  UsersIcon,
  ShieldIcon,
  PaletteIcon,
  GlobeIcon,
  CreditCardIcon,
  SaveIcon,
  CheckCircleIcon,
  LockOpenIcon,
  RefreshCwIcon,
  HelpCircleIcon,
} from "lucide-react";

const sections = [
  { key: `business`, label: `Business`, icon: BuildingIcon },
  { key: `regional`, label: `Regional Ops`, icon: GlobeIcon },
  { key: `dispatch`, label: `Dispatch`, icon: TruckIcon },
  { key: `notifications`, label: `Notifications`, icon: BellIcon },
  { key: `team`, label: `Team & Users`, icon: UsersIcon },
  { key: `security`, label: `Security`, icon: ShieldIcon },
  { key: `branding`, label: `Branding`, icon: PaletteIcon },
  { key: `integrations`, label: `Integrations`, icon: GlobeIcon },
  { key: `billing`, label: `Billing`, icon: CreditCardIcon },
  { key: `support`, label: `Support`, icon: HelpCircleIcon },
];

type Toggle = { label: string; desc: string; on: boolean };

const initialNotifications: Toggle[] = [
  { label: `New Order Alert`, desc: `Notify dispatchers when a new order is placed`, on: true },
  { label: `Failed Delivery SMS`, desc: `Send SMS to customer when delivery fails`, on: true },
  { label: `GPS Dark Alert`, desc: `Alert when rider GPS goes offline`, on: true },
  { label: `COD Overdue Alert`, desc: `Alert when COD not remitted after 24 hours`, on: true },
  { label: `Rider Check-In`, desc: `Notify hub manager when rider checks in`, on: false },
  { label: `Daily Report Email`, desc: `Send daily summary report to manager email`, on: true },
  { label: `Low Rider Count`, desc: `Alert when available riders drop below threshold`, on: false },
];

const initialDispatchRules: Toggle[] = [
  { label: `Auto-assign nearest available rider`, desc: `Dispatch uses rider availability and distance`, on: true },
  { label: `Prioritize Elite merchant orders`, desc: `Elite merchant orders stay ahead in the queue`, on: true },
  { label: `Block offline riders from new assignments`, desc: `Offline riders cannot receive new delivery work`, on: true },
  { label: `Allow rider self-assignment via app`, desc: `Riders can claim compatible open orders`, on: false },
];

const initialAlertChannels: Toggle[] = [
  { label: `SMS (Africa's Talking)`, desc: `Operational SMS alerts`, on: true },
  { label: `WhatsApp Notifications`, desc: `Simulated or provider-backed WhatsApp alerts`, on: true },
  { label: `Email Reports`, desc: `Daily and exception reports`, on: true },
  { label: `In-App Push`, desc: `Realtime in-app notification records`, on: true },
];

const initialSecuritySettings: Toggle[] = [
  { label: `Two-Factor Authentication`, desc: `Require 2FA for all admin logins`, on: false },
  { label: `Session Timeout (30 min)`, desc: `Auto-logout after inactivity`, on: true },
  { label: `Login IP Whitelist`, desc: `Only allow logins from approved IPs`, on: false },
  { label: `Audit Log`, desc: `Track all admin actions and changes`, on: true },
];

type TeamMember = {
  id?: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  phone?: string;
  hub?: string;
  account_locked?: boolean;
  failed_login_attempts?: number;
  locked_reason?: string | null;
};

type SettingsDraft = {
  inputValues?: Record<string, string>;
  notifications?: Toggle[];
  dispatchRules?: Toggle[];
  alertChannels?: Toggle[];
  securitySettings?: Toggle[];
  uploadedLogoName?: string;
  teamMembers?: TeamMember[];
  selectedIntegration?: string;
};

type IntegrationStatus = {
  key: string;
  name: string;
  configured: boolean;
  status: string;
  detail: string;
  provider?: string | null;
  required_now?: boolean;
  features?: string[];
};

type OperationalSettings = {
  currency_code: string;
  country: string;
  country_code: string;
  default_phone_code: string;
  timezone: string;
  primary_city: string;
  operating_region: string;
  default_latitude: number;
  default_longitude: number;
  service_radius_km: number;
  distance_unit: string;
  cod_enabled: boolean;
  pickup_key_required: boolean;
  hub_scan_required: boolean;
  google_maps_distance_required: boolean;
  allow_cross_border_dispatch: boolean;
};

type OperationalSettingsOptions = {
  currencies: Array<{ code: string; label: string }>;
  timezones: string[];
  distance_units: string[];
};

const defaultOperationalSettings: OperationalSettings = {
  currency_code: `UGX`,
  country: `Uganda`,
  country_code: `UG`,
  default_phone_code: `+256`,
  timezone: `Africa/Kampala`,
  primary_city: `Kampala`,
  operating_region: `Kampala Metropolitan`,
  default_latitude: 0.3476,
  default_longitude: 32.5825,
  service_radius_km: 25,
  distance_unit: `km`,
  cod_enabled: true,
  pickup_key_required: true,
  hub_scan_required: true,
  google_maps_distance_required: true,
  allow_cross_border_dispatch: false,
};

const defaultOperationalOptions: OperationalSettingsOptions = {
  currencies: [
    { code: `UGX`, label: `Ugandan Shilling` },
    { code: `KES`, label: `Kenyan Shilling` },
    { code: `TZS`, label: `Tanzanian Shilling` },
    { code: `RWF`, label: `Rwandan Franc` },
  ],
  timezones: [`Africa/Kampala`, `Africa/Nairobi`, `Africa/Dar_es_Salaam`, `Africa/Kigali`],
  distance_units: [`km`],
};

const settingsStorageKey = `wolan-admin-settings-draft`;

const loadSettingsDraft = (): SettingsDraft | null => {
  if (typeof window === `undefined`) return null;

  try {
    const raw = window.localStorage.getItem(settingsStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const initialTeam: TeamMember[] = [
  { name: `Admin Wolan`, email: `admin@wolan.ug`, role: `Super Admin`, active: true },
  { name: `James Okello`, email: `james@wolan.ug`, role: `Hub Manager`, active: true },
  { name: `Patricia Nambatya`, email: `patricia@wolan.ug`, role: `Dispatcher`, active: true },
  { name: `Brian Ssekandi`, email: `brian@wolan.ug`, role: `Dispatcher`, active: false },
];

const roleLabels: Record<string, string> = {
  super_admin: `Super Admin`,
  director: `Director`,
  general_manager: `General Manager`,
  coo: `COO`,
  regional_manager: `Regional Manager`,
  hub_manager: `Hub Manager`,
  ops_coordinator: `Dispatcher`,
  rider: `Rider`,
};

const readId = (value: string | { id?: string; _id?: string } | null | undefined) => {
  if (!value) return ``;
  if (typeof value === `string`) return value;
  return value.id || value._id || ``;
};

const formatHubLabel = (hub: string | { id?: string; _id?: string; name?: string; code?: string; city?: string } | null | undefined) => {
  if (!hub) return `All hubs`;
  if (typeof hub === `string`) return hub;
  return [hub.name, hub.code, hub.city].filter(Boolean).join(` | `) || readId(hub);
};

export default function Settings() {
  const { user } = useAuth();
  const [settingsDraft] = useState<SettingsDraft | null>(() => loadSettingsDraft());
  const [activeSection, setActiveSection] = useState(`business`);
  const [notifications, setNotifications] = useState(() => settingsDraft?.notifications || initialNotifications);
  const [dispatchRules, setDispatchRules] = useState(() => settingsDraft?.dispatchRules || initialDispatchRules);
  const [alertChannels, setAlertChannels] = useState(() => settingsDraft?.alertChannels || initialAlertChannels);
  const [securitySettings, setSecuritySettings] = useState(() => settingsDraft?.securitySettings || initialSecuritySettings);
  const [uploadedLogoName, setUploadedLogoName] = useState(settingsDraft?.uploadedLogoName || ``);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => settingsDraft?.teamMembers || initialTeam);
  const [editingTeamEmail, setEditingTeamEmail] = useState<string | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamActionLoading, setTeamActionLoading] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState(settingsDraft?.selectedIntegration || ``);
  const [integrationStatuses, setIntegrationStatuses] = useState<IntegrationStatus[]>([]);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [operationSettings, setOperationSettings] = useState<OperationalSettings>(defaultOperationalSettings);
  const [operationOptions, setOperationOptions] = useState<OperationalSettingsOptions>(defaultOperationalOptions);
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationSaving, setOperationSaving] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const settingsContentRef = useRef<HTMLDivElement | null>(null);

  const handleSave = () => {
    const inputValues = Object.fromEntries(
      Array.from(settingsContentRef.current?.querySelectorAll<HTMLInputElement>(`input[data-setting-key]`) || [])
        .map((input) => [input.dataset.settingKey || input.name, input.value])
        .filter(([key]) => Boolean(key))
    );

    window.localStorage.setItem(settingsStorageKey, JSON.stringify({
      inputValues,
      notifications,
      dispatchRules,
      alertChannels,
      securitySettings,
      uploadedLogoName,
      teamMembers,
      selectedIntegration,
      savedAt: new Date().toISOString(),
    }));

    setSaved(true);
    toast.success(`Settings draft saved on this device`);
    setTimeout(() => setSaved(false), 2500);
  };

  const getDraftValue = (key: string, fallback: string) => settingsDraft?.inputValues?.[key] || fallback;

  const loadTeamMembers = async () => {
    setTeamLoading(true);
    setTeamError(null);

    try {
      const response = await api.get(`/auth/users`, {
        params: {
          roles: `super_admin,director,general_manager,coo,regional_manager,hub_manager,ops_coordinator`,
          limit: 100,
        },
      });
      const users = response.data?.data?.users || response.data?.users || [];
      setTeamMembers(users.map((user: any) => ({
        id: user.id || user._id,
        name: user.full_name || user.email,
        email: user.email,
        phone: user.phone,
        role: roleLabels[user.role] || user.role,
        hub: formatHubLabel(user.hub_id),
        active: user.is_active !== false,
        account_locked: Boolean(user.account_locked),
        failed_login_attempts: Number(user.failed_login_attempts || 0),
        locked_reason: user.locked_reason || null,
      })));
    } catch (error: any) {
      setTeamError(error.response?.data?.message || `Unable to load backend team accounts`);
    } finally {
      setTeamLoading(false);
    }
  };

  const loadIntegrationStatuses = async () => {
    setIntegrationLoading(true);
    setIntegrationError(null);
    try {
      const response = await api.get(`/auth/integrations`);
      setIntegrationStatuses(response.data?.data?.integrations || response.data?.integrations || []);
    } catch (error: any) {
      setIntegrationError(error.response?.data?.message || `Unable to load backend integration status`);
    } finally {
      setIntegrationLoading(false);
    }
  };

  const loadOperationalSettings = async () => {
    setOperationLoading(true);
    setOperationError(null);
    try {
      const response = await api.get(`/auth/settings/operations`);
      const nextSettings = response.data?.data?.settings || response.data?.settings;
      const nextOptions = response.data?.data?.options || response.data?.options;
      if (nextSettings) {
        setOperationSettings({
          ...defaultOperationalSettings,
          ...nextSettings,
          default_latitude: Number(nextSettings.default_latitude ?? defaultOperationalSettings.default_latitude),
          default_longitude: Number(nextSettings.default_longitude ?? defaultOperationalSettings.default_longitude),
          service_radius_km: Number(nextSettings.service_radius_km ?? defaultOperationalSettings.service_radius_km),
        });
      }
      if (nextOptions) {
        setOperationOptions({
          currencies: nextOptions.currencies?.length ? nextOptions.currencies : defaultOperationalOptions.currencies,
          timezones: nextOptions.timezones?.length ? nextOptions.timezones : defaultOperationalOptions.timezones,
          distance_units: nextOptions.distance_units?.length ? nextOptions.distance_units : defaultOperationalOptions.distance_units,
        });
      }
    } catch (error: any) {
      setOperationError(error.response?.data?.message || `Unable to load backend regional settings`);
    } finally {
      setOperationLoading(false);
    }
  };

  const saveOperationalSettings = async () => {
    setOperationSaving(true);
    setOperationError(null);
    try {
      const response = await api.patch(`/auth/settings/operations`, operationSettings);
      const nextSettings = response.data?.data?.settings || response.data?.settings;
      if (nextSettings) {
        setOperationSettings({
          ...defaultOperationalSettings,
          ...nextSettings,
          default_latitude: Number(nextSettings.default_latitude ?? defaultOperationalSettings.default_latitude),
          default_longitude: Number(nextSettings.default_longitude ?? defaultOperationalSettings.default_longitude),
          service_radius_km: Number(nextSettings.service_radius_km ?? defaultOperationalSettings.service_radius_km),
        });
      }
      toast.success(`Regional operational settings saved`);
    } catch (error: any) {
      const message = error.response?.data?.message || `Unable to save regional settings`;
      setOperationError(message);
      toast.error(message);
    } finally {
      setOperationSaving(false);
    }
  };

  useEffect(() => {
    loadTeamMembers();
    loadIntegrationStatuses();
    loadOperationalSettings();
  }, []);

  const toggleNotification = (idx: number) => {
    setNotifications((prev) => prev.map((n, i) => (i === idx ? { ...n, on: !n.on } : n)));
  };

  const toggleDispatchRule = (idx: number) => {
    setDispatchRules((prev) => prev.map((n, i) => (i === idx ? { ...n, on: !n.on } : n)));
  };

  const toggleAlertChannel = (idx: number) => {
    setAlertChannels((prev) => prev.map((n, i) => (i === idx ? { ...n, on: !n.on } : n)));
  };

  const toggleSecuritySetting = (idx: number) => {
    setSecuritySettings((prev) => prev.map((n, i) => (i === idx ? { ...n, on: !n.on } : n)));
  };

  const inviteUser = () => {
    window.location.href = `mailto:?subject=Wolan admin access invitation&body=You have been invited to join Wolan Delivery operations.`;
    toast.success(`Opening invitation draft`);
  };

  const editTeamMember = (email: string) => {
    setEditingTeamEmail(email);
  };

  const configureIntegration = (integration: IntegrationStatus) => {
    setSelectedIntegration(integration.name);
    if (integration.configured) {
      toast.success(`${integration.name} is configured on the backend.`);
      return;
    }
    toast.info(`${integration.name}: ${integration.detail}`);
  };

  const fallbackIntegrations: IntegrationStatus[] = [
    { key: `sms`, name: `Africa's Talking SMS`, configured: false, status: `Deferred until handover`, detail: `SMS provider activation is deferred until client credentials are supplied.`, required_now: false },
    { key: `map_provider`, name: `OpenRouteService / OpenStreetMap`, configured: false, status: `Checking backend`, detail: `Waiting for backend provider status.`, required_now: true },
    { key: `traccar`, name: `Traccar GPS`, configured: false, status: `Not available for Phase 1`, detail: `Traccar is not required now.`, required_now: false },
    { key: `mictrack`, name: `Mictrack Device API`, configured: false, status: `Deferred until handover`, detail: `Mictrack activation is deferred until client device/API access is supplied.`, required_now: false },
    { key: `flutterwave`, name: `Flutterwave Payments`, configured: false, status: `Deferred until handover`, detail: `Flutterwave payout execution is deferred until live credentials are supplied.`, required_now: false },
    { key: `hetzner_storage`, name: `Hetzner KYC Storage`, configured: false, status: `Local storage active`, detail: `KYC uploads use protected local storage until Hetzner storage is supplied.`, required_now: false },
  ];
  const integrationsForDisplay = integrationStatuses.length > 0 ? integrationStatuses : fallbackIntegrations;
  const integrationStatusClass = (integration: IntegrationStatus) => {
    if (integration.configured) return `text-success`;
    if (integration.status.toLowerCase().includes(`deferred`) || integration.status.toLowerCase().includes(`not available`) || integration.status.toLowerCase().includes(`local storage`)) {
      return `text-muted-foreground`;
    }
    return integration.required_now ? `text-warning` : `text-muted-foreground`;
  };

  const updateTeamMember = (email: string, patch: Partial<TeamMember>) => {
    setTeamMembers((current) => current.map((member) => (member.email === email ? { ...member, ...patch } : member)));
  };

  const unlockTeamMember = async (member: TeamMember) => {
    if (!member.id) {
      toast.error(`This draft team member is not linked to a backend account`);
      return;
    }

    setTeamActionLoading(member.id);
    try {
      await api.patch(`/auth/users/${member.id}/unlock`);
      setTeamMembers((current) => current.map((item) => (
        item.id === member.id
          ? { ...item, account_locked: false, failed_login_attempts: 0, locked_reason: null }
          : item
      )));
      toast.success(`Account unlocked`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Unable to unlock account`);
    } finally {
      setTeamActionLoading(null);
    }
  };

  const handleLogoUpload = (file?: File) => {
    if (!file) return;
    setUploadedLogoName(file.name);
    toast.success(`Logo selected: ${file.name}`);
  };

  const updateOperationField = <K extends keyof OperationalSettings>(key: K, value: OperationalSettings[K]) => {
    setOperationSettings((current) => ({ ...current, [key]: value }));
  };

  const canManageRegionalSettings = [`super_admin`, `director`, `general_manager`, `coo`, `regional_manager`, `ops_coordinator`].includes(user?.role || ``);

  const regionalToggles: Array<{ key: keyof OperationalSettings; label: string; desc: string }> = [
    { key: `cod_enabled`, label: `COD operations enabled`, desc: `Allow COD visibility, settlement tracking, and COD-based restrictions.` },
    { key: `pickup_key_required`, label: `Pickup key required`, desc: `Merchant handover must be verified before pickup workflow continues.` },
    { key: `hub_scan_required`, label: `Hub scan-in required`, desc: `Orders cannot leave hub until package scan-in is recorded.` },
    { key: `google_maps_distance_required`, label: `Route-provider distance pricing required`, desc: `Pricing uses backend ORS/Google route distance before order creation.` },
    { key: `allow_cross_border_dispatch`, label: `Cross-border dispatch allowed`, desc: `Keep disabled for Kampala testing unless regional expansion is approved.` },
  ];

  return (
    <div data-cmp="Settings" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <Header title={`Settings`} subtitle={`System configuration, team management, and integrations`} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Sidebar nav */}
        <div className="responsive-table-frame flex shrink-0 gap-2 border-b border-border bg-card p-3 lg:w-52 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors lg:w-full ${
                  activeSection === s.key
                    ? `bg-primary/10 text-primary border border-primary/20`
                    : `text-muted-foreground hover:text-foreground hover:bg-muted`
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="whitespace-nowrap lg:whitespace-normal">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div ref={settingsContentRef} className="content-scroll flex-1 px-4 py-4 sm:px-6 sm:py-6">
          {/* Business Settings */}
          <div className={activeSection === `business` ? `flex flex-col gap-5` : `hidden`}>
            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Business Information</p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { label: `Company Name`, value: `Wolan Logistics SMC Ltd` },
                  { label: `Trading Name`, value: `Wolan Logistics` },
                  { label: `TIN / Tax ID`, value: `1008765432` },
                  { label: `Country`, value: `Uganda` },
                  { label: `City`, value: `Kampala` },
                  { label: `Main Hub Address`, value: `Pioneer Mall, Ntinda` },
                  { label: `Support Phone`, value: import.meta.env.VITE_SUPPORT_PHONE || `+256 761 253001` },
                  { label: `Support Email`, value: import.meta.env.VITE_SUPPORT_EMAIL || `` },
                ].map((f) => (
                  <div key={f.label} className="flex min-w-0 flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">{f.label}</label>
                    <input data-setting-key={`business.${f.label}`} defaultValue={getDraftValue(`business.${f.label}`, f.value)} className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors" />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Operating Hours</p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[`Monday - Friday`, `Saturday`, `Sunday`].map((d) => (
                  <div key={d} className="flex min-w-0 flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">{d}</label>
                    <input data-setting-key={`hours.${d}`} defaultValue={getDraftValue(`hours.${d}`, d === `Sunday` ? `Closed` : `07:00 - 21:00`)} className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Regional Operations */}
          <div className={activeSection === `regional` ? `flex flex-col gap-5` : `hidden`}>
            <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p className="text-sm font-bold text-foreground">Currency, Location & Regional Operations</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Backend-controlled operating defaults for Wolan regional rollout.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={loadOperationalSettings}
                    disabled={operationLoading || operationSaving}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {operationLoading ? <LoaderGlyph size="xs" label="Refreshing regional settings" /> : <RefreshCwIcon className="h-3.5 w-3.5" />}
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={saveOperationalSettings}
                    title={canManageRegionalSettings ? `Save backend regional settings.` : `Only Super Admin and Operations Coordinator accounts can change regional settings.`}
                    disabled={operationLoading || operationSaving || !canManageRegionalSettings}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <LoadingButtonContent loading={operationSaving} loadingLabel="Saving regional settings" label="Save Regional Settings" icon={<SaveIcon className="h-3.5 w-3.5" />} />
                  </button>
                </div>
              </div>

              {operationError ? (
                <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  {operationError}. Current fallback values remain visible until the backend responds.
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-border bg-background/70 p-4">
                  <p className="text-xs font-bold text-foreground">Currency Selection</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Controls financial display options for operations, reports, and settlement screens.</p>
                  <div className="mt-4">
                    <label className="mb-1.5 block text-xs text-muted-foreground">Active currency</label>
                    <CustomSelect
                      value={operationSettings.currency_code}
                      onValueChange={(value) => updateOperationField(`currency_code`, value)}
                      ariaLabel="Active operating currency"
                      options={operationOptions.currencies.map((currency) => ({
                        value: currency.code,
                        label: `${currency.code} - ${currency.label}`,
                      }))}
                      triggerClassName="h-11 rounded-xl"
                    />
                  </div>
                  <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-primary">Current source of truth</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{operationSettings.currency_code}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background/70 p-4 lg:col-span-2">
                  <p className="text-xs font-bold text-foreground">Location Configuration</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Default country, region, phone prefix, timezone, and map center for Kampala testing.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      { key: `country` as const, label: `Country`, value: operationSettings.country },
                      { key: `country_code` as const, label: `Country Code`, value: operationSettings.country_code },
                      { key: `default_phone_code` as const, label: `Phone Prefix`, value: operationSettings.default_phone_code },
                      { key: `primary_city` as const, label: `Primary City`, value: operationSettings.primary_city },
                      { key: `operating_region` as const, label: `Operating Region`, value: operationSettings.operating_region },
                    ].map((field) => (
                      <div key={field.key} className="min-w-0">
                        <label className="mb-1.5 block text-xs text-muted-foreground">{field.label}</label>
                        <input
                          value={field.value}
                          onChange={(event) => updateOperationField(field.key, event.target.value)}
                          className="h-11 w-full rounded-xl border border-border bg-input px-3 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary"
                        />
                      </div>
                    ))}
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs text-muted-foreground">Timezone</label>
                      <CustomSelect
                        value={operationSettings.timezone}
                        onValueChange={(value) => updateOperationField(`timezone`, value)}
                        ariaLabel="Operational timezone"
                        options={operationOptions.timezones.map((timezone) => ({ value: timezone, label: timezone }))}
                        triggerClassName="h-11 rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs text-muted-foreground">Default Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={operationSettings.default_latitude}
                        onChange={(event) => updateOperationField(`default_latitude`, Number(event.target.value))}
                        className="h-11 w-full rounded-xl border border-border bg-input px-3 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs text-muted-foreground">Default Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={operationSettings.default_longitude}
                        onChange={(event) => updateOperationField(`default_longitude`, Number(event.target.value))}
                        className="h-11 w-full rounded-xl border border-border bg-input px-3 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs text-muted-foreground">Service Radius</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={operationSettings.service_radius_km}
                        onChange={(event) => updateOperationField(`service_radius_km`, Number(event.target.value))}
                        className="h-11 w-full rounded-xl border border-border bg-input px-3 text-xs font-semibold text-foreground outline-none transition-colors focus:border-primary"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs text-muted-foreground">Distance Unit</label>
                      <CustomSelect
                        value={operationSettings.distance_unit}
                        onValueChange={(value) => updateOperationField(`distance_unit`, value)}
                        ariaLabel="Distance unit"
                        options={operationOptions.distance_units.map((unit) => ({ value: unit, label: unit.toUpperCase() }))}
                        triggerClassName="h-11 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-xs font-bold text-foreground">Regional Operational Settings</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Controls rules that must stay consistent across Merchant, Driver, Admin, reports, and dispatch APIs.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {regionalToggles.map((toggle) => {
                    const enabled = Boolean(operationSettings[toggle.key]);
                    return (
                      <button
                        key={toggle.key}
                        type="button"
                        onClick={() => setOperationSettings((current) => ({ ...current, [toggle.key]: !Boolean(current[toggle.key]) }))}
                        className={`min-h-24 rounded-2xl border p-4 text-left transition-colors ${
                          enabled
                            ? `border-primary/30 bg-primary/10`
                            : `border-border bg-card hover:border-primary/20`
                        }`}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-foreground">{toggle.label}</span>
                            <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{toggle.desc}</span>
                          </span>
                          <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? `bg-primary` : `bg-muted`}`}>
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${enabled ? `left-4` : `left-0.5`}`} />
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Dispatch Settings */}
          <div className={activeSection === `dispatch` ? `flex flex-col gap-5` : `hidden`}>
            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Dispatch Configuration</p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { label: `Max Orders per Rider`, value: `8` },
                  { label: `Delivery ETA Default (min)`, value: `45` },
                  { label: `Stage Assignment Zone Radius (km)`, value: `3` },
                  { label: `Idle Alert Threshold (min)`, value: `15` },
                  { label: `GPS Dark Alert Threshold (min)`, value: `10` },
                  { label: `COD Remit Deadline (hrs)`, value: `24` },
                ].map((f) => (
                  <div key={f.label} className="flex min-w-0 flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">{f.label}</label>
                    <input data-setting-key={`dispatch.${f.label}`} defaultValue={getDraftValue(`dispatch.${f.label}`, f.value)} type="number" className="bg-input rounded-lg px-3 py-2.5 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors" />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Auto-Dispatch Rules</p>
              {dispatchRules.map((r, i) => (
                <button key={r.label} onClick={() => toggleDispatchRule(i)} className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-1 text-left transition-colors hover:bg-muted/40">
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-foreground">{r.label}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{r.desc}</span>
                  </span>
                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${r.on ? `bg-primary` : `bg-muted`}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${r.on ? `left-4` : `left-0.5`}`} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className={activeSection === `notifications` ? `flex flex-col gap-5` : `hidden`}>
            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Notification Preferences</p>
              {notifications.map((n, i) => (
                <div key={i} className="flex items-start justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{n.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{n.desc}</p>
                  </div>
                  <button
                    onClick={() => toggleNotification(i)}
                    className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${n.on ? `bg-primary` : `bg-muted`}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${n.on ? `left-4` : `left-0.5`}`} />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Alert Channels</p>
              {alertChannels.map((c, i) => (
                <button key={c.label} onClick={() => toggleAlertChannel(i)} className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-1 text-left transition-colors hover:bg-muted/40">
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-foreground">{c.label}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{c.desc}</span>
                  </span>
                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${c.on ? `bg-primary` : `bg-muted`}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${c.on ? `left-4` : `left-0.5`}`} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Team */}
          <div className={activeSection === `team` ? `flex flex-col gap-5` : `hidden`}>
            <div className="bg-card rounded-xl border border-border shadow-custom overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <p className="text-sm font-bold text-foreground">Team Members</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Live backend accounts with lock/unlock controls</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={loadTeamMembers} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
                    {teamLoading ? <LoaderGlyph size="xs" label="Refreshing team" /> : <RefreshCwIcon className="h-3.5 w-3.5" />}
                    Refresh
                  </button>
                  <button onClick={inviteUser} className="flex items-center gap-1.5 gradient-orange text-white text-xs font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity">
                    <UsersIcon className="w-3.5 h-3.5" />
                    Invite User
                  </button>
                </div>
              </div>
              {teamError ? (
                <div className="border-b border-border bg-warning/10 px-5 py-3 text-xs text-warning">
                  {teamError}. Showing saved/local team draft until the API responds.
                </div>
              ) : null}
              <div className="flex flex-col divide-y divide-border">
                {teamMembers.map((u) => (
                  <div key={u.email} className="flex flex-wrap items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/30">
                    <div className="w-8 h-8 gradient-blue rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {u.name.split(` `).map((n) => n[0]).join(``)}
                    </div>
                    <div className="min-w-0 flex-1 basis-44">
                      <p className="text-xs font-semibold text-foreground">{u.name}</p>
                      <p className="break-all text-[10px] text-muted-foreground">{u.email}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{u.hub || `All hubs`}{u.phone ? ` | ${u.phone}` : ``}</p>
                    </div>
                    {editingTeamEmail === u.email ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <CustomSelect
                          value={u.role}
                          onValueChange={(nextValue) => updateTeamMember(u.email, { role: nextValue })}
                          ariaLabel="Team member role"
                          options={[`Super Admin`, `Hub Manager`, `Dispatcher`, `Finance`].map((role) => ({
                            value: role,
                            label: role,
                          }))}
                          triggerClassName="h-9 min-w-36 rounded-lg px-2 py-1.5"
                          size="sm"
                        />
                        <button
                          onClick={() => updateTeamMember(u.email, { active: !u.active })}
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${u.active ? `text-success bg-success/10 border-success/20` : `text-muted-foreground bg-muted border-border`}`}
                        >
                          {u.active ? `Active` : `Inactive`}
                        </button>
                        <button onClick={() => setEditingTeamEmail(null)} className="text-xs font-semibold text-primary hover:underline">Done</button>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">{u.role}</span>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${u.active ? `text-success bg-success/10 border-success/20` : `text-muted-foreground bg-muted border-border`}`}>
                          {u.active ? `Active` : `Inactive`}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${u.account_locked ? `text-destructive bg-destructive/10 border-destructive/20` : `text-success bg-success/10 border-success/20`}`}>
                          {u.account_locked ? `Locked` : `Unlocked`}
                          {u.failed_login_attempts ? ` | ${u.failed_login_attempts}/3` : ``}
                        </span>
                        {u.account_locked ? (
                          <button
                            onClick={() => unlockTeamMember(u)}
                            disabled={teamActionLoading === u.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                            title={u.locked_reason || `Unlock this account after failed login attempts`}
                          >
                            {teamActionLoading === u.id ? <LoaderGlyph size="xs" label="Unlocking account" /> : <LockOpenIcon className="h-3.5 w-3.5" />}
                            Unlock
                          </button>
                        ) : null}
                        <button onClick={() => editTeamMember(u.email)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Edit</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Role Permissions</p>
              {[
                { role: `Director / General Manager`, perms: `HQ master visibility across all hubs, branch creation, and manager assignment` },
                { role: `COO / Regional Manager`, perms: `Regional dashboard visibility across assigned hubs only` },
                { role: `Hub Manager`, perms: `Detailed operations, riders, orders, COD, and reports for assigned hub only` },
                { role: `Operations Coordinator`, perms: `Dispatch and tracking within assigned hub only` },
              ].map((r) => (
                <div key={r.role} className="flex items-start gap-3">
                  <div className="w-6 h-6 gradient-orange rounded-lg flex items-center justify-center flex-shrink-0">
                    <ShieldIcon className="w-3 h-3 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">{r.role}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{r.perms}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security */}
          <div className={activeSection === `security` ? `flex flex-col gap-5` : `hidden`}>
            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Security & Access</p>
              {securitySettings.map((r, i) => (
                <button key={r.label} onClick={() => toggleSecuritySetting(i)} className="flex items-start justify-between gap-3 rounded-lg p-1 text-left transition-colors hover:bg-muted/40">
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground">{r.label}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{r.desc}</span>
                  </span>
                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${r.on ? `bg-primary` : `bg-muted`}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${r.on ? `left-4` : `left-0.5`}`} />
                  </span>
                </button>
              ))}
            </div>

            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-3">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Rider Security Protocols</p>
              {[
                { label: `Security Bond Amount (UGX)`, value: `250000` },
                { label: `Max COD per Rider (UGX)`, value: `1000000` },
                { label: `Package Limit per Run`, value: `10` },
                { label: `Check-in Required (Daily)`, value: `Yes` },
              ].map((f) => (
                <div key={f.label} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 text-xs text-muted-foreground">{f.label}</p>
                  <input data-setting-key={`security.${f.label}`} defaultValue={getDraftValue(`security.${f.label}`, f.value)} className="w-full rounded-lg border border-border bg-input px-3 py-1.5 text-left text-xs text-foreground outline-none transition-colors focus:border-primary sm:w-32 sm:text-right" />
                </div>
              ))}
            </div>
          </div>

          {/* Branding */}
          <div className={activeSection === `branding` ? `flex flex-col gap-5` : `hidden`}>
            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-5">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Brand Customization</p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-16 h-16 gradient-orange rounded-2xl flex items-center justify-center text-white text-2xl font-black">W</div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">Wolan Logistics</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{uploadedLogoName || `Current logo`}</p>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleLogoUpload(event.target.files?.[0])} />
                  <button onClick={() => logoInputRef.current?.click()} className="mt-2 text-xs text-primary hover:underline">Upload new logo</button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { label: `Primary Color`, value: `#4B0082` },
                  { label: `Brand Background`, value: `#F8F7FB` },
                  { label: `Card Color`, value: `#FFFFFF` },
                ].map((c) => (
                  <div key={c.label} className="flex min-w-0 flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">{c.label}</label>
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="w-8 h-8 rounded-lg border border-border flex-shrink-0" style={{ background: c.value }} />
                      <input data-setting-key={`branding.${c.label}`} defaultValue={getDraftValue(`branding.${c.label}`, c.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-primary" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Integrations */}
          <div className={activeSection === `integrations` ? `flex flex-col gap-5` : `hidden`}>
            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p className="text-sm font-bold text-foreground">Third-Party Integrations</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Live provider status is read from backend environment configuration.</p>
                </div>
                <button
                  type="button"
                  onClick={loadIntegrationStatuses}
                  disabled={integrationLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
                >
                  {integrationLoading ? <LoaderGlyph size="xs" label="Refreshing integrations" /> : <RefreshCwIcon className="h-3.5 w-3.5" />}
                  Refresh
                </button>
              </div>
              {integrationError ? (
                <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  {integrationError}
                </div>
              ) : null}
              {integrationsForDisplay.map((s) => (
                <div key={s.key || s.name} className="flex flex-col gap-3 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">{s.name}</p>
                    <p className="mt-0.5 break-words text-[10px] text-muted-foreground">{s.detail}</p>
                    {s.features?.length ? (
                      <p className="mt-1 text-[10px] text-muted-foreground">Used for: {s.features.join(`, `)}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className={`text-xs font-medium ${integrationStatusClass(s)}`}>{s.status}</span>
                    <button
                      type="button"
                      onClick={() => configureIntegration(s)}
                      title={s.configured ? `${s.name} is configured on the backend.` : s.detail}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {s.configured ? `View` : `Configure`}
                    </button>
                  </div>
                </div>
              ))}
              {selectedIntegration ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-foreground">Configure {selectedIntegration}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Stored as an admin draft until provider credentials are connected server-side.</p>
                    </div>
                    <button onClick={() => setSelectedIntegration(``)} className="text-xs font-semibold text-primary hover:underline">Close</button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input
                      data-setting-key={`integration.${selectedIntegration}.credential`}
                      defaultValue={getDraftValue(`integration.${selectedIntegration}.credential`, ``)}
                      placeholder="Provider key or webhook URL"
                      className="rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                    />
                    <input
                      data-setting-key={`integration.${selectedIntegration}.notes`}
                      defaultValue={getDraftValue(`integration.${selectedIntegration}.notes`, ``)}
                      placeholder="Operational notes"
                      className="rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Billing */}
          <div className={activeSection === `billing` ? `flex flex-col gap-5` : `hidden`}>
            <div className="bg-card rounded-xl border border-border p-5 shadow-custom flex flex-col gap-4">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Subscription & Billing</p>
              <div className="gradient-orange flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
                <div className="min-w-0">
                  <p className="text-white text-xs font-bold">Enterprise Plan</p>
                  <p className="text-white/70 text-[10px] mt-0.5">Unlimited hubs - Priority support</p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-white text-lg font-black">Active</p>
                  <p className="text-white/70 text-[10px]">Renews Feb 2026</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { label: `SMS Credits Remaining`, value: `12,400 credits` },
                  { label: `API Calls This Month`, value: `84,291 / 500,000` },
                  { label: `Storage Used`, value: `2.4 GB / 50 GB` },
                ].map((b) => (
                  <div key={b.label} className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-xs text-muted-foreground">{b.label}</p>
                    <p className="text-xs font-medium text-foreground">{b.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Support */}
          <div className={activeSection === `support` ? `flex flex-col gap-5` : `hidden`}>
            <SupportPanel title="Admin support shortcuts" />
            <div className="rounded-xl border border-border bg-card p-5 shadow-custom">
              <p className="text-sm font-bold text-foreground border-b border-border pb-3">Operational Help Notes</p>
              <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
                  <p className="font-semibold text-foreground">Dispatch escalation</p>
                  <p className="mt-1">Use order history, pickup key visibility, and hub scan-in state before manually overriding dispatch.</p>
                </div>
                <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
                  <p className="font-semibold text-foreground">Account access</p>
                  <p className="mt-1">Locked or suspended users should be reviewed in Team & Users or Driver lifecycle controls before unlock.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-2 flex justify-stretch sm:justify-end">
            <button
              onClick={handleSave}
              title="Save this settings draft locally. Provider actions still require backend credentials before they become live."
              className={`flex w-full items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-xs font-semibold shadow-custom transition-all sm:w-auto ${
                saved ? `bg-success text-white` : `gradient-orange text-white hover:opacity-90`
              }`}
            >
              {saved ? <CheckCircleIcon className="w-4 h-4" /> : <SaveIcon className="w-4 h-4" />}
              {saved ? `Saved!` : `Save Changes`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
