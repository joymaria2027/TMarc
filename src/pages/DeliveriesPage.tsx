import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchDeliveriesPage, fetchMerchantIdsByName, fetchUnassignedPage } from '@/lib/queries/deliveries';
import type { DeliveryRow } from '@/lib/queries/deliveries';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  describeDeliveryAndRiderResultCount,
  normalizeDeliverySearchQuery,
  rowMatchesDeliveryAndRiderSearch,
} from '@/lib/deliverySearch';
import { normalizeRiderSearchQuery } from '@/lib/deliveryRiderSearch';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import DeliveryMap from '@/components/DeliveryMap';
import DeliveriesTable from '@/components/deliveries/DeliveriesTable';
import {
  deliveryStatusMeta,
  flagPayload,
  isUnassignedRow,
  parseHighlightId,
} from '@/lib/deliveries';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Flag, Search } from 'lucide-react';
import { guardedWrite } from '@/lib/guardedWrite';
import { formatMoney } from '@/lib/finance';
import { format } from 'date-fns';

export const DELIVERIES_PAGE_SIZE = 20;
// Server search: debounced free text becomes a PostgREST `ilike` filter over
// order_reference/pickup_address/dropoff_address (+ merchant name via a
// merchants.id lookup) inside fetchDeliveriesPage. Rider search (name/email/
// license_plate via profiles+riders join) is applied additively. Filter/search
// changes refetch page 1 from the server; realtime row events patch within the
// loaded results when they match the status + both search terms (payloads carry
// no merchant join, so merchant-name matches arrive via the debounced refetch).
// The unassigned pool keeps today's behavior (search scopes the main queue only).

