import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useGpsTracking } from '@/hooks/useGpsTracking';
import { supabase } from '@/integrations/supabase/client';
import DeliveryMap from '@/components/DeliveryMap';
import OrderStatusTimeline from '@/components/OrderStatusTimeline';
import ReceiptUpload from '@/components/ReceiptUpload';
import PaymentMethodSelect from '@/components/PaymentMethodSelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Play, Square, Navigation, Clock, MapPin, Truck, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import WalletWidget from '@/components/WalletWidget';
import RiderDispatchOffers from '@/components/RiderDispatchOffers';
import { removeDeliveryFromQueue } from './riderDashboard.helpers';
import OdometerCaptureDialog from '@/components/OdometerCaptureDialog';

interface Delivery {
  id: string;
  rider_id?: string | null;
  status: string;
  merchant_id?: string | null;
  pickup_address: string;
  dropoff_address: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  dispatched_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  actual_distance_km: number | null;
  start_odometer_miles?: number | null;
  end_odometer_miles?: number | null;
  estimated_distance_km?: number | null;
  order_reference: string | null;
  estimated_tariff: number | null;
  receipt_attached: boolean;
  payment_method?: string | null;
  payment_bank_name?: string | null;
  created_at: string;
  merchants?: { name: string } | null;
}

interface RevShare {
  merchant_id: string;
  rider_percentage: number;
  merchant_percentage: number;
  ucs_rides_percentage: number;
  platform_percentage: number;
}

function haversineKm(lat1?: number | null, lon1?: number | null, lat2?: number | null, lon2?: number | null): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
}

