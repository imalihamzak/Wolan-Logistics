import { useEffect, useMemo, useRef, useState } from "react";
import AppLoader, { LoaderGlyph } from "../components/AppLoader";
import api from "../lib/api";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BellIcon,
  ClockIcon,
  LayersIcon,
  MapPinIcon,
  NavigationIcon,
  PackageIcon,
  RadioIcon,
  RefreshCwIcon,
  SearchIcon,
  TruckIcon,
  WifiIcon,
  WifiOffIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";

type RiderStatus = "available" | "on_delivery" | "break" | "offline";
type OrderStatus = "pending" | "picked_up" | "at_hub" | "out_for_delivery" | "delivered" | "failed" | "returned";

type GpsPoint = {
  latitude: number;
  longitude: number;
  source?: string;
  updated_at?: string | null;
};

type RouteGeometry = {
  type: "LineString";
  coordinates: number[][];
};

type LiveOrder = {
  id: string;
  order_id: string;
  status: OrderStatus;
  delivery_zone: string;
  delivery_address: string;
  pickup_coordinates?: GpsPoint | null;
  dropoff_coordinates?: GpsPoint | null;
  customer_name: string;
  merchant: string;
  rider_user_id?: string | null;
  rider_name: string;
  cod_amount: number;
  package_tracking_id: string;
  physical_tracker_id?: string | null;
  tracker_divergence_alert: boolean;
  tracker_divergence_distance: number;
  pricing_distance_km?: number | null;
  pricing_duration_seconds?: number | null;
  pricing_source?: string | null;
  route_geometry?: RouteGeometry | null;
  navigation_url?: string | null;
  package_gps?: GpsPoint | null;
  eta?: {
    phase: string;
    due_at?: string | null;
    minutes_remaining?: number | null;
    is_delayed: boolean;
    label: string;
    source: string;
  } | null;
};

type LiveRider = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  bike_plate: string;
  current_status: RiderStatus;
  gps_location?: GpsPoint | null;
  has_gps_fix: boolean;
  last_location_update?: string | null;
  current_cod: number;
  active_order_count: number;
  current_order?: LiveOrder | null;
  is_delayed?: boolean;
  is_idle?: boolean;
  is_gps_dark?: boolean;
  gps_state?: "tracked" | "delayed" | "idle" | "gps_dark" | "no_fix";
};

type PackageMarker = {
  id: string;
  order_id: string;
  rider_user_id?: string | null;
  rider_name: string;
  status: OrderStatus;
  delivery_zone: string;
  package_tracking_id: string;
  physical_tracker_id?: string | null;
  tracker_divergence_alert: boolean;
  tracker_divergence_distance: number;
  gps_location: GpsPoint;
};

type LiveMapPayload = {
  scope: {
    hub_id: string | null;
    hub_name: string;
    hub_code?: string | null;
    hub_coordinates?: { latitude?: number; longitude?: number } | null;
    generated_at?: string;
  };
  summary: {
    total_riders: number;
    active_riders: number;
    riders_with_gps: number;
    active_orders: number;
    packages_with_gps: number;
    mismatches: number;
    gps_dark: number;
    delayed_riders?: number;
    idle_riders?: number;
  };
  riders: LiveRider[];
  packages: PackageMarker[];
  alerts: Array<{
    type: string;
    detail: string;
    level: "destructive" | "warning";
    rider_id?: string;
    rider_name?: string;
    order_id?: string;
  }>;
};

const defaultLiveMap: LiveMapPayload = {
  scope: {
    hub_id: null,
    hub_name: "All hubs",
    hub_code: null,
    hub_coordinates: null,
  },
  summary: {
    total_riders: 0,
    active_riders: 0,
    riders_with_gps: 0,
    active_orders: 0,
    packages_with_gps: 0,
    mismatches: 0,
    gps_dark: 0,
    delayed_riders: 0,
    idle_riders: 0,
  },
  riders: [],
  packages: [],
  alerts: [],
};

const statusLabel: Record<RiderStatus, string> = {
  available: "Available",
  on_delivery: "On Delivery",
  break: "Break",
  offline: "Offline",
};

const orderStatusLabel: Record<OrderStatus, string> = {
  pending: "Pending",
  picked_up: "Picked Up",
  at_hub: "At Hub",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
  returned: "Returned",
};

