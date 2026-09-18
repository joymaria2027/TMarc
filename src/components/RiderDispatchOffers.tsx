import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapPin, Timer } from "lucide-react";

interface Offer {
  delivery_id: string; order_id: string; order_reference: string;
  merchant_name: string; pickup_lat: number | null; pickup_lng: number | null;
  dropoff_address: string | null; dropoff_lat: number | null; dropoff_lng: number | null;
  estimated_tariff: number; offered_at: string; expires_at: string | null;
}

const AVG_SPEED_KMH = 25;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function etaMinutes(km: number) {
  return Math.max(1, Math.round((km / AVG_SPEED_KMH) * 60));
}


export default function RiderDispatchOffers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const seen = useRef<Set<string>>(new Set());

  const load = async () => {
    const { data, error } = await supabase.rpc("get_offered_orders_for_rider");
    if (!error) {
      const list = ((data || []) as unknown as Offer[]).map(o => ({ ...o, estimated_tariff: Number(o.estimated_tariff) }));
      list.forEach(o => {
        if (!seen.current.has(o.delivery_id)) {
          seen.current.add(o.delivery_id);
          if (!loading) toast.info(`New delivery offer: ${o.order_reference || ""}`);
        }
      });
      setOffers(list);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const ch = supabase.channel("dispatch-offers")
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_dispatch_offers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => { clearInterval(t); clearInterval(tick); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let lastPush = 0;
    const id = navigator.geolocation.watchPosition(
      async p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMyPos(pos);
        // Keep the rider's stored location fresh so dispatch radii stay accurate.
        if (Date.now() - lastPush > 30000) {
          lastPush = Date.now();
          const { data: auth } = await supabase.auth.getUser();
          if (auth?.user) {
            await supabase.from("riders").update({
              current_latitude: pos.lat,
              current_longitude: pos.lng,
              last_location_update: new Date().toISOString(),
            }).eq("user_id", auth.user.id);
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);


  const claim = async (orderId: string) => {
    const { data, error } = await supabase.rpc("claim_dispatched_order", { _order_id: orderId });
    if (error) toast.error(error.message);
    else if (data) { toast.success("You claimed this delivery"); load(); }
    else toast.error("Another rider got there first");
  };

  if (loading) return null;
  if (offers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Badge>{offers.length}</Badge> Available deliveries near you
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {offers.map(o => {
          const dist = myPos && o.pickup_lat && o.pickup_lng
            ? haversineKm(myPos.lat, myPos.lng, Number(o.pickup_lat), Number(o.pickup_lng))
            : null;
          const secsLeft = o.expires_at ? Math.max(0, Math.round((new Date(o.expires_at).getTime() - now) / 1000)) : null;
          return (
            <div key={o.delivery_id} className="border rounded-md p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{o.order_reference}</p>
                  <p className="text-xs text-muted-foreground">{o.merchant_name}</p>
                </div>
                <span className="font-display text-lg">D {Number(o.estimated_tariff).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {dist !== null && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{dist.toFixed(1)} km · ~{etaMinutes(dist)} min to pickup
                  </span>
                )}

                {secsLeft !== null ? (
                  <span className="flex items-center gap-1"><Timer className="h-3 w-3" />
                    {secsLeft > 0 ? `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")} left` : "expiring"}
                  </span>
                ) : (
                  <Badge variant="secondary" className="text-[11px]">Open to all riders</Badge>
                )}
              </div>
              {o.dropoff_address && <p className="text-xs text-muted-foreground">→ {o.dropoff_address}</p>}
              <Button size="sm" onClick={() => claim(o.order_id)}>Accept delivery</Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