export default function DeliveriesPage() {
  const { user, hasRole } = useAuth();
  const isRider = hasRole('rider');
  const [searchParams] = useSearchParams();
  const highlightId = parseHighlightId(searchParams.get('highlight'));
  const [riderId, setRiderId] = useState<string | null>(null);
  const riderIdRef = useRef<string | null>(null);
  useEffect(() => { riderIdRef.current = riderId; }, [riderId]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [riderSearch, setRiderSearch] = useState('');
  // Debounced server search (existing useDebouncedValue pattern): the load
  // effect refetches page 1 when this settles; realtime patches gate on it.
  const debouncedSearch = useDebouncedValue(search, 400);
  const debouncedRiderSearch = useDebouncedValue(riderSearch, 400);
  const activeSearch = normalizeDeliverySearchQuery(debouncedSearch);
  const activeRiderSearch = normalizeRiderSearchQuery(debouncedRiderSearch);
  const [searchMerchantIds, setSearchMerchantIds] = useState<string[]>([]);
  // Shared realtime data layer: one channel per list, debounced patch-in-place
  // (INSERT→prepend, UPDATE→map, DELETE→filter). No full reload on row events.
  // Callbacks ride in refs (see useRealtimeTable), so the search gate below
  // always sees the latest filter/search without resubscribing.
  const { rows: deliveries, setRows: setDeliveries } = useRealtimeTable<DeliveryRow>({
    channelName: 'deliveries-realtime',
    table: 'deliveries',
    debounceMs: 150,
    shouldKeep: (row) =>
      (filter === 'all' || row.status === filter) &&
      rowMatchesDeliveryAndRiderSearch(row, activeSearch, activeRiderSearch),
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
  const highlightOpenedRef = useRef<string | null>(null);

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
    const rows = await fetchDeliveriesPage({
      status: filter,
      page: next,
      pageSize: DELIVERIES_PAGE_SIZE,
      search: activeSearch,
      merchantIds: searchMerchantIds,
      riderSearch: activeRiderSearch,
    });
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
    // Search/filter changes reset to page 1; empty query skips the `.or()`
    // clause so the unfiltered query is exactly today's.
    setPage(1);
    setHasMore(true);
    setLoading(true);
    let cancelled = false;
    const load = async () => {
      const q = normalizeDeliverySearchQuery(debouncedSearch);
      const rq = normalizeRiderSearchQuery(debouncedRiderSearch);
      const merchantIds = q ? await fetchMerchantIdsByName({ name: q }) : [];
      if (cancelled) return;
      setSearchMerchantIds(merchantIds);
      const rows = await fetchDeliveriesPage({
        status: filter,
        page: 1,
        pageSize: DELIVERIES_PAGE_SIZE,
        search: q,
        merchantIds,
        riderSearch: rq,
      });
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
  }, [filter, debouncedSearch, debouncedRiderSearch]);

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

  // Deep-link contract: /deliveries?highlight=<id> auto-opens the matching row's
  // detail dialog once it is loaded (the table highlights + scrolls it).
  // Unknown ids are ignored silently.
  useEffect(() => {
    if (!highlightId || loading) return;
    if (highlightOpenedRef.current === highlightId) return;
    const match = [...unattended, ...deliveries].find(d => d.id === highlightId);
    if (!match) return;
    highlightOpenedRef.current = highlightId;
    void viewDelivery(match);
  }, [highlightId, loading, unattended, deliveries]);

  const flagDelivery = async (id: string) => {
    const { error } = await guardedWrite(
      supabase.from('deliveries').update(flagPayload(true)).eq('id', id),
      { context: 'Flag failed' },
    );
    if (error) return;
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, is_flagged: true } : d));
    setUnattended(prev => prev.map(d => d.id === id ? { ...d, is_flagged: true } : d));
  };

  const unflagDelivery = async (id: string) => {
    const { error } = await supabase.from('deliveries').update(flagPayload(false)).eq('id', id);
    if (error) { toast.error(`Unflag failed: ${error.message}`); return; }
    toast.success('Delivery unflagged');
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, is_flagged: false, flag_reason: null } : d));
    setUnattended(prev => prev.map(d => d.id === id ? { ...d, is_flagged: false, flag_reason: null } : d));
  };

  const deleteDelivery = async (id: string) => {
    const { error } = await supabase.rpc('delete_delivery_cascade' as any, { _id: id });
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    toast.success('Delivery deleted');
    setDeliveries(prev => prev.filter(d => d.id !== id));
    setUnattended(prev => prev.filter(d => d.id !== id));
  };

  // Server-filtered rows (search applied in fetchDeliveriesPage); only the
  // unassigned-pool partition stays client-side.
  const otherList = deliveries.filter(d => !isUnassignedRow(d));

  if (loading) return (
    <div role="status" aria-label="Loading deliveries" className="space-y-3 py-6">
      <Skeleton className="shimmer h-16 w-full rounded-lg" />
      <Skeleton className="shimmer h-16 w-full rounded-lg" />
      <Skeleton className="shimmer h-16 w-full rounded-lg" />
      <span className="sr-only">Loading deliveries…</span>
    </div>
  );

  const unattendedList = unattended;
  const selectedMeta = selected ? deliveryStatusMeta(selected.status) : null;
  const SelectedStatusIcon = selectedMeta?.icon;

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
            <Input id="deliveries-search" type="search" placeholder="Search deliveries..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56 h-11" />
          </div>
          <div className="relative">
            <Label htmlFor="deliveries-rider-search" className="sr-only">Search by rider</Label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="deliveries-rider-search"
              type="search"
              placeholder="Search rider (name, email, plate)..."
              value={riderSearch}
              onChange={e => setRiderSearch(e.target.value)}
              className="pl-9 w-56 h-11"
            />
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

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-amber-800 dark:text-amber-200" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Unassigned / Rejected ({unattendedList.length})</h2>
        </div>
        <div className="text-sm text-muted-foreground tabular-nums" role="status">{describeDeliveryAndRiderResultCount(otherList.length, activeSearch, activeRiderSearch)}</div>
        {(activeSearch || activeRiderSearch) && otherList.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            No deliveries match “{activeSearch || activeRiderSearch}”.
          </p>
        )}
        {/* Scrollable region owns the queue's accessible name; rows render in DeliveriesTable. */}
        <div className="overflow-x-auto" role="region" aria-label="View delivery queue" tabIndex={0}>
          <DeliveriesTable
            unassignedRows={unattendedList}
            mainRows={otherList}
            highlightId={highlightId}
            isRider={isRider}
            canDelete={hasRole('admin')}
            rejectionCounts={rejectionCounts}
            hasMore={hasMore}
            hasMoreUnassigned={hasMoreUnassigned}
            onView={viewDelivery}
            onFlag={flagDelivery}
            onUnflag={unflagDelivery}
            onDelete={deleteDelivery}
            onClaim={handleClaim}
            onShowMore={showMore}
            onShowMoreUnassigned={showMoreUnassigned}
          />
        </div>
      </div>

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
                <div><span className="text-muted-foreground">Status:</span> {selectedMeta && SelectedStatusIcon && (
                  <Badge className={`${selectedMeta.badgeClassName} gap-1`}>
                    <SelectedStatusIcon className="h-3 w-3" aria-hidden="true" />
                    {selectedMeta.label}
                  </Badge>
                )}</div>
                <div><span className="text-muted-foreground">GPS Confirmed:</span> {selected.gps_confirmed ? 'Yes' : 'No'}</div>
                <div><span className="text-muted-foreground">Est. Distance:</span> {selected.estimated_distance_km ?? '–'} km</div>
                <div><span className="text-muted-foreground">Actual Distance:</span> {selected.actual_distance_km ?? '–'} km</div>
                <div className="tabular-nums"><span className="text-muted-foreground">Est. Tariff:</span> {selected.estimated_tariff != null ? formatMoney(Number(selected.estimated_tariff)) : '–'}</div>
                <div className="tabular-nums"><span className="text-muted-foreground">Actual Tariff:</span> {selected.actual_tariff != null ? formatMoney(Number(selected.actual_tariff)) : '–'}</div>
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
