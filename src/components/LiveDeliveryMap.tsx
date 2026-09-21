import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const DeliveryMap = lazy(() => import("./DeliveryMap"));

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const lastAnnouncedRef = useRef<number>(0);

  // Throttle live announcements: at most one per 30s so screen readers aren't spammed.
  const announce = (text: string) => {
    const now = Date.now();
    if (now - lastAnnouncedRef.current < 30_000) return;
    lastAnnouncedRef.current = now;
    setAnnouncement(text);
  };

  const fetchLoc = async () => {
    const { data, error } = await supabase.rpc("get_order_live_location", { _order_id: orderId });
    if (error) {
      // Never conflate a failed load with "rider hasn't shared GPS yet":
      // the 400s seen in prod (e.g. P0001 Not authorized from the RPC's
      // auth checks) need the server message visible to diagnose.
      console.error("[LiveDeliveryMap] get_order_live_location failed", {
        code: (error as { code?: string }).code,
        message: error.message,
        orderId,
      });
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    if (data && data.length > 0) setLoc(data[0] as LiveLoc);
    setLoading(false);
  };

  const retry = () => {
    setLoadError(null);
    setLoading(true);
    void fetchLoc();
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
          (payload: { new: { latitude: number; longitude: number; recorded_at: string } }) => {
            const w = payload.new;
            setLoc(prev => prev ? { ...prev, latitude: w.latitude, longitude: w.longitude, recorded_at: w.recorded_at } : prev);
            announce(`Rider location updated ${new Date(w.recorded_at).toLocaleTimeString()}`);
          }
        )
        .subscribe();
    }
    return () => {
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, deliveryId]);

  if (loading) {
    return (
      <div className={className} role="status" aria-label="Loading live delivery map">
        <Skeleton className="shimmer h-56 w-full rounded-lg" />
      </div>
    );
  }

  if (!loc) {
    if (loadError) {
      return (
        <div className={className} role="alert" aria-label="Live delivery map failed to load">
          <div className="h-56 w-full rounded-lg border border-dashed flex flex-col items-center justify-center text-center text-muted-foreground p-4">
            <p className="text-sm font-medium">We couldn&apos;t load the live location</p>
            <p className="text-xs mt-1">The rider&apos;s location couldn&apos;t be fetched right now.</p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className={className} role="status" aria-label="Live delivery map unavailable">
        <div className="h-56 w-full rounded-lg border border-dashed flex flex-col items-center justify-center text-center text-muted-foreground p-4">
          <p className="text-sm font-medium">No live location yet</p>
          <p className="text-xs mt-1">Waiting for the rider to start this delivery and share GPS. The merchant shares the rider&apos;s location once the run begins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Suspense fallback={<Skeleton className="shimmer h-56 w-full rounded-lg" />}>
        <DeliveryMap
          pickupLat={loc.pickup_lat ? Number(loc.pickup_lat) : null}
          pickupLng={loc.pickup_lng ? Number(loc.pickup_lng) : null}
          dropoffLat={loc.dropoff_lat ? Number(loc.dropoff_lat) : null}
          dropoffLng={loc.dropoff_lng ? Number(loc.dropoff_lng) : null}
          currentLat={loc.latitude ? Number(loc.latitude) : null}
          currentLng={loc.longitude ? Number(loc.longitude) : null}
          className="h-56 w-full rounded-lg"
        />
      </Suspense>
      <div aria-live="polite" role="status" className="sr-only">{announcement}</div>
      {loc.recorded_at && (
        <p className="text-sm text-muted-foreground mt-1">
          Rider location updated <time dateTime={loc.recorded_at}>{new Date(loc.recorded_at).toLocaleTimeString()}</time>
        </p>
      )}
      <p className="text-sm text-muted-foreground">Map shows the rider&apos;s location shared by the merchant, not your device location.</p>
    </div>
  );
}
