import { useState, useEffect, useRef, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchDeliveriesPage, fetchUnassignedPage } from '@/lib/queries/deliveries';
import type { DeliveryRow } from '@/lib/queries/deliveries';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import DeliveryMap from '@/components/DeliveryMap';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Eye, Flag, Search, Package, CreditCard, CheckCircle2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export const DELIVERIES_PAGE_SIZE = 20;
// NOTE: the local 0-based paginateDeliveries helper was removed in favor of
// server pagination (fetchDeliveriesPage/fetchUnassignedPage, "show more"
// appends the next page). Client search still filters the loaded pages only —
// TODO(data-layer): push search to the server query.

export default function DeliveriesPage() {
  const { user, hasRole } = useAuth();
  const isRider = hasRole('rider');
  const [riderId, setRiderId] = useState<string | null>(null);
  const riderIdRef = useRef<string | null>(null);
  useEffect(() => { riderIdRef.current = riderId; }, [riderId]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  // Shared realtime data layer: one channel per list, debounced patch-in-place
  // (INSERT→prepend, UPDATE→map, DELETE→filter). No full reload on row events.
  const { rows: deliveries, setRows: setDeliveries } = useRealtimeTable<DeliveryRow>({
    channelName: 'deliveries-realtime',
    table: 'deliveries',
    debounceMs: 150,
    shouldKeep: (row) => filter === 'all' || row.status === filter,
  });
  const { rows: unattended, setRows: setUnattended } = useRealtimeTable<DeliveryRow>({
    channelName: 'deliveries-unassigned-realtime',
    table: 'deliveries',
    debounceMs: 150,
    shouldKeep: (row) => (row.status === 'unassigned' || row.status === 'pending') && !row.rider_id,
  });
  const [selected, setSelected] = useState<any | null>(null);
  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectionCounts, setRejectionCounts] = useState<Record<string, number>>({});
  const [selectedRejections, setSelectedRejections] = useState<Array<{ rider_name: string; created_at: string }>>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [hasMoreUnassigned, setHasMoreUnassigned] = useState(true);

  const loadUnattended = async (rId?: string | null, targetPage = 1) => {
    const effectiveRid = rId !== undefined ? rId : riderIdRef.current;
    let rejectedIds: string[] = [];
    if (isRider && effectiveRid) {
      const { data: rejs } = await supabase
        .from('delivery_rejections')
        .select('delivery_id')
        .eq('rider_id', effectiveRid);
      rejectedIds = ((rejs as Array<{ delivery_id: string }>) || []).map(r => r.delivery_id);
    }
    const rows = await fetchUnassignedPage({ page: targetPage, pageSize: DELIVERIES_PAGE_SIZE, excludeIds: rejectedIds });
    if (targetPage === 1) setUnassignedPage(1);
    setUnattended(prev => (targetPage === 1 ? rows : [...prev, ...rows.filter(r => !prev.some(p => p.id === r.id))]));
    setHasMoreUnassigned(rows.length === DELIVERIES_PAGE_SIZE);
  };

  const showMore = async () => {
    const next = page + 1;
    const rows = await fetchDeliveriesPage({ status: filter, page: next, pageSize: DELIVERIES_PAGE_SIZE });
    setDeliveries(prev => [...prev, ...rows.filter(r => !prev.some(p => p.id === r.id))]);
    setPage(next);
    setHasMore(rows.length === DELIVERIES_PAGE_SIZE);
  };

  const showMoreUnassigned = () => {
    const next = unassignedPage + 1;
    setUnassignedPage(next);
    loadUnattended(undefined, next);
  };

  const handleClaim = async (delivery: any) => {
    if (!riderId) {
      toast.error('Your rider account could not be found.');
      return;
    }
    const { data, error } = await supabase.rpc('claim_delivery', { _delivery_id: delivery.id });
    if (error) {
      toast.error(`Could not claim: ${error.message || 'unknown error'}`);
      loadUnattended();
      return;
    }
    if (!data) {
      toast.info('Another rider grabbed this delivery first.');
      loadUnattended();
      return;
    }
    toast.success('Delivery claimed!');
    setUnattended(prev => prev.filter(d => d.id !== delivery.id));
  };

  const loadRejectionCounts = async () => {
    const { data } = await supabase.from('delivery_rejections').select('delivery_id');
    const counts: Record<string, number> = {};
    (data || []).forEach((r: any) => { counts[r.delivery_id] = (counts[r.delivery_id] || 0) + 1; });
    setRejectionCounts(counts);
  };

  useEffect(() => {
    if (!isRider || !user) return;
    supabase.from('riders').select('id').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data?.id) {
        setRiderId(data.id);
        loadUnattended(data.id);
      }
    });
  }, [isRider, user]);

  useEffect(() => {
    // Server-paginated load (page 1); "show more" appends via showMore().
    // Row-level realtime patches land through useRealtimeTable — no reload fan-out here.
    setPage(1);
    setHasMore(true);
    setLoading(true);
    let cancelled = false;
    const load = async () => {
      const rows = await fetchDeliveriesPage({ status: filter, page: 1, pageSize: DELIVERIES_PAGE_SIZE });
      if (cancelled) return;
      setDeliveries(rows);
      setHasMore(rows.length === DELIVERIES_PAGE_SIZE);
      setLoading(false);
    };
    load();
    loadRejectionCounts();
    setUnassignedPage(1);
    loadUnattended();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Rejection metadata (counts + rider exclusions) still needs a reload fan-out;
  // delivery rows themselves patch in place via useRealtimeTable above.
  // TODO(data-layer): fold rejection counts into a query helper with its own channel.
  useEffect(() => {
    const channel = supabase
      .channel('deliveries-rejections')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_rejections' }, () => {
        loadRejectionCounts();
        setUnassignedPage(1);
        loadUnattended();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewDelivery = async (delivery: any) => {
    setSelected(delivery);
    setSelectedRejections([]);
    const { data } = await supabase.from('delivery_waypoints')
      .select('*').eq('delivery_id', delivery.id).order('recorded_at', { ascending: true });
    setWaypoints(data || []);

    const { data: rejs } = await supabase
      .from('delivery_rejections')
      .select('created_at, rider_id')
      .eq('delivery_id', delivery.id)
      .order('created_at', { ascending: false });
    const rows = (rejs as any[]) || [];
    if (rows.length === 0) return;
    const riderIds = Array.from(new Set(rows.map(r => r.rider_id)));
    const { data: ridersData } = await supabase.from('riders').select('id, user_id, rider_code').in('id', riderIds);
    const userIds = (ridersData || []).map((r: any) => r.user_id);
    const { data: profs } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
    const nameByUser: Record<string, string> = {};
    (profs || []).forEach((p: any) => { nameByUser[p.user_id] = p.full_name; });
    const nameByRider: Record<string, string> = {};
    (ridersData || []).forEach((r: any) => { nameByRider[r.id] = nameByUser[r.user_id] || r.rider_code || 'Rider'; });
    setSelectedRejections(rows.map(r => ({ rider_name: nameByRider[r.rider_id] || 'Rider', created_at: r.created_at })));
  };

  const flagDelivery = async (id: string) => {
    await supabase.from('deliveries').update({ is_flagged: true, flag_reason: 'Manually flagged by admin' }).eq('id', id);
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, is_flagged: true } : d));
  };

  const deleteDelivery = async (id: string) => {
    const { error } = await supabase.rpc('delete_delivery_cascade' as any, { _id: id });
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    toast.success('Delivery deleted');
    setDeliveries(prev => prev.filter(d => d.id !== id));
    setUnattended(prev => prev.filter(d => d.id !== id));
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-muted text-muted-foreground',
      unassigned: 'bg-warning/15 text-warning-foreground border-warning/30',
      dispatched: 'bg-info/10 text-info border-info/20',
      in_transit: 'bg-primary/10 text-primary border-primary/20',
      delivered: 'bg-accent/10 text-accent border-accent/20',
      cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
    };
    return map[s] || 'bg-muted text-muted-foreground';
  };

  const filtered = deliveries.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (d.order_reference?.toLowerCase().includes(q) ||
      d.pickup_address?.toLowerCase().includes(q) ||
      d.dropoff_address?.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q));
  });

  if (loading) return (
    <div role="status" aria-label="Loading deliveries" className="space-y-3 py-6">
      <Skeleton className="shimmer h-16 w-full rounded-lg" />
      <Skeleton className="shimmer h-16 w-full rounded-lg" />
      <Skeleton className="shimmer h-16 w-full rounded-lg" />
      <span className="sr-only">Loading deliveries…</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Deliveries</h1>
          <p className="text-muted-foreground">Monitor all deliveries with route playback</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Label htmlFor="deliveries-search" className="sr-only">Search deliveries</Label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input id="deliveries-search" placeholder="Search deliveries..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
          </div>
          <div>
            <Label htmlFor="deliveries-status" className="sr-only">Filter by status</Label>
            <Select value={filter} onValueChange={v => setFilter(v)}>
              <SelectTrigger id="deliveries-status" className="w-36 h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        </div>
      </div>

      {(() => {
        const unattendedList = unattended;
        const otherList = filtered.filter(d => !((d.status === 'unassigned' || d.status === 'pending') && !d.rider_id));
        return (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
            {/* Unassigned / Rejected column */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-amber-800 dark:text-amber-200" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Unassigned / Rejected ({unattendedList.length})</h2>
              </div>
              {unattendedList.length === 0 && (
                <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg text-xs">
                  All deliveries currently assigned.
                </div>
              )}
              {unattendedList.map(d => {
                const rejCount = rejectionCounts[d.id] || 0;
                const label = `View delivery ${d.order_reference || d.id.slice(0, 8)}`;
                return (
                  <Card key={d.id} className="border-warning/30 bg-warning/5 hover:shadow-md transition-shadow">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">{d.order_reference || d.id.slice(0, 8)}</p>
                        <Badge className={statusColor(d.status)}>{d.status.replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{d.pickup_address}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{d.dropoff_address}</p>
                      <div className="flex items-center justify-between text-xs">
                        {d.estimated_tariff && <span className="font-medium tabular-nums">D{Number(d.estimated_tariff).toFixed(2)}</span>}
                        {rejCount > 0 && (
                          <Badge variant="outline" className="text-destructive border-destructive/30">
                            Rejected by {rejCount} rider{rejCount === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </div>
                      <Button variant="outline" size="sm" className="w-full" aria-label={label} onClick={() => viewDelivery(d)}>
                        <Eye className="h-4 w-4 mr-1.5" aria-hidden="true" />View delivery
                      </Button>
                      {isRider && (
                        <Button onClick={() => handleClaim(d)} size="sm" className="w-full min-h-[44px]">
                          <CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden="true" />Claim delivery
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {hasMoreUnassigned && (
                <Button variant="outline" size="sm" className="w-full" onClick={showMoreUnassigned}>
                  Show more unassigned
                </Button>
              )}
            </div>

            {/* Main list column */}
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground tabular-nums" role="status">{otherList.length} deliveries</div>
        {otherList.map(d => (
          <Card key={d.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-lg shrink-0 ${d.status === 'delivered' ? 'bg-accent/10' : 'bg-primary/10'}`}>
                  <MapPin className={`h-4 w-4 ${d.status === 'delivered' ? 'text-accent' : 'text-primary'}`} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{d.order_reference || d.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.pickup_address} → {d.dropoff_address}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {d.actual_distance_km && <span className="text-xs text-muted-foreground tabular-nums">{d.actual_distance_km} km</span>}
                    {d.estimated_tariff && <span className="text-xs font-medium tabular-nums">D{Number(d.estimated_tariff).toFixed(2)}</span>}
                    <span className="text-xs text-muted-foreground"><time dateTime={d.created_at}>{format(new Date(d.created_at), 'MMM d, HH:mm')}</time></span>
                    {d.payment_method && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <CreditCard className="h-3 w-3" aria-hidden="true" />
                        {d.payment_method === 'bank_transfer' && d.payment_bank_name
                          ? `Bank (${d.payment_bank_name})`
                          : ({ cash: 'Cash', wave: 'Wave', qmoney: 'QMoney', afrimoney: 'Afrimoney', aps_wallet: 'APS Wallet', bank_transfer: 'Bank Transfer' } as Record<string, string>)[d.payment_method] || d.payment_method}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.is_flagged && <Badge variant="destructive" className="gap-1"><Flag className="h-3 w-3" aria-hidden="true" />Flagged</Badge>}
                {d.route_deviation_detected && <Badge className="bg-warning/15 text-warning-foreground border-warning/30">Deviation</Badge>}
                <Badge className={statusColor(d.status)}>{d.status.replace('_', ' ')}</Badge>
                <Button variant="ghost" size="icon" aria-label={`View delivery ${d.order_reference || d.id.slice(0, 8)}`} onClick={() => viewDelivery(d)}><Eye className="h-4 w-4" aria-hidden="true" /></Button>
                {!d.is_flagged && <Button variant="ghost" size="icon" aria-label={`Flag delivery ${d.order_reference || d.id.slice(0, 8)}`} onClick={() => flagDelivery(d.id)}><Flag className="h-4 w-4" aria-hidden="true" /></Button>}
                {hasRole('admin') && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Delete delivery ${d.order_reference || d.id.slice(0, 8)}`} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete delivery {d.order_reference || d.id.slice(0,8)}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the delivery and all related waypoints, receipts, alerts, rejections, settlement records, and reconciliation entries. Wallet transactions remain but will no longer link to this delivery. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteDelivery(d.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
              {hasMore && (
                <Button variant="outline" className="w-full" onClick={showMore}>
                  Show more
                </Button>
              )}
              {otherList.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No deliveries found</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delivery: {selected?.order_reference || selected?.id?.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <Suspense fallback={<Skeleton className="shimmer h-72 w-full rounded-lg" />}>
                <DeliveryMap
                  waypoints={waypoints}
                  pickupLat={selected.pickup_latitude} pickupLng={selected.pickup_longitude}
                  dropoffLat={selected.dropoff_latitude} dropoffLng={selected.dropoff_longitude}
                  className="h-72 w-full rounded-lg"
                />
              </Suspense>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge className={statusColor(selected.status)}>{selected.status.replace('_', ' ')}</Badge></div>
                <div><span className="text-muted-foreground">GPS Confirmed:</span> {selected.gps_confirmed ? 'Yes' : 'No'}</div>
                <div><span className="text-muted-foreground">Est. Distance:</span> {selected.estimated_distance_km ?? '–'} km</div>
                <div><span className="text-muted-foreground">Actual Distance:</span> {selected.actual_distance_km ?? '–'} km</div>
                <div><span className="text-muted-foreground">Est. Tariff:</span> D{selected.estimated_tariff ?? '–'}</div>
                <div><span className="text-muted-foreground">Actual Tariff:</span> D{selected.actual_tariff ?? '–'}</div>
                <div><span className="text-muted-foreground">Dispatched:</span> {selected.dispatched_at ? format(new Date(selected.dispatched_at), 'MMM d, yyyy HH:mm') : '–'}</div>
                <div><span className="text-muted-foreground">Picked Up:</span> {selected.picked_up_at ? format(new Date(selected.picked_up_at), 'MMM d, yyyy HH:mm') : '–'}</div>
                <div><span className="text-muted-foreground">Delivered:</span> {selected.delivered_at ? format(new Date(selected.delivered_at), 'MMM d, yyyy HH:mm') : '–'}</div>
                <div><span className="text-muted-foreground">Customer:</span> {selected.customer_name || '–'}</div>
                <div><span className="text-muted-foreground">Customer Phone:</span> {selected.customer_phone || '–'}</div>
                <div><span className="text-muted-foreground">Waypoints:</span> {waypoints.length} points</div>
                <div><span className="text-muted-foreground">Payment:</span> {
                  selected.payment_method
                    ? (selected.payment_method === 'bank_transfer' && selected.payment_bank_name
                        ? `Bank Transfer (${selected.payment_bank_name})`
                        : { cash: 'Cash', wave: 'Wave', qmoney: 'QMoney', afrimoney: 'Afrimoney', aps_wallet: 'APS Wallet', bank_transfer: 'Bank Transfer' }[selected.payment_method] || selected.payment_method)
                    : '–'
                }</div>
              </div>
              <div className="border-t pt-3">
                <p className="font-medium text-sm mb-2">Rejection history ({selectedRejections.length})</p>
                {selectedRejections.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No rejections recorded.</p>
                ) : (
                  <ul className="space-y-1 text-xs max-h-40 overflow-auto">
                    {selectedRejections.map((r, i) => (
                      <li key={i} className="flex items-center justify-between border-b pb-1 last:border-0">
                        <span>{r.rider_name}</span>
                        <span className="text-muted-foreground">{format(new Date(r.created_at), 'MMM d, HH:mm')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
