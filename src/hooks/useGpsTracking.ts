import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export function useGpsTracking(deliveryId: string | null) {
  const [tracking, setTracking] = useState(false);
  const [positions, setPositions] = useState<GpsPosition[]>([]);
  const [currentPosition, setCurrentPosition] = useState<GpsPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('GPS not available on this device');
      return;
    }
    setError(null);
    setTracking(true);
    setPositions([]);

    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const gps: GpsPosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        };
        setCurrentPosition(gps);
        setPositions(prev => [...prev, gps]);

        if (deliveryId) {
          await supabase.from('delivery_waypoints').insert({
            delivery_id: deliveryId,
            latitude: gps.latitude,
            longitude: gps.longitude,
            accuracy: gps.accuracy,
            speed: gps.speed,
            heading: gps.heading,
          });

          // Also update rider's current location for admin tracking
          const { data: delivery } = await supabase.from('deliveries').select('rider_id').eq('id', deliveryId).single();
          if (delivery?.rider_id) {
            await supabase.from('riders').update({
              current_latitude: gps.latitude,
              current_longitude: gps.longitude,
              last_location_update: new Date().toISOString(),
              is_online: true,
            }).eq('id', delivery.rider_id);
          }
        }
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, [deliveryId]);

  const stopTracking = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setTracking(false);
  }, []);

  const calculateDistance = useCallback((): number => {
    if (positions.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      total += haversine(
        positions[i - 1].latitude, positions[i - 1].longitude,
        positions[i].latitude, positions[i].longitude
      );
    }
    return Math.round(total * 100) / 100;
  }, [positions]);

  return { tracking, positions, currentPosition, error, startTracking, stopTracking, calculateDistance };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
