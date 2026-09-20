import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { darkBasemapUrl, DARK_BASEMAP_ATTRIBUTION } from '@/lib/cartoTiles';

interface Waypoint {
  latitude: number;
  longitude: number;
  recorded_at: string;
}

interface DeliveryMapProps {
  waypoints?: Waypoint[];
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  currentLat?: number | null;
  currentLng?: number | null;
  className?: string;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
}

function mapPalette() {
  return {
    pickup: cssVar('--success', '#2f7d4f'),
    dropoff: cssVar('--destructive', '#c0392b'),
    rider: cssVar('--info', '#2471a3'),
    route: cssVar('--info', '#2471a3'),
  };
}

export default function DeliveryMap({
  waypoints = [],
  pickupLat, pickupLng,
  dropoffLat, dropoffLng,
  currentLat, currentLng,
  className = 'h-64 w-full rounded-lg'
}: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layersRef = useRef<Leaflet.LayerGroup | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);
  const [ready, setReady] = useState(false);

  // Create the map once; lazy-load Leaflet so the chunk splits off the main bundle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      delete ((L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl);
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
      const center: [number, number] =
        currentLat && currentLng ? [currentLat, currentLng]
        : pickupLat && pickupLng ? [pickupLat, pickupLng]
        : [0, 0];
      const map = L.map(containerRef.current, { scrollWheelZoom: false, tapTolerance: 15 }).setView(center, 13);
      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);
      const isDark =
        document.documentElement.classList.contains('dark') ||
        window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      containerRef.current?.classList.toggle('dark-tiles', !!isDark);
      L.tileLayer(
        isDark
          ? darkBasemapUrl()
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        isDark
          ? { attribution: DARK_BASEMAP_ATTRIBUTION, subdomains: 'abcd', maxZoom: 20 }
          : { attribution: '© OpenStreetMap contributors' },
      ).addTo(map);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Tear down on unmount only — prop changes diff layers below, never remount.
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // Diff markers/polyline in place.
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    const L = LRef.current;
    if (!map || !layers || !L || !ready) return;
    layers.clearLayers();
    const palette = mapPalette();
    const bounds = L.latLngBounds([]);

    const dot = (color: string, size: number, label: string) =>
      L.divIcon({
        className: 'bg-transparent',
        html: `<div role="img" aria-label="${label}" style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

    if (pickupLat && pickupLng) {
      L.marker([pickupLat, pickupLng], { keyboard: false, title: 'Pickup location', icon: dot(palette.pickup, 16, 'Pickup location') })
        .addTo(layers).bindPopup('Pickup');
      bounds.extend([pickupLat, pickupLng]);
    }
    if (dropoffLat && dropoffLng) {
      L.marker([dropoffLat, dropoffLng], { keyboard: false, title: 'Drop-off location', icon: dot(palette.dropoff, 16, 'Drop-off location') })
        .addTo(layers).bindPopup('Drop-off');
      bounds.extend([dropoffLat, dropoffLng]);
    }
    if (currentLat && currentLng) {
      L.marker([currentLat, currentLng], { keyboard: false, title: 'Rider current location', icon: dot(palette.rider, 22, 'Rider current location') })
        .addTo(layers).bindPopup('Current Location');
      bounds.extend([currentLat, currentLng]);
    }
    if (waypoints.length > 1) {
      const latlngs: [number, number][] = waypoints.map(w => [w.latitude, w.longitude]);
      L.polyline(latlngs, { color: palette.route, weight: 3, opacity: 0.7 }).addTo(layers);
      latlngs.forEach(ll => bounds.extend(ll));
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
  }, [ready, waypoints, pickupLat, pickupLng, dropoffLat, dropoffLng, currentLat, currentLng]);

  return (
    <div role="region" aria-label="Delivery map: pickup, drop-off, and rider location. Equivalent details follow in text." className={className}>
      <div
        ref={containerRef}
        className="h-full w-full rounded-lg"
        role="img"
        aria-label="Delivery map showing pickup, drop-off, and rider current location. Use the order status list for equivalent text information."
      />
    </div>
  );
}