export default function RiderDashboard() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [unassigned, setUnassigned] = useState<Delivery[]>([]);
  const [offered, setOffered] = useState<Delivery[]>([]);
  const [revShares, setRevShares] = useState<Record<string, RevShare>>({});
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [riderId, setRiderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Delivery | null>(null);
  const [detailRejections, setDetailRejections] = useState<Array<{ rider_name: string; rider_phone: string | null; reason: string | null; created_at: string }>>([]);
  const [pendingReject, setPendingReject] = useState<{ delivery: Delivery; kind: 'decline' | 'reject' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);
  // Recently rejected ids (TTL ~5s) — prevents realtime refetch from re-adding them
  const recentlyRejectedRef = useRef<Map<string, number>>(new Map());
  const isRecentlyRejected = (id: string) => {
    const ts = recentlyRejectedRef.current.get(id);
    if (!ts) return false;
    if (Date.now() - ts > 5000) { recentlyRejectedRef.current.delete(id); return false; }
    return true;
  };
  const markRecentlyRejected = (id: string) => {
    recentlyRejectedRef.current.set(id, Date.now());
  };
  const { tracking, currentPosition, startTracking, stopTracking, calculateDistance, positions } = useGpsTracking(activeDelivery?.id ?? null);

  const openDetail = async (d: Delivery) => {
    setDetail(d);
    setDetailRejections([]);
    const { data } = await supabase
      .from('delivery_rejections')
      .select('created_at, rider_id, reason')
      .eq('delivery_id', d.id)
      .order('created_at', { ascending: false });
    const rows = (data as any[]) || [];
    if (rows.length === 0) return;
    const riderIds = Array.from(new Set(rows.map(r => r.rider_id)));
    const { data: ridersData } = await supabase.from('riders').select('id, user_id, rider_code').in('id', riderIds);
    const userIds = (ridersData || []).map((r: any) => r.user_id);
    const { data: profs } = await supabase.from('profiles').select('user_id, full_name, phone').in('user_id', userIds);
    const profByUser: Record<string, { full_name: string; phone: string | null }> = {};
    (profs || []).forEach((p: any) => { profByUser[p.user_id] = { full_name: p.full_name, phone: p.phone }; });
    const infoByRider: Record<string, { name: string; phone: string | null }> = {};
    (ridersData || []).forEach((r: any) => {
      const p = profByUser[r.user_id];
      infoByRider[r.id] = { name: p?.full_name || r.rider_code || 'Rider', phone: p?.phone || null };
    });
    setDetailRejections(rows.map(r => ({
      rider_name: infoByRider[r.rider_id]?.name || 'Rider',
      rider_phone: infoByRider[r.rider_id]?.phone || null,
      reason: r.reason || null,
      created_at: r.created_at,
    })));
  };

  const loadUnassigned = async (rId?: string | null) => {
    const effectiveRid = rId ?? riderId;
    let rejectedIds: string[] = [];
    if (effectiveRid) {
      const { data: rejs } = await supabase
        .from('delivery_rejections')
        .select('delivery_id')
        .eq('rider_id', effectiveRid);
      rejectedIds = ((rejs as any[]) || []).map(r => r.delivery_id);
    }
    const { data: rpcData } = await supabase.rpc('get_unassigned_deliveries_for_rider' as any);
    let rows = ((rpcData as any[]) || []) as Delivery[];
    if (rejectedIds.length > 0) {
      const rej = new Set(rejectedIds);
      rows = rows.filter(d => !rej.has(d.id));
    }
    // hydrate merchant names
    const mIds = Array.from(new Set(rows.map(d => d.merchant_id).filter(Boolean))) as string[];
    let mMap: Record<string, { name: string }> = {};
    if (mIds.length > 0) {
      const { data: ms } = await supabase.from('merchants').select('id, name').in('id', mIds);
      ((ms as any[]) || []).forEach(m => { mMap[m.id] = { name: m.name }; });
    }
    rows = rows.map(d => ({ ...d, merchants: d.merchant_id ? mMap[d.merchant_id] || null : null } as any));
    const list = rows
      .filter(d => !isRecentlyRejected(d.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setUnassigned(list);
    const restIds = Array.from(new Set(list.map(d => d.merchant_id).filter(Boolean))) as string[];
    if (restIds.length > 0) {
      const { data: rs } = await supabase
        .from('revenue_sharing')
        .select('merchant_id, rider_id, rider_percentage, merchant_percentage, ucs_rides_percentage, platform_percentage, created_at')
        .in('merchant_id', restIds)
        .order('created_at', { ascending: false });
      const map: Record<string, RevShare> = {};
      // Prefer rider-specific rule; fall back to merchant default (rider_id IS NULL).
      (rs || []).forEach((r: any) => {
        if (!r.merchant_id) return;
        const existing = map[r.merchant_id] as any;
        if (!existing || (r.rider_id === effectiveRid && (existing as any).rider_id == null)) {
          map[r.merchant_id] = r;
        }
      });
      setRevShares(map);
    }
  };

  const loadOffered = async () => {
    const { data } = await supabase.rpc('get_offered_deliveries');
    const ids = ((data as any[]) || []).map(d => d.id).filter(id => !isRecentlyRejected(id));
    if (ids.length === 0) { setOffered([]); return; }
    // re-fetch with merchant join for display
    const { data: full } = await supabase
      .from('deliveries')
      .select('*, merchants(name)')
      .in('id', ids)
      .order('created_at', { ascending: false });
    const list = ((full as any[] as Delivery[]) || []).filter(d => !isRecentlyRejected(d.id));
    setOffered(list);
    const restIds = Array.from(new Set(list.map(d => d.merchant_id).filter(Boolean))) as string[];
    if (restIds.length > 0) {
      const { data: rs } = await supabase
        .from('revenue_sharing')
        .select('merchant_id, rider_id, rider_percentage, merchant_percentage, ucs_rides_percentage, platform_percentage, created_at')
        .in('merchant_id', restIds)
        .order('created_at', { ascending: false });
      setRevShares(prev => {
        const map = { ...prev };
        (rs || []).forEach((r: any) => {
          if (!r.merchant_id) return;
          const existing = map[r.merchant_id] as any;
          if (!existing || (r.rider_id === riderId && (existing as any).rider_id == null)) {
            map[r.merchant_id] = r;
          }
        });
        return map;
      });
    }
  };


  const loadDeliveries = async (rId: string) => {
    const { data } = await supabase.from('deliveries').select('*').eq('rider_id', rId).order('created_at', { ascending: false });
    const list = ((data as Delivery[]) || []).filter(d => !isRecentlyRejected(d.id));
    setDeliveries(list);
    const active = list.find(d => ['accepted', 'picked_up', 'in_transit'].includes(d.status));
    if (active) setActiveDelivery(active);
    else setActiveDelivery(null);
  };

  // Auto-online when signed in; offline on unmount/sign-out
  useEffect(() => {
    if (!riderId) return;
    supabase.from('riders').update({ is_online: true, is_active: true }).eq('id', riderId).then(() => {});
    const goOffline = () => { supabase.from('riders').update({ is_online: false }).eq('id', riderId).then(() => {}); };
    window.addEventListener('beforeunload', goOffline);
    return () => {
      window.removeEventListener('beforeunload', goOffline);
      goOffline();
    };
  }, [riderId]);

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const { data: rider } = await supabase.from('riders').select('id').eq('user_id', user.id).single();
      if (rider) {
        setRiderId(rider.id);
        await loadDeliveries(rider.id);
        await loadUnassigned(rider.id);
        await loadOffered();
      }
      setLoading(false);
    };
    init();
  }, [user]);

  // Realtime: listen for new deliveries assigned to this rider
  useEffect(() => {
    if (!riderId) return;
    const channel = supabase
      .channel('rider-deliveries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `rider_id=eq.${riderId}` }, () => {
        loadDeliveries(riderId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => {
        loadDeliveries(riderId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, () => {
        loadDeliveries(riderId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: 'status=eq.unassigned' }, () => {
        loadDeliveries(riderId);
        loadUnassigned();
        loadOffered();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_rejections' }, () => {
        loadDeliveries(riderId);
        loadOffered();
        loadUnassigned();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [riderId]);

  const handleAcceptDelivery = async (delivery: Delivery) => {
    await supabase.from('deliveries').update({ status: 'accepted' }).eq('id', delivery.id);
    toast.success('Delivery accepted! You can now start it.');
    setDeliveries(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'accepted' } : d));
  };

  const ensureRiderAvailable = async () => {
    if (!riderId) return null;
    const { error } = await supabase.from('riders').update({ is_online: true, is_active: true }).eq('id', riderId);
    if (error) console.warn('ensureRiderAvailable failed', error);
    return error;
  };

  const describeError = (err: any): string => {
    if (!err) return 'Unknown error';
    return err.message || err.details || err.hint || err.code || JSON.stringify(err);
  };

  const getCurrentRiderId = async () => {
    if (riderId) return riderId;
    if (!user) return null;

    const { data, error } = await supabase
      .from('riders')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Unable to resolve rider record for rejection', error);
      return null;
    }

    if (data?.id) {
      setRiderId(data.id);
      return data.id;
    }

    return null;
  };

  const removeDeliveryFromLocalState = (deliveryId: string) => {
    setDeliveries(prev => removeDeliveryFromQueue(
      { deliveries: prev, unassigned: [], offered: [], activeDelivery: null, detail: null },
      deliveryId,
    ).deliveries);
    setUnassigned(prev => removeDeliveryFromQueue(
      { deliveries: [], unassigned: prev, offered: [], activeDelivery: null, detail: null },
      deliveryId,
    ).unassigned);
    setOffered(prev => removeDeliveryFromQueue(
      { deliveries: [], unassigned: [], offered: prev, activeDelivery: null, detail: null },
      deliveryId,
    ).offered);
    setActiveDelivery(prev => removeDeliveryFromQueue<Delivery>(
      { deliveries: [], unassigned: [], offered: [], activeDelivery: prev, detail: null },
      deliveryId,
    ).activeDelivery);
    setDetail(prev => removeDeliveryFromQueue<Delivery>(
      { deliveries: [], unassigned: [], offered: [], activeDelivery: null, detail: prev },
      deliveryId,
    ).detail);
  };

  type RejectResult = 'ok' | 'already_rejected' | 'error';
  const performReject = async (delivery: Delivery, label: 'decline' | 'reject', reason?: string): Promise<RejectResult> => {
    const availabilityError = await ensureRiderAvailable();
    if (availabilityError) {
      toast.error(`Reject failed: ${describeError(availabilityError)}`);
      return 'error';
    }

    const { error } = await supabase.rpc('reject_delivery', { _delivery_id: delivery.id, _reason: reason ?? null });
    if (error) {
      console.error(`${label} delivery failed`, { delivery_id: delivery.id, riderId, error });
      const msg = describeError(error);
      if (msg.includes('ALREADY_REJECTED')) {
        toast.info("You've already rejected this delivery — removing from your list.");
        return 'already_rejected';
      }
      toast.error(`Reject failed: ${msg}`);
      return 'error';
    }
    return 'ok';
  };

  const handleCancelAcceptance = async (delivery: Delivery) => {
    const reason = window.prompt('Cancel this delivery? Optionally tell us why:') ?? undefined;
    const { error } = await supabase.rpc('cancel_delivery_acceptance', {
      _delivery_id: delivery.id,
      _reason: reason?.trim() || null,
    });
    if (error) {
      toast.error(describeError(error));
      return;
    }
    toast.info('Acceptance cancelled — the order is back in the nearby pool');
    removeDeliveryFromLocalState(delivery.id);
    if (riderId) loadDeliveries(riderId);
    loadOffered();
    loadUnassigned(riderId);
  };


  const handleDeclineDelivery = (delivery: Delivery) => {
    setRejectReason('');
    setPendingReject({ delivery, kind: 'decline' });
  };

  const handleRejectOffer = (delivery: Delivery) => {
    setRejectReason('');
    setPendingReject({ delivery, kind: 'reject' });
  };

  const confirmReject = async () => {
    if (!pendingReject) return;
    const { delivery, kind } = pendingReject;

    // Optimistic: snapshot, then remove locally and close dialog immediately.
    const snapshot = { deliveries, unassigned, offered, activeDelivery, detail };
    markRecentlyRejected(delivery.id);
    removeDeliveryFromLocalState(delivery.id);
    setPendingReject(null);
    const reason = rejectReason.trim() || undefined;
    setRejectReason('');
    setSubmittingReject(true);

    const result = await performReject(delivery, kind, reason);
    setSubmittingReject(false);

    if (result === 'error') {
      // Restore the snapshot — the reject didn't go through.
      setDeliveries(snapshot.deliveries);
      setUnassigned(snapshot.unassigned);
      setOffered(snapshot.offered);
      setActiveDelivery(snapshot.activeDelivery);
      setDetail(snapshot.detail);
      recentlyRejectedRef.current.delete(delivery.id);
      return;
    }

    // 'ok' or 'already_rejected' — keep removed and resync from server.
    if (result === 'ok') {
      if (kind === 'decline') toast.info('Declined — offered to other riders');
      else toast.info('Offer rejected');
    }
    if (riderId) loadDeliveries(riderId);
    loadOffered();
    loadUnassigned(riderId);
  };

  const handleClaimDelivery = async (delivery: Delivery) => {
    if (!riderId) {
      toast.error('Your rider account could not be found. Please contact an admin.');
      return;
    }
    const { data, error } = await supabase.rpc('claim_delivery', { _delivery_id: delivery.id });
    if (error) {
      toast.error(`Could not claim: ${describeError(error)}`);
      loadUnassigned();
      loadOffered();
      return;
    }
    if (!data) {
      toast.info('Another rider grabbed this delivery first.');
      loadUnassigned();
      loadOffered();
      return;
    }
    toast.success('Delivery claimed!');
    setUnassigned(prev => prev.filter(d => d.id !== delivery.id));
    setOffered(prev => prev.filter(d => d.id !== delivery.id));
    setDetail(null);
    loadDeliveries(riderId);
  };

  const [pendingStart, setPendingStart] = useState<Delivery | null>(null);
  const [pendingEnd, setPendingEnd] = useState<Delivery | null>(null);

  const handleStartDelivery = (delivery: Delivery) => {
    setPendingStart(delivery);
  };

  const confirmStartOdometer = async (miles: number, photoUrl: string) => {
    const delivery = pendingStart;
    if (!delivery || !riderId) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('deliveries').update({
      status: 'in_transit',
      picked_up_at: nowIso,
      start_odometer_miles: miles,
      start_odometer_photo_url: photoUrl,
      start_odometer_at: nowIso,
    }).eq('id', delivery.id);
    if (error) { toast.error(error.message); return; }
    setActiveDelivery({ ...delivery, status: 'in_transit', picked_up_at: nowIso, start_odometer_miles: miles });
    startTracking();
    toast.success('Delivery started! GPS tracking active.');
    setDeliveries(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'in_transit', picked_up_at: nowIso, start_odometer_miles: miles } : d));
    setPendingStart(null);
  };

  const handleEndDelivery = () => {
    if (!activeDelivery) return;
    setPendingEnd(activeDelivery);
  };

  const confirmEndOdometer = async (miles: number, photoUrl: string) => {
    const delivery = pendingEnd;
    if (!delivery) return;
    stopTracking();
    const distance = calculateDistance();
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('deliveries').update({
      status: 'delivered', delivered_at: nowIso,
      actual_distance_km: distance, gps_confirmed: true,
      end_odometer_miles: miles,
      end_odometer_photo_url: photoUrl,
      end_odometer_at: nowIso,
    }).eq('id', delivery.id);
    if (error) { toast.error(error.message); return; }
    const milesCovered = delivery.start_odometer_miles != null ? (miles - delivery.start_odometer_miles) : null;
    toast.success(`Delivery completed!${milesCovered != null ? ` ${milesCovered.toFixed(1)} mi covered` : ''}`);
    setDeliveries(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'delivered', actual_distance_km: distance, end_odometer_miles: miles } : d));
    setActiveDelivery(null);
    setPendingEnd(null);
  };

  const handleMarkCompleted = async (delivery: Delivery) => {
    await supabase.from('deliveries').update({
      status: 'delivered', delivered_at: new Date().toISOString(), gps_confirmed: false,
    }).eq('id', delivery.id);
    toast.success('Delivery marked as completed');
    setDeliveries(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'delivered' } : d));
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-muted text-muted-foreground',
      dispatched: 'bg-info/10 text-info',
      picked_up: 'bg-warning/10 text-warning',
      in_transit: 'bg-primary/10 text-primary',
      delivered: 'bg-accent/10 text-accent',
      cancelled: 'bg-destructive/10 text-destructive',
    };
    return map[s] || '';
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  if (!riderId) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Truck className="h-16 w-16 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">Not Registered as Rider</h2>
      <p className="text-muted-foreground">Contact your admin to be registered as a delivery rider.</p>
    </div>
  );

  const pendingQueue = deliveries.filter(d => ['dispatched', 'accepted'].includes(d.status));
  const activeList = deliveries.filter(d => ['in_transit', 'picked_up'].includes(d.status));
  const completedList = deliveries.filter(d => d.status === 'delivered').slice(0, 10);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">On the road</p>
        <h1 className="font-display text-4xl tracking-tight">My deliveries.</h1>
        <p className="text-muted-foreground">Track, accept, and complete your runs.</p>
      </div>

      {/* Wallet Summary */}
      <WalletWidget />

      {/* New delivery offers from storefront orders */}
      <RiderDispatchOffers />


      <div className="grid gap-6 lg:grid-cols-2 items-start">
      {/* LEFT COLUMN: My queue */}
      <div className="space-y-6 lg:col-start-1">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">My queue</h2>
      {/* Active delivery with map */}
      {activeDelivery && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Active Delivery</CardTitle>
              <Badge className={statusColor(activeDelivery.status)}>{activeDelivery.status.replace('_', ' ')}</Badge>
            </div>
            {activeDelivery.order_reference && <CardDescription>Order: {activeDelivery.order_reference}</CardDescription>}
            {activeDelivery.estimated_tariff && <CardDescription>Tariff: D{Number(activeDelivery.estimated_tariff).toLocaleString()}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            <OrderStatusTimeline status={activeDelivery.status} fulfillmentType="delivery" className="py-1" />
            <DeliveryMap
              pickupLat={activeDelivery.pickup_latitude} pickupLng={activeDelivery.pickup_longitude}
              dropoffLat={activeDelivery.dropoff_latitude} dropoffLng={activeDelivery.dropoff_longitude}
              currentLat={currentPosition?.latitude} currentLng={currentPosition?.longitude}
              waypoints={positions.map(p => ({ latitude: p.latitude, longitude: p.longitude, recorded_at: new Date(p.timestamp).toISOString() }))}
              className="h-48 w-full rounded-lg"
            />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-3 w-3 rounded-full bg-accent" />
                <div><p className="font-medium">Pickup</p><p className="text-muted-foreground">{activeDelivery.pickup_address}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 h-3 w-3 rounded-full bg-destructive" />
                <div><p className="font-medium">Drop-off</p><p className="text-muted-foreground">{activeDelivery.dropoff_address}</p></div>
              </div>
            </div>
            {tracking && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1 text-primary"><Navigation className="h-4 w-4 animate-pulse" />GPS Active</div>
                <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-4 w-4" />{calculateDistance()} km</div>
                <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-4 w-4" />{positions.length} points</div>
              </div>
            )}
            <Button onClick={handleEndDelivery} variant="destructive" className="w-full" size="lg">
              <Square className="h-4 w-4 mr-2" />End Delivery
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delivery Queue */}
      {pendingQueue.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Delivery Queue ({pendingQueue.length})</h2>
          <div className="space-y-3">
            {pendingQueue.map(d => (
              <Card key={d.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{d.order_reference || d.id.slice(0, 8)}</span>
                    <Badge className={statusColor(d.status)}>{d.status}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>📍 {d.pickup_address}</p>
                    <p>🏁 {d.dropoff_address}</p>
                    {d.estimated_tariff && <p>💰 D{Number(d.estimated_tariff).toLocaleString()}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {d.status === 'dispatched' && (
                      <>
                        <Button onClick={() => handleAcceptDelivery(d)} className="flex-1" size="sm" variant="default">
                          <CheckCircle2 className="h-4 w-4 mr-2" />Accept
                        </Button>
                        <Button onClick={() => handleDeclineDelivery(d)} className="flex-1" size="sm" variant="destructive">
                          <Square className="h-4 w-4 mr-2" />Decline
                        </Button>
                      </>
                    )}
                    {d.status === 'accepted' && !activeDelivery && (
                      <Button onClick={() => handleStartDelivery(d)} className="flex-1" size="sm">
                        <Play className="h-4 w-4 mr-2" />Start Delivery
                      </Button>
                    )}
                    {d.status === 'accepted' && !activeDelivery && (
                      <Button onClick={() => handleMarkCompleted(d)} variant="outline" className="flex-1" size="sm">
                        <CheckCircle2 className="h-4 w-4 mr-2" />Mark Completed
                      </Button>
                    )}
                    {(d.status === 'dispatched' || d.status === 'accepted') && (
                      <Button onClick={() => handleCancelAcceptance(d)} variant="outline" size="sm" className="flex-1">
                        <Square className="h-4 w-4 mr-2" />Cancel acceptance
                      </Button>
                    )}
                  </div>

                  {d.status === 'accepted' && (
                    <div className="mt-2">
                      <PaymentMethodSelect
                        deliveryId={d.id}
                        currentMethod={d.payment_method}
                        currentBankName={d.payment_bank_name}
                        onSaved={(method, bank) => setDeliveries(prev => prev.map(x => x.id === d.id ? { ...x, payment_method: method, payment_bank_name: bank || null } : x))}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedList.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Recent Completed</h2>
          <div className="space-y-3">
            {completedList.map(d => (
              <Card key={d.id} className="opacity-75">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{d.order_reference || d.id.slice(0, 8)}</span>
                    <Badge className={statusColor(d.status)}>delivered</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>📍 {d.pickup_address} → 🏁 {d.dropoff_address}</p>
                    {d.actual_distance_km && <p>📏 {d.actual_distance_km} km</p>}
                    {d.estimated_tariff && <p>💰 D{Number(d.estimated_tariff).toLocaleString()}</p>}
                  </div>
                  {!d.receipt_attached && user && (
                    <div className="mt-3">
                      <ReceiptUpload
                        deliveryId={d.id}
                        orderReference={d.order_reference}
                        userId={user.id}
                        onUploaded={() => setDeliveries(prev => prev.map(x => x.id === d.id ? { ...x, receipt_attached: true } : x))}
                      />
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {d.receipt_attached && (
                      <span className="text-xs text-accent flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Receipt attached
                      </span>
                    )}
                    <PaymentMethodSelect
                      deliveryId={d.id}
                      currentMethod={d.payment_method}
                      currentBankName={d.payment_bank_name}
                      onSaved={(method, bank) => setDeliveries(prev => prev.map(x => x.id === d.id ? { ...x, payment_method: method, payment_bank_name: bank || null } : x))}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      </div>
      {/* END LEFT COLUMN */}

      {/* RIGHT COLUMN: Unattended / Rejected deliveries */}
      <div className="space-y-6 lg:col-start-2">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Unattended / Rejected</h2>

      {/* Delivery Offers — declined by another rider, broadcast to you */}
      {offered.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Delivery Offers ({offered.length})</h2>
          <div className="space-y-3">
            {offered.map(d => {
              const distKm = d.estimated_distance_km ?? haversineKm(d.pickup_latitude, d.pickup_longitude, d.dropoff_latitude, d.dropoff_longitude);
              const rs = d.merchant_id ? revShares[d.merchant_id] : undefined;
              const tariff = Number(d.estimated_tariff || 0);
              const riderShare = rs ? Math.round(tariff * Number(rs.rider_percentage) / 100) : null;
              return (
                <Card key={d.id} className="border-primary/40 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(d)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{d.order_reference || d.id.slice(0, 8)}</p>
                        {d.merchants?.name && <p className="text-xs text-muted-foreground">{d.merchants.name}</p>}
                      </div>
                      <Badge className="bg-primary/10 text-primary">offer</Badge>
                    </div>
                    <div className="text-sm space-y-1.5">
                      <div className="flex items-start gap-2">
                        <div className="mt-1 h-2 w-2 rounded-full bg-accent shrink-0" />
                        <div><p className="text-xs text-muted-foreground">Pickup</p><p>{d.pickup_address}</p></div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="mt-1 h-2 w-2 rounded-full bg-destructive shrink-0" />
                        <div><p className="text-xs text-muted-foreground">Drop-off</p><p>{d.dropoff_address}</p></div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded-md bg-muted">📏 {distKm != null ? `${distKm} km` : '—'}</span>
                      {tariff > 0 && <span className="px-2 py-1 rounded-md bg-muted">💰 D{tariff.toLocaleString()}</span>}
                      {riderShare != null && (
                        <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">
                          ≈ D{riderShare.toLocaleString()} ({Number(rs!.rider_percentage)}%)
                        </span>
                      )}
                    </div>
                    {rs && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground border-t pt-2">
                        <span>Rider</span><span className="text-right">{Number(rs.rider_percentage)}%</span>
                        <span>Merchant</span><span className="text-right">{Number(rs.merchant_percentage)}%</span>
                        <span>UCS Rides</span><span className="text-right">{Number(rs.ucs_rides_percentage)}%</span>
                        <span>Platform</span><span className="text-right">{Number(rs.platform_percentage)}%</span>
                      </div>
                    )}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button onClick={() => handleClaimDelivery(d)} className="flex-1" size="sm">
                        <CheckCircle2 className="h-4 w-4 mr-2" />Accept
                      </Button>
                      <Button onClick={() => handleRejectOffer(d)} variant="destructive" className="flex-1" size="sm">
                        <Square className="h-4 w-4 mr-2" />Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {offered.length === 0 && (
        <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg">
          <p className="text-sm">No offered deliveries right now. Visit Deliveries to claim from the unattended pool.</p>
        </div>
      )}
      </div>
      {/* END RIGHT COLUMN */}
      </div>
      {/* END GRID */}
      {deliveries.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No deliveries yet</p>
        </div>
      )}

      {/* Delivery detail dialog (offers + available) */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.order_reference || detail?.id?.slice(0, 8)}</DialogTitle>
            {detail?.merchants?.name && <DialogDescription>{detail.merchants.name}</DialogDescription>}
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <DeliveryMap
                pickupLat={detail.pickup_latitude} pickupLng={detail.pickup_longitude}
                dropoffLat={detail.dropoff_latitude} dropoffLng={detail.dropoff_longitude}
                className="h-56 w-full rounded-lg"
              />
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Pickup</p>
                  <p>{detail.pickup_address}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Drop-off</p>
                  <p>{detail.dropoff_address}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p>{(detail.estimated_distance_km ?? haversineKm(detail.pickup_latitude, detail.pickup_longitude, detail.dropoff_latitude, detail.dropoff_longitude)) ?? '—'} km</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tariff</p>
                  <p>D{Number(detail.estimated_tariff || 0).toLocaleString()}</p>
                </div>
              </div>

              {(() => {
                const rs = detail.merchant_id ? revShares[detail.merchant_id] : undefined;
                if (!rs) return null;
                const tariff = Number(detail.estimated_tariff || 0);
                const riderShare = Math.round(tariff * Number(rs.rider_percentage) / 100);
                return (
                  <div className="border-t pt-3 text-sm">
                    <p className="font-medium mb-2">Your estimated payout: <span className="text-primary">D{riderShare.toLocaleString()}</span> ({Number(rs.rider_percentage)}%)</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Rider</span><span className="text-right">{Number(rs.rider_percentage)}%</span>
                      <span>Merchant</span><span className="text-right">{Number(rs.merchant_percentage)}%</span>
                      <span>UCS Rides</span><span className="text-right">{Number(rs.ucs_rides_percentage)}%</span>
                      <span>Platform</span><span className="text-right">{Number(rs.platform_percentage)}%</span>
                    </div>
                  </div>
                );
              })()}

              <div className="border-t pt-3">
                <p className="font-medium text-sm mb-2">Rejection history ({detailRejections.length})</p>
                {detailRejections.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No rejections recorded (or hidden by access rules).</p>
                ) : (
                  <ul className="space-y-2 text-xs max-h-48 overflow-auto">
                    {detailRejections.map((r, i) => (
                      <li key={i} className="border-b pb-2 last:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{r.rider_name}</span>
                          <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                        </div>
                        {r.rider_phone && (
                          <a href={`tel:${r.rider_phone}`} className="text-muted-foreground hover:underline">{r.rider_phone}</a>
                        )}
                        <p className="mt-1 text-muted-foreground italic">{r.reason || 'No reason given'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={() => handleClaimDelivery(detail)} className="flex-1">
                  <CheckCircle2 className="h-4 w-4 mr-2" />Accept
                </Button>
                <Button onClick={() => handleRejectOffer(detail)} variant="destructive" className="flex-1">
                  <Square className="h-4 w-4 mr-2" />Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog */}
      <Dialog open={!!pendingReject} onOpenChange={(o) => { if (!o) { setPendingReject(null); setRejectReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pendingReject?.kind === 'decline' ? 'Decline delivery' : 'Reject offer'}</DialogTitle>
            <DialogDescription>
              Optionally tell other riders why you're rejecting this delivery. This will be visible on the Rejected Deliveries page.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. too far, vehicle issue, address unclear…"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPendingReject(null); setRejectReason(''); }}>Cancel</Button>
            <Button variant="destructive" disabled={submittingReject} onClick={confirmReject}>
              {submittingReject ? 'Rejecting…' : 'Confirm reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {riderId && pendingStart && (
        <OdometerCaptureDialog
          open={!!pendingStart}
          onOpenChange={(o) => !o && setPendingStart(null)}
          title="Start odometer reading"
          description="Enter your current mileage and snap a photo of the odometer before starting this delivery."
          riderId={riderId}
          deliveryId={pendingStart.id}
          phase="start"
          onConfirmed={confirmStartOdometer}
        />
      )}
      {riderId && pendingEnd && (
        <OdometerCaptureDialog
          open={!!pendingEnd}
          onOpenChange={(o) => !o && setPendingEnd(null)}
          title="End odometer reading"
          description="Enter your current mileage and snap a photo of the odometer to complete this delivery."
          riderId={riderId}
          deliveryId={pendingEnd.id}
          phase="end"
          minMiles={pendingEnd.start_odometer_miles ?? null}
          onConfirmed={confirmEndOdometer}
        />
      )}
    </div>
  );
}