const statusDot: Record<RiderStatus, string> = {
  available: "bg-success",
  on_delivery: "bg-primary",
  break: "bg-warning",
  offline: "bg-muted-foreground",
};

const statusText: Record<RiderStatus, string> = {
  available: "text-success",
  on_delivery: "text-primary",
  break: "text-warning",
  offline: "text-muted-foreground",
};

const statusPanel: Record<RiderStatus, string> = {
  available: "border-success/20 bg-success/10 text-success",
  on_delivery: "border-primary/20 bg-primary/10 text-primary",
  break: "border-warning/20 bg-warning/10 text-warning",
  offline: "border-muted bg-muted text-muted-foreground",
};

const formatNumber = (value?: number | null) => new Intl.NumberFormat("en-US").format(Math.round(value || 0));

const formatUGX = (value?: number | null) => `UGX ${formatNumber(value)}`;
const formatDuration = (seconds?: number | null) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "Pending";
  const minutes = Math.max(Math.round(value / 60), 1);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
};

const etaTextClass = (eta?: LiveOrder["eta"]) => (
  eta?.is_delayed ? "text-destructive" : eta?.phase === "hub_staging" ? "text-success" : "text-primary"
);

const riderOperationalTone = (rider?: LiveRider | null) => {
  if (!rider) return "border-muted bg-muted text-muted-foreground";
  if (rider.is_delayed) return "border-destructive/25 bg-destructive/10 text-destructive";
  if (rider.is_gps_dark) return "border-destructive/25 bg-destructive/10 text-destructive";
  if (rider.is_idle) return "border-warning/25 bg-warning/10 text-warning";
  return statusPanel[rider.current_status];
};

const riderOperationalLabel = (rider?: LiveRider | null) => {
  if (!rider) return "No rider selected";
  if (rider.is_delayed) return "Delayed";
  if (rider.is_gps_dark) return "GPS Dark";
  if (rider.is_idle) return "Idle";
  if (rider.has_gps_fix) return "Tracking";
  return "No GPS fix";
};

const riderAlertDotClass = (rider: LiveRider) => (
  rider.is_idle && !rider.is_delayed && !rider.is_gps_dark ? "bg-warning" : "bg-destructive"
);

const formatRelativeTime = (value?: string | null) => {
  if (!value) return "No update";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "No update";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
};

const hasValidPoint = (point?: GpsPoint | null) => Boolean(
  point
  && Number.isFinite(point.latitude)
  && Number.isFinite(point.longitude)
  && point.latitude >= -90
  && point.latitude <= 90
  && point.longitude >= -180
  && point.longitude <= 180
  && !(point.latitude === 0 && point.longitude === 0)
);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const OSM_TILE_URL_TEMPLATE = import.meta.env.VITE_OSM_TILE_URL_TEMPLATE || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAP_MIN_ZOOM = 11;
const MAP_MAX_ZOOM = 16;
const TILE_SIZE = 256;
const KAMPALA_CENTER: GpsPoint = { latitude: 0.3476, longitude: 32.5825 };

const routeCoordinateToPoint = (coordinate: number[]): GpsPoint | null => {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);
  return hasValidPoint({ latitude, longitude }) ? { latitude, longitude } : null;
};

