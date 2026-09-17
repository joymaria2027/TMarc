import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  const [riders, setRiders] = useState<RiderLocation[]>([]);
  const [selectedRider, setSelectedRider] = useState<RiderLocation | null>(null);
  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRiders = async () => {
    const { data: ridersData } = await supabase.from('riders').select('*').eq('is_active', true);
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

  useEffect(() => {
    loadRiders();
    const channel = supabase
      .channel('gps-tracker-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => loadRiders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => loadRiders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime: listen for rider location updates
  useEffect(() => {
    const channel = supabase
      .channel('rider-locations')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders' }, (payload) => {
        const updated = payload.new as any;
        setRiders(prev => prev.map(r =>
          r.id === updated.id
            ? { ...r, current_latitude: updated.current_latitude, current_longitude: updated.current_longitude, is_online: updated.is_online, last_location_update: updated.last_location_update }
            : r
        ));
        if (selectedRider?.id === updated.id) {
          setSelectedRider(prev => prev ? { ...prev, current_latitude: updated.current_latitude, current_longitude: updated.current_longitude, last_location_update: updated.last_location_update } : prev);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => {
        loadRiders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedRider?.id]);

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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">GPS Tracker</h1>
        <p className="text-muted-foreground">Monitor all rider movements and deliveries in real-time</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">{riders.length}</p>
          <p className="text-xs text-muted-foreground">Total Riders</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-accent">{onlineRiders.length}</p>
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
        <div className="md:col-span-1 space-y-2 max-h-[600px] overflow-y-auto">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Riders</h2>
          {riders.map(r => (
            <Card
              key={r.id}
              className={`cursor-pointer transition-all ${selectedRider?.id === r.id ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
              onClick={() => setSelectedRider(r)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{r.profile?.full_name || 'Unknown'}</span>
                  <div className="flex gap-1">
                    {r.is_online ? (
                      <Badge className="bg-accent/10 text-accent text-xs">Online</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Offline</Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">🏍 {r.vehicle_type} {r.license_plate && `• ${r.license_plate}`}</p>
                {r.activeDelivery && (
                  <div className="mt-1 text-xs">
                    <Badge className="bg-primary/10 text-primary text-xs">{r.activeDelivery.status.replace('_', ' ')}</Badge>
                    <p className="text-muted-foreground mt-1 truncate">📍 {r.activeDelivery.pickup_address}</p>
                    <p className="text-muted-foreground truncate">🏁 {r.activeDelivery.dropoff_address}</p>
                  </div>
                )}
                {r.current_latitude && r.current_longitude && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Navigation className="h-3 w-3" />
                    <span>{r.current_latitude.toFixed(4)}, {r.current_longitude.toFixed(4)}</span>
                  </div>
                )}
                {r.last_location_update && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(r.last_location_update).toLocaleTimeString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
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
              ) : (
                <div className="h-[500px] flex items-center justify-center bg-muted/30 rounded-lg">
                  <div className="text-center text-muted-foreground">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Select a rider from the list to view their live location</p>
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
