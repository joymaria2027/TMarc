import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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

export default function DeliveryMap({
  waypoints = [],
  pickupLat, pickupLng,
  dropoffLat, dropoffLng,
  currentLat, currentLng,
  className = 'h-64 w-full rounded-lg'
}: DeliveryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstance.current) {
      mapInstance.current.remove();
    }

    const center: [number, number] = currentLat && currentLng
      ? [currentLat, currentLng]
      : pickupLat && pickupLng
        ? [pickupLat, pickupLng]
        : [0, 0];

    const map = L.map(mapRef.current).setView(center, 13);
    mapInstance.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    if (pickupLat && pickupLng) {
      L.marker([pickupLat, pickupLng], {
        icon: L.divIcon({
          className: 'bg-transparent',
          html: '<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>',
          iconSize: [14, 14], iconAnchor: [7, 7]
        })
      }).addTo(map).bindPopup('Pickup');
      bounds.extend([pickupLat, pickupLng]);
    }

    if (dropoffLat && dropoffLng) {
      L.marker([dropoffLat, dropoffLng], {
        icon: L.divIcon({
          className: 'bg-transparent',
          html: '<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>',
          iconSize: [14, 14], iconAnchor: [7, 7]
        })
      }).addTo(map).bindPopup('Drop-off');
      bounds.extend([dropoffLat, dropoffLng]);
    }

    if (currentLat && currentLng) {
      L.marker([currentLat, currentLng], {
        icon: L.divIcon({
          className: 'bg-transparent',
          html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
          iconSize: [16, 16], iconAnchor: [8, 8]
        })
      }).addTo(map).bindPopup('Current Location');
      bounds.extend([currentLat, currentLng]);
    }

    if (waypoints.length > 1) {
      const latlngs: [number, number][] = waypoints.map(w => [w.latitude, w.longitude]);
      L.polyline(latlngs, { color: '#3b82f6', weight: 3, opacity: 0.7 }).addTo(map);
      latlngs.forEach(ll => bounds.extend(ll));
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [waypoints, pickupLat, pickupLng, dropoffLat, dropoffLng, currentLat, currentLng]);

  return <div ref={mapRef} className={className} />;
}
