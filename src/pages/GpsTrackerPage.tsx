import { useState, useEffect, useRef, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { fetchRidersPage } from '@/lib/queries/riders';
import type { DeliveryRow } from '@/lib/queries/deliveries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import DeliveryMap from '@/components/DeliveryMap';
import { Navigation, MapPin, Clock, Truck } from 'lucide-react';

interface RiderLocation {
  id: string;
  user_id: string;
  vehicle_type: string;
  license_plate: string | null;
  is_online: boolean;
  is_active: boolean;
  current_latitude: number | null;
  current_longitude: number | null;
  last_location_update: string | null;
  profile?: { full_name: string; email: string } | null;
  activeDelivery?: {
    id: string;
    status: string;
    order_reference: string | null;
    pickup_address: string;
    dropoff_address: string;
    pickup_latitude: number | null;
    pickup_longitude: number | null;
    dropoff_latitude: number | null;
    dropoff_longitude: number | null;
  } | null;
}

export default function GpsTrackerPage() {
  // Shared realtime data layer: rider GPS pings patch in place (no reload).
  // mergeUpdate preserves the enriched profile/activeDelivery fields that the
  // raw rider payload does not carry; shouldKeep drops deactivated riders.
  const { rows: riders, setRows: setRiders } = useRealtimeTable<RiderLocation>({
    channelName: 'gps-tracker-riders',
    table: 'riders',
    debounceMs: 150,
    shouldKeep: (row) => row.is_active,
    mergeUpdate: (prev, next) => ({
      ...next,
      profile: next.profile ?? prev.profile,
      activeDelivery: next.activeDelivery ?? prev.activeDelivery,
    }),
  });
  const [selectedRider, setSelectedRider] = useState<RiderLocation | null>(null);
  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRiders = async () => {
    // TODO(data-layer): fold the profiles + active-delivery fan-out below into
    // query helpers (single join per source) instead of three round trips.
    const ridersData = await fetchRidersPage({ activeOnly: true, page: 1, pageSize: 200 });
    const { data: profilesData } = await supabase.from('profiles').select('user_id, full_name, email');
    const { data: deliveriesData } = await supabase.from('deliveries').select('*').in('status', ['dispatched', 'picked_up', 'in_transit']);

    const profileMap = Object.fromEntries((profilesData || []).map(p => [p.user_id, p]));

    const merged = (ridersData || []).map(r => {
      const activeDelivery = (deliveriesData || []).find(d => d.rider_id === r.id) || null;
      return {
        ...r,
        profile: profileMap[r.user_id] || null,
        activeDelivery,
      };
    });

    setRiders(merged);
    setLoading(false);
  };

  const loadRidersRef = useRef(loadRiders);
  loadRidersRef.current = loadRiders;

  // Delivery assignment changes are structural (activeDelivery join), so they
  // trigger one debounced reload — rider location pings never reload.
  useRealtimeTable<DeliveryRow>({
    channelName: 'gps-tracker-deliveries',
    table: 'deliveries',
    debounceMs: 500,
    autoPatch: false,
    onPatch: () => { void loadRidersRef.current(); },
  });

  useEffect(() => {
    loadRiders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the selected card in sync with patched rows.
  useEffect(() => {
    setSelectedRider(prev => (prev ? riders.find(r => r.id === prev.id) ?? prev : prev));
  }, [riders]);

  // Load waypoints for selected rider's active delivery
  useEffect(() => {
    if (!selectedRider?.activeDelivery) { setWaypoints([]); return; }
    const loadWaypoints = async () => {
      const { data } = await supabase.from('delivery_waypoints')
        .select('*')
        .eq('delivery_id', selectedRider.activeDelivery!.id)
        .order('recorded_at', { ascending: true });
      setWaypoints(data || []);
    };
    loadWaypoints();

    // Realtime waypoints
    const ch = supabase
      .channel('tracker-waypoints')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_waypoints', filter: `delivery_id=eq.${selectedRider.activeDelivery.id}` }, (payload) => {
        setWaypoints(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [selectedRider?.activeDelivery?.id]);

  const onlineRiders = riders.filter(r => r.is_online);
  const ridersWithLocation = riders.filter(r => r.current_latitude && r.current_longitude);
  const ridersOnDelivery = riders.filter(r => r.activeDelivery);

  if (loading) return (
    <div role="status" aria-label="Loading GPS tracker" className="space-y-3 py-6">
      <Skeleton className="shimmer h-16 w-full rounded-lg" />
      <Skeleton className="shimmer h-64 w-full rounded-lg" />
      <span className="sr-only">Loading rider locations…</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">GPS Tracker</h1>
        <p className="text-muted-foreground">Monitor all rider movements and deliveries in real-time</p>
      </div>

      {/* Stats — operational counts only (lane-01: fold vanity Total into the list header) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-accent-foreground bg-accent/15 rounded-md tabular-nums">{onlineRiders.length}</p>
          <p className="text-xs text-muted-foreground">Online</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{ridersOnDelivery.length}</p>
          <p className="text-xs text-muted-foreground">On Delivery</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">{ridersWithLocation.length}</p>
          <p className="text-xs text-muted-foreground">GPS Active</p>
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Rider list */}
        <div className="md:col-span-1 space-y-2 max-h-[600px] overflow-y-auto" role="region" aria-label={`Active riders (${riders.length} total)`} tabIndex={0}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Riders ({riders.length})</h2>
          {riders.map(r => {
            const selected = selectedRider?.id === r.id;
            return (
            <Card
              key={r.id}
              className={`transition-all ${selected ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="font-medium text-sm">{r.profile?.full_name || 'Unknown'}</span>
                  <div className="flex gap-1">
                    {r.is_online ? (
                      <Badge className="bg-accent/10 text-accent-foreground border border-accent/30 text-xs tabular-nums">Online</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Offline</Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" aria-hidden="true" />{r.vehicle_type} {r.license_plate && `• ${r.license_plate}`}</p>
                {r.activeDelivery && (
                  <div className="mt-1 text-xs">
                    <Badge className="bg-primary/10 text-primary text-xs">{r.activeDelivery.status.replace('_', ' ')}</Badge>
                    <p className="text-muted-foreground mt-1 truncate flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{r.activeDelivery.pickup_address}</p>
                    <p className="text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{r.activeDelivery.dropoff_address}</p>
                  </div>
                )}
                {r.current_latitude && r.current_longitude && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    <Navigation className="h-3 w-3" aria-hidden="true" />
                    <span>{r.current_latitude.toFixed(4)}, {r.current_longitude.toFixed(4)}</span>
                  </div>
                )}
                {r.last_location_update && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    <time dateTime={r.last_location_update}>{new Date(r.last_location_update).toLocaleTimeString()}</time>
                  </p>
                )}
                <Button
                  variant={selected ? 'secondary' : 'outline'}
                  size="sm"
                  className="mt-2 w-full min-h-[44px]"
                  aria-label={`Track rider ${r.profile?.full_name || 'Unknown rider'}`}
                  aria-pressed={selected}
                  onClick={() => setSelectedRider(r)}
                >
                  {selected ? 'Tracking' : 'Track rider'}
                </Button>
              </CardContent>
            </Card>
            );
          })}
          {riders.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No active riders</p>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {selectedRider
                  ? `Tracking: ${selectedRider.profile?.full_name || 'Unknown Rider'}`
                  : 'Select a rider to track'
                }
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {selectedRider ? (
                <Suspense fallback={<Skeleton className="shimmer h-[500px] w-full rounded-lg" />}>
                  <DeliveryMap
                    pickupLat={selectedRider.activeDelivery?.pickup_latitude}
                    pickupLng={selectedRider.activeDelivery?.pickup_longitude}
                    dropoffLat={selectedRider.activeDelivery?.dropoff_latitude}
                    dropoffLng={selectedRider.activeDelivery?.dropoff_longitude}
                    currentLat={selectedRider.current_latitude}
                    currentLng={selectedRider.current_longitude}
                    waypoints={waypoints.map(w => ({ latitude: w.latitude, longitude: w.longitude, recorded_at: w.recorded_at }))}
                    className="h-[500px] w-full rounded-lg"
                  />
                </Suspense>
              ) : (
                <div className="h-[500px] flex items-center justify-center bg-muted/30 rounded-lg">
                  <div className="text-center text-muted-foreground max-w-sm px-4">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
                    <p className="font-medium">Select a rider from the list to view their live location</p>
                    <p className="text-xs mt-1">Each rider card has a Track rider button. Live GPS appears here once a rider is selected.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