const longitudeToTileX = (longitude: number, zoom: number) => ((longitude + 180) / 360) * (2 ** zoom);
const latitudeToTileY = (latitude: number, zoom: number) => {
  const latRad = (latitude * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * (2 ** zoom);
};

const pointToWorldPixel = (point: GpsPoint, zoom: number) => ({
  x: longitudeToTileX(point.longitude, zoom) * TILE_SIZE,
  y: latitudeToTileY(point.latitude, zoom) * TILE_SIZE,
});

const buildTileUrl = ({ x, y, z }: { x: number; y: number; z: number }) => (
  OSM_TILE_URL_TEMPLATE
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
);

const averagePoint = (points: GpsPoint[]) => {
  const validPoints = points.filter((point) => hasValidPoint(point));
  if (validPoints.length === 0) return KAMPALA_CENTER;

  return {
    latitude: validPoints.reduce((sum, point) => sum + point.latitude, 0) / validPoints.length,
    longitude: validPoints.reduce((sum, point) => sum + point.longitude, 0) / validPoints.length,
  };
};

const zoneLayout = [
  { left: 15, top: 18, width: 22, height: 22 },
  { left: 60, top: 16, width: 20, height: 20 },
  { left: 58, top: 56, width: 25, height: 22 },
  { left: 22, top: 62, width: 22, height: 20 },
  { left: 39, top: 35, width: 22, height: 20 },
];

export default function LiveMap() {
  const mapSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [mapSize, setMapSize] = useState({ width: 1000, height: 600 });
  const [showPackages, setShowPackages] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [liveMap, setLiveMap] = useState<LiveMapPayload | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [now, setNow] = useState(() => new Date());

  const data = liveMap || defaultLiveMap;
  const selectedRider = data.riders.find((rider) => rider.id === selectedRiderId) || data.riders[0] || null;
  const currentOrder = selectedRider?.current_order || null;
  const hubTitle = data.scope.hub_code ? `${data.scope.hub_name} - ${data.scope.hub_code}` : data.scope.hub_name;

  const loadLiveMap = async (asRefresh = false) => {
    if (asRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const { data: response } = await api.get("/auth/dashboard/live-map");
      setLiveMap(response?.data?.liveMap || defaultLiveMap);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.message || "Unable to load live map data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLiveMap();
    const refreshTimer = window.setInterval(() => loadLiveMap(true), 30000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const element = mapSurfaceRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setMapSize({
        width: Math.max(Math.round(rect.width), 320),
        height: Math.max(Math.round(rect.height), 320),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (data.riders.length === 0) {
      setSelectedRiderId(null);
      return;
    }

    if (!selectedRiderId || !data.riders.some((rider) => rider.id === selectedRiderId)) {
      setSelectedRiderId(data.riders[0].id);
    }
  }, [data.riders, selectedRiderId]);

  const projected = useMemo(() => {
    const riderPoints = data.riders
      .filter((rider) => hasValidPoint(rider.gps_location))
      .map((rider) => ({ type: "rider" as const, point: rider.gps_location as GpsPoint, rider }));

    const packagePoints = data.packages
      .filter((pkg) => hasValidPoint(pkg.gps_location))
      .map((pkg) => ({ type: "package" as const, point: pkg.gps_location, pkg }));

    const hubPoint = data.scope.hub_coordinates
      && hasValidPoint({ latitude: Number(data.scope.hub_coordinates.latitude), longitude: Number(data.scope.hub_coordinates.longitude) })
      ? { latitude: Number(data.scope.hub_coordinates.latitude), longitude: Number(data.scope.hub_coordinates.longitude) }
      : null;

    const routePointsFromGeometry = (currentOrder?.route_geometry?.coordinates || [])
      .map(routeCoordinateToPoint)
      .filter(Boolean) as GpsPoint[];
    const routePoints = routePointsFromGeometry.length >= 2
      ? routePointsFromGeometry
      : [
        currentOrder?.pickup_coordinates || null,
        currentOrder?.dropoff_coordinates || null,
      ].filter((point): point is GpsPoint => hasValidPoint(point));

    const points = [
      ...riderPoints.map((item) => item.point),
      ...packagePoints.map((item) => item.point),
      ...routePoints,
      ...(hubPoint ? [hubPoint] : []),
    ];

    const center = hasValidPoint(selectedRider?.gps_location)
      ? selectedRider?.gps_location as GpsPoint
      : hubPoint || averagePoint(points);
    const centerPixel = pointToWorldPixel(center, mapZoom);

    const projectPixel = (point: GpsPoint, clampToViewport = true) => {
      const world = pointToWorldPixel(point, mapZoom);
      const rawX = (mapSize.width / 2) + (world.x - centerPixel.x);
      const rawY = (mapSize.height / 2) + (world.y - centerPixel.y);
      const x = clampToViewport ? clamp(rawX, 12, mapSize.width - 12) : rawX;
      const y = clampToViewport ? clamp(rawY, 12, mapSize.height - 12) : rawY;
      return {
        x: (x / mapSize.width) * 100,
        y: (y / mapSize.height) * 100,
        px: x,
        py: y,
      };
    };

    const tileMinX = Math.floor((centerPixel.x - mapSize.width / 2) / TILE_SIZE) - 1;
    const tileMaxX = Math.floor((centerPixel.x + mapSize.width / 2) / TILE_SIZE) + 1;
    const tileMinY = Math.floor((centerPixel.y - mapSize.height / 2) / TILE_SIZE) - 1;
    const tileMaxY = Math.floor((centerPixel.y + mapSize.height / 2) / TILE_SIZE) + 1;
    const tileLimit = 2 ** mapZoom;
    const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];

    for (let x = tileMinX; x <= tileMaxX; x += 1) {
      for (let y = tileMinY; y <= tileMaxY; y += 1) {
        if (y < 0 || y >= tileLimit) continue;
        const wrappedX = ((x % tileLimit) + tileLimit) % tileLimit;
        tiles.push({
          key: `${mapZoom}-${wrappedX}-${y}-${x}`,
          url: buildTileUrl({ x: wrappedX, y, z: mapZoom }),
          left: (x * TILE_SIZE) - centerPixel.x + (mapSize.width / 2),
          top: (y * TILE_SIZE) - centerPixel.y + (mapSize.height / 2),
        });
      }
    }

    const routePolyline = routePoints
      .map((point) => projectPixel(point, false))
      .filter((point) => point.px > -80 && point.py > -80 && point.px < mapSize.width + 80 && point.py < mapSize.height + 80)
      .map((point) => `${point.px},${point.py}`)
      .join(" ");

    return {
      riderPins: riderPoints.map((item) => ({ ...item.rider, ...projectPixel(item.point) })),
      packagePins: packagePoints.map((item) => ({ ...item.pkg, ...projectPixel(item.point) })),
      hubPin: hubPoint ? projectPixel(hubPoint) : projectPixel(center),
      routePolyline,
      tiles,
    };
  }, [currentOrder, data, mapSize.height, mapSize.width, mapZoom, selectedRider]);

  const zones = useMemo(() => {
    const names = new Set<string>();
    data.riders.forEach((rider) => {
      if (rider.current_order?.delivery_zone) {
        names.add(rider.current_order.delivery_zone);
      }
    });
    data.packages.forEach((pkg) => {
      if (pkg.delivery_zone) {
        names.add(pkg.delivery_zone);
      }
    });

    return Array.from(names).slice(0, zoneLayout.length).map((name, index) => ({
      name,
      ...zoneLayout[index],
    }));
  }, [data.riders, data.packages]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredRiders = useMemo(() => {
    if (!normalizedSearch) {
      return data.riders;
    }

    return data.riders.filter((rider) => [
      rider.full_name,
      rider.bike_plate,
      rider.current_order?.order_id,
      rider.current_order?.delivery_zone,
      rider.current_order?.delivery_address,
      statusLabel[rider.current_status],
    ].some((value) => value?.toLowerCase().includes(normalizedSearch)));
  }, [data.riders, normalizedSearch]);

  const selectedPackage = useMemo(() => {
    if (!currentOrder) {
      return null;
    }

    return data.packages.find((pkg) => pkg.order_id === currentOrder.order_id || pkg.id === currentOrder.id) || null;
  }, [currentOrder, data.packages]);

  const handleZoomIn = () => setMapZoom((prev) => Math.min(prev + 1, MAP_MAX_ZOOM));
  const handleZoomOut = () => setMapZoom((prev) => Math.max(prev - 1, MAP_MIN_ZOOM));
  const handleNavigation = () => setMapZoom(13);
  const focusPackageMarker = (pkg: PackageMarker) => {
    const matchingRider = data.riders.find((rider) => (
      rider.current_order?.order_id === pkg.order_id
      || rider.current_order?.id === pkg.id
      || rider.current_order?.package_tracking_id === pkg.package_tracking_id
    ));

    if (matchingRider) {
      setSelectedRiderId(matchingRider.id);
      setSearchTerm("");
      return;
    }

    setSearchTerm(pkg.order_id || pkg.package_tracking_id || "");
  };

  return (
    <div data-cmp="LiveMap" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight text-foreground">Live Map</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">Real-time rider and package GPS tracking - {hubTitle}</p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search orders, riders..."
                className="h-9 w-full rounded-lg border border-border bg-input pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </label>
            <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 text-xs font-semibold text-success">
              <WifiIcon className="h-3.5 w-3.5" />
              Live
            </span>
            <button
              onClick={() => loadLiveMap(true)}
              disabled={refreshing || loading}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
              aria-label="Refresh live map"
            >
              {refreshing ? <LoaderGlyph size="sm" label="Refreshing live map" /> : <RefreshCwIcon className="h-4 w-4" />}
            </button>
            <div className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
              <BellIcon className="h-4 w-4" />
              {data.alerts.length > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{data.alerts.length}</span> : null}
            </div>
            <div className="hidden text-right text-xs leading-tight text-muted-foreground sm:block">
              <p className="font-bold text-foreground">{new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now)}</p>
              <p>{new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(now)}</p>
            </div>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(22rem,1fr)_minmax(14rem,auto)] overflow-hidden sm:grid-rows-[minmax(28rem,1fr)_minmax(14rem,auto)] xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-1">
        <section className="relative min-h-[22rem] min-w-0 overflow-hidden border-b border-border bg-[#fbf8ff] sm:min-h-[28rem] xl:min-h-0 xl:border-b-0 xl:border-r">
          <div className="absolute left-4 right-4 top-4 z-20 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs font-bold text-foreground shadow-custom">
              <span className="h-2 w-2 rounded-full bg-success status-pulse" />
              Live Command View - {data.scope.hub_name}
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-bold text-primary shadow-custom">
              <TruckIcon className="h-3.5 w-3.5" />
              {loading ? "..." : formatNumber(data.summary.active_riders)} Active
            </span>
            <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold shadow-custom ${
              data.summary.mismatches > 0 ? "border-destructive/25 bg-destructive/10 text-destructive" : "border-success/20 bg-success/10 text-success"
            }`}>
              <AlertTriangleIcon className="h-3.5 w-3.5" />
              {loading ? "..." : `${formatNumber(data.summary.mismatches)} Mismatch Alert${data.summary.mismatches === 1 ? "" : "s"}`}
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-chart-2/20 bg-chart-2/10 px-3 py-2 text-xs font-bold text-chart-2 shadow-custom">
              <PackageIcon className="h-3.5 w-3.5" />
              {loading ? "..." : formatNumber(data.summary.packages_with_gps)} Package GPS
            </span>
            <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold shadow-custom ${
              (data.summary.delayed_riders || 0) > 0 ? "border-destructive/25 bg-destructive/10 text-destructive" : "border-success/20 bg-success/10 text-success"
            }`}>
              <ClockIcon className="h-3.5 w-3.5" />
              {loading ? "..." : formatNumber(data.summary.delayed_riders || 0)} Delayed
            </span>
            <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold shadow-custom ${
              (data.summary.idle_riders || 0) > 0 ? "border-warning/25 bg-warning/10 text-warning" : "border-success/20 bg-success/10 text-success"
            }`}>
              <ActivityIcon className="h-3.5 w-3.5" />
              {loading ? "..." : formatNumber(data.summary.idle_riders || 0)} Idle
            </span>
          </div>

          <div className="absolute right-4 top-20 z-20 flex flex-col gap-2 sm:top-4">
            <button onClick={handleZoomIn} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-custom transition-colors hover:bg-muted hover:text-foreground" aria-label="Zoom in">
              <ZoomInIcon className="h-4 w-4" />
            </button>
            <button onClick={handleZoomOut} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-custom transition-colors hover:bg-muted hover:text-foreground" aria-label="Zoom out">
              <ZoomOutIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowPackages((prev) => !prev)}
              className={`grid h-9 w-9 place-items-center rounded-lg border shadow-custom transition-colors ${showPackages ? "border-chart-2/25 bg-chart-2/10 text-chart-2" : "border-border bg-card text-muted-foreground"}`}
              aria-label="Toggle package GPS layer"
            >
              <LayersIcon className="h-4 w-4" />
            </button>
            <button onClick={handleNavigation} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-custom transition-colors hover:bg-muted hover:text-foreground" aria-label="Reset map zoom">
              <NavigationIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="absolute bottom-4 left-4 z-20 flex gap-2">
            <button
              onClick={() => setShowZones((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold shadow-custom transition-colors ${showZones ? "border-primary/25 bg-primary text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <MapPinIcon className="h-3.5 w-3.5" />
              Zones
            </button>
            <button
              onClick={() => setShowPackages((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold shadow-custom transition-colors ${showPackages ? "border-chart-2/25 bg-chart-2 text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <PackageIcon className="h-3.5 w-3.5" />
              Packages
            </button>
          </div>

          <div ref={mapSurfaceRef} className="absolute inset-0 overflow-hidden bg-[#f7f1fb]">
            <div className="absolute inset-0">
              {projected.tiles.map((tile) => (
                <img
                  key={tile.key}
                  src={tile.url}
                  alt=""
                  draggable={false}
                  className="absolute h-64 w-64 select-none object-cover opacity-75"
                  style={{ left: tile.left, top: tile.top }}
                />
              ))}
              <div className="absolute inset-0 bg-primary/5 backdrop-saturate-125" />
              <div className="absolute bottom-2 right-2 z-10 rounded bg-card/90 px-2 py-1 text-[10px] font-semibold text-muted-foreground shadow-custom">
                Map data (c) OpenStreetMap | Routes OpenRouteService
              </div>
            </div>

            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${mapSize.width} ${mapSize.height}`}
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 z-10"
            >
              {projected.routePolyline ? (
                <>
                  <polyline points={projected.routePolyline} fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={projected.routePolyline} fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 8" />
                </>
              ) : null}
            </svg>

            {showZones && zones.map((zone, index) => (
              <div
                key={zone.name}
                className={`absolute z-10 grid place-items-center rounded-xl border text-sm font-black ${
                  index % 4 === 0
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : index % 4 === 1
                      ? "border-chart-2/35 bg-chart-2/10 text-chart-2"
                      : index % 4 === 2
                        ? "border-success/35 bg-success/10 text-success"
                        : "border-warning/35 bg-warning/10 text-warning"
                }`}
                style={{ left: `${zone.left}%`, top: `${zone.top}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
              >
                <span className="max-w-full truncate px-2">{zone.name}</span>
              </div>
            ))}

            <div
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-primary/30 bg-card px-3 py-2 shadow-custom wolan-glow"
              style={{ left: `${projected.hubPin.x}%`, top: `${projected.hubPin.y}%` }}
            >
              <div className="flex items-center gap-2">
                <RadioIcon className="h-4 w-4 text-primary status-pulse" />
                <div>
                  <p className="text-[10px] font-bold text-primary">{data.scope.hub_code || "HUB"}</p>
                  <p className="max-w-28 truncate text-[10px] text-muted-foreground">{data.scope.hub_name}</p>
                </div>
              </div>
            </div>

            {showPackages && projected.packagePins.map((pkg) => (
              <button
                type="button"
                key={pkg.id}
                onClick={() => focusPackageMarker(pkg)}
                className={`absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border p-2 shadow-custom transition-transform hover:scale-110 ${
                  pkg.tracker_divergence_alert
                    ? "border-warning bg-warning/20 text-warning"
                    : "border-chart-2 bg-chart-2/20 text-chart-2"
                }`}
                style={{ left: `${pkg.x}%`, top: `${pkg.y}%` }}
                title={`${pkg.order_id} package GPS - click to focus the related rider or filter by package`}
                aria-label={`${pkg.order_id} package GPS - focus related rider`}
              >
                <PackageIcon className="h-4 w-4" />
              </button>
            ))}

            {projected.riderPins.map((rider) => (
              <button
                key={rider.id}
                onClick={() => setSelectedRiderId(rider.id)}
                className={`absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded-full border p-2 shadow-custom transition-transform hover:scale-110 ${
                  selectedRider?.id === rider.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                } ${riderOperationalTone(rider)}`}
                style={{ left: `${rider.x}%`, top: `${rider.y}%` }}
                title={`${rider.full_name} - ${riderOperationalLabel(rider)}${rider.current_order?.eta?.label ? ` - ${rider.current_order.eta.label}` : ""}`}
              >
                <TruckIcon className="h-4 w-4" />
                <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-card px-2 py-0.5 text-[10px] text-foreground shadow-custom">
                  {rider.full_name.split(" ")[0]}
                </span>
                {rider.is_delayed || rider.is_idle || rider.is_gps_dark ? (
                  <span className={`absolute -right-1 -top-1 h-3 w-3 rounded-full ring-2 ring-card ${riderAlertDotClass(rider)}`} />
                ) : null}
              </button>
            ))}
          </div>

          {!loading && projected.riderPins.length === 0 ? (
            <div className="absolute inset-x-4 top-1/2 z-30 -translate-y-1/2 rounded-xl border border-warning/20 bg-warning/10 p-4 text-center text-sm text-warning">
              No backend rider GPS coordinates are available yet. Ask a driver to update location from the driver page.
            </div>
          ) : null}

          <div className="absolute bottom-16 left-4 right-4 z-30 max-h-[45%] overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-custom sm:left-auto sm:max-h-[calc(100%-6rem)] sm:w-[26rem]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{selectedRider?.full_name || "No rider selected"}</p>
                <p className={`text-xs ${selectedRider ? statusText[selectedRider.current_status] : "text-muted-foreground"}`}>
                  {selectedRider ? `${statusLabel[selectedRider.current_status]}${selectedRider.bike_plate ? ` - ${selectedRider.bike_plate}` : ""}` : "Select a rider"}
                </p>
              </div>
              {currentOrder?.tracker_divergence_alert ? (
                <span className="rounded-lg border border-destructive/25 bg-destructive/10 px-2 py-1 text-[10px] font-bold text-destructive">Alert</span>
              ) : (
                <MapPinIcon className="h-4 w-4 flex-shrink-0 text-primary" />
              )}
            </div>

            {selectedRider ? (
              <div className="grid gap-2 text-xs">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <p className="text-muted-foreground">Rider GPS</p>
                    <p className="font-semibold text-foreground">{selectedRider.has_gps_fix ? formatRelativeTime(selectedRider.last_location_update) : "No fix"}</p>
                  </div>
                  <div className={`rounded-lg border px-3 py-2 ${riderOperationalTone(selectedRider)}`}>
                    <p className="text-muted-foreground">Indicator</p>
                    <p className="font-semibold">{riderOperationalLabel(selectedRider)}</p>
                  </div>
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <p className="text-muted-foreground">ETA</p>
                    <p className={`font-semibold ${etaTextClass(currentOrder?.eta)}`}>{currentOrder?.eta?.label || "No active ETA"}</p>
                  </div>
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <p className="text-muted-foreground">Current COD</p>
                    <p className="font-semibold text-warning">{formatUGX(selectedRider.current_cod)}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground">Order</p>
                    <p className="font-bold text-primary">{currentOrder?.order_id || "-"}</p>
                  </div>
                  <p className="mt-1 font-semibold text-foreground">{currentOrder ? orderStatusLabel[currentOrder.status] : "No active assigned order"}</p>
                  {currentOrder ? (
                    <p className="mt-1 break-words text-muted-foreground">{currentOrder.merchant} | {currentOrder.delivery_zone} | {currentOrder.delivery_address}</p>
                  ) : null}
                </div>
                {currentOrder ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Route distance</p>
                      <p className="font-semibold text-foreground">{currentOrder.pricing_distance_km ? `${currentOrder.pricing_distance_km.toFixed(2)} KM` : "Pending"}</p>
                    </div>
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <p className="text-muted-foreground">Route duration</p>
                      <p className="font-semibold text-foreground">{formatDuration(currentOrder.pricing_duration_seconds)}</p>
                    </div>
                    {currentOrder.navigation_url ? (
                      <a
                        href={currentOrder.navigation_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-white"
                        title="Open this selected delivery route in OpenStreetMap navigation."
                      >
                        <NavigationIcon className="h-3.5 w-3.5" />
                        Navigate
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-bold text-muted-foreground"
                        title="Navigation needs valid rider/package and drop-off coordinates."
                      >
                        <NavigationIcon className="h-3.5 w-3.5" />
                        Navigate
                      </button>
                    )}
                  </div>
                ) : null}
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-muted-foreground">Package GPS</p>
                  {currentOrder?.package_gps ? (
                    <p className="break-all font-semibold text-foreground">
                      {currentOrder.package_gps.latitude.toFixed(5)}, {currentOrder.package_gps.longitude.toFixed(5)}
                    </p>
                  ) : selectedPackage ? (
                    <p className="break-all font-semibold text-foreground">
                      {selectedPackage.gps_location.latitude.toFixed(5)}, {selectedPackage.gps_location.longitude.toFixed(5)}
                    </p>
                  ) : (
                    <p className="font-semibold text-muted-foreground">No package GPS for current order</p>
                  )}
                  {currentOrder?.tracker_divergence_alert ? (
                    <p className="mt-2 rounded-lg border border-destructive/25 bg-destructive/10 px-2 py-1 text-[10px] font-bold text-destructive">
                      Package and rider locations diverged {formatNumber(currentOrder.tracker_divergence_distance)}m+
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Riders with GPS will appear on the map after backend location updates are received.</p>
            )}
          </div>
        </section>

        <aside className="min-h-0 min-w-0 overflow-y-auto overscroll-contain bg-card">
          <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-foreground">Active Riders</p>
                <p className="text-xs text-muted-foreground">{formatNumber(data.summary.riders_with_gps)} tracked</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success status-pulse" />
                Live
              </span>
            </div>
          </div>

          <div className="divide-y divide-border">
            {loading ? (
              <AppLoader variant="panel" label="Loading live riders" subtitle="Fetching GPS and active order positions." />
            ) : null}
            {!loading && filteredRiders.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {searchTerm ? "No riders match the search." : "No active rider profiles were returned for this scope."}
              </div>
            ) : null}
            {filteredRiders.map((rider) => (
              <button
                key={rider.id}
                onClick={() => setSelectedRiderId(rider.id)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                  selectedRider?.id === rider.id ? "bg-primary/10" : "hover:bg-muted/40"
                }`}
              >
                <span className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border ${riderOperationalTone(rider)}`}>
                  <TruckIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-foreground">{rider.full_name}</span>
                    <span className="shrink-0 text-[10px] font-bold text-foreground">{rider.active_order_count} pkg{rider.active_order_count === 1 ? "" : "s"}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    <span className={statusText[rider.current_status]}>{statusLabel[rider.current_status]}</span>
                    {" "}- {rider.current_order?.delivery_zone || "No active zone"}
                  </span>
                  <span className="mt-1 block truncate text-[10px] font-semibold text-primary">{rider.current_order?.order_id || rider.bike_plate || "No active order"}</span>
                  {rider.current_order?.eta ? (
                    <span className={`mt-1 flex items-center gap-1 text-[10px] font-bold ${etaTextClass(rider.current_order.eta)}`}>
                      <ClockIcon className="h-3 w-3" />
                      {rider.current_order.eta.label}
                    </span>
                  ) : null}
                  <span className={`mt-1 inline-flex items-center gap-1 text-[10px] ${rider.has_gps_fix ? "text-success" : "text-destructive"}`}>
                    {rider.has_gps_fix ? <WifiIcon className="h-3 w-3" /> : <WifiOffIcon className="h-3 w-3" />}
                    {rider.has_gps_fix ? formatRelativeTime(rider.last_location_update) : "No GPS fix"}
                  </span>
                  {rider.is_idle || rider.is_gps_dark ? (
                    <span className={`mt-1 flex items-center gap-1 text-[10px] font-bold ${rider.is_idle ? "text-warning" : "text-destructive"}`}>
                      <ActivityIcon className="h-3 w-3" />
                      {riderOperationalLabel(rider)}
                    </span>
                  ) : null}
                  {rider.current_order?.tracker_divergence_alert ? (
                    <span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-destructive">
                      <AlertTriangleIcon className="h-3 w-3" />
                      Location mismatch
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-border px-4 py-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-muted px-2 py-2">
                <p className="text-[10px] text-muted-foreground">Orders</p>
                <p className="text-xs font-bold text-primary">{formatNumber(data.summary.active_orders)}</p>
              </div>
              <div className="rounded-lg bg-muted px-2 py-2">
                <p className="text-[10px] text-muted-foreground">Delayed</p>
                <p className="text-xs font-bold text-destructive">{formatNumber(data.summary.delayed_riders || 0)}</p>
              </div>
              <div className="rounded-lg bg-muted px-2 py-2">
                <p className="text-[10px] text-muted-foreground">Idle</p>
                <p className="text-xs font-bold text-warning">{formatNumber(data.summary.idle_riders || 0)}</p>
              </div>
              <div className="rounded-lg bg-muted px-2 py-2">
                <p className="text-[10px] text-muted-foreground">Alerts</p>
                <p className="text-xs font-bold text-warning">{formatNumber(data.alerts.length)}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
