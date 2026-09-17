import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DeliveryMap from "./DeliveryMap";

interface Props {
  orderId: string;
  deliveryId?: string | null;
  className?: string;
}

interface LiveLoc {
  latitude: number | null;
  longitude: number | null;
  recorded_at: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
}

export default function LiveDeliveryMap({ orderId, deliveryId, className }: Props) {
  const [loc, setLoc] = useState<LiveLoc | null>(null);

  const fetchLoc = async () => {
    const { data } = await supabase.rpc("get_order_live_location", { _order_id: orderId });
    if (data && data.length > 0) setLoc(data[0] as any);
  };

  useEffect(() => {
    fetchLoc();
    const poll = setInterval(fetchLoc, 15000);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (deliveryId) {
      channel = supabase
        .channel(`waypoints-${deliveryId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "delivery_waypoints", filter: `delivery_id=eq.${deliveryId}` },
          (payload: any) => {
            const w = payload.new;
            setLoc(prev => prev ? { ...prev, latitude: w.latitude, longitude: w.longitude, recorded_at: w.recorded_at } : prev);
          }
        )
        .subscribe();
    }
    return () => {
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [orderId, deliveryId]);

  if (!loc) return null;

  return (
    <div className={className}>
      <DeliveryMap
        pickupLat={loc.pickup_lat ? Number(loc.pickup_lat) : null}
        pickupLng={loc.pickup_lng ? Number(loc.pickup_lng) : null}
        dropoffLat={loc.dropoff_lat ? Number(loc.dropoff_lat) : null}
        dropoffLng={loc.dropoff_lng ? Number(loc.dropoff_lng) : null}
        currentLat={loc.latitude ? Number(loc.latitude) : null}
        currentLng={loc.longitude ? Number(loc.longitude) : null}
        className="h-56 w-full rounded-lg"
      />
      {loc.recorded_at && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground mt-1">
          Rider location updated {new Date(loc.recorded_at).toLocaleTimeString()}
        </p>
      )}
      <p className="text-sm text-muted-foreground">Map shows the rider&apos;s location shared by the merchant, not your device location.</p>
    </div>
  );
}
