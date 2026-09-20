import { useEffect, useMemo, useState } from 'react';
import EmptyState from '@/components/EmptyState';
import { pageEmptyStates } from '@/lib/pageEmptyStates';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { paginate } from '@/lib/pagination';
import { formatMoney } from '@/lib/finance';
import {
  rpcClaimDelivery,
  rpcReclaimDelivery,
  rpcGetRiderRejectedDeliveries,
  rpcGetUnassignedDeliveriesForRider,
} from '@/lib/rpcTypes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CheckCircle2, MapPin, PackageX, Phone, User } from 'lucide-react';
import { markRiderOnlineByRiderId } from '@/lib/riderPresence';

interface Delivery {
  id: string;
  status: string;
  rider_id: string | null;
  merchant_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  customer_name: string;
  customer_phone: string;
  order_reference: string | null;
  estimated_tariff: number | null;
  created_at: string;
  merchants?: { name: string } | null;
}

interface RejectionInfo {
  rider_id: string;
  rider_name: string;
  rider_phone: string | null;
  reason: string | null;
  created_at: string;
  mine?: boolean;
}

interface HolderEvent {
  id: string;
  rider_id: string;
  from_rider_id: string | null;
  event_type: 'claimed' | 'reassigned_from' | 'released';
  created_at: string;
  rider_name?: string;
  from_rider_name?: string;
}

const LOCKED_STATUSES = ['accepted', 'picked_up', 'in_transit'];

export default function RejectedDeliveriesPage() {
  const { user, hasRole } = useAuth();
  const isRider = hasRole('rider');
  const [riderId, setRiderId] = useState<string | null>(null);
  const [rows, setRows] = useState<Delivery[]>([]);
  const [rejections, setRejections] = useState<Record<string, RejectionInfo[]>>({});
  const [riderShares, setRiderShares] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Delivery | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const REJECTED_PAGE_SIZE = 20;
  const [claiming, setClaiming] = useState<string | null>(null);
  const [holderHistory, setHolderHistory] = useState<HolderEvent[]>([]);

  const load = async (rId?: string | null) => {
    const effective = rId ?? riderId;
    // Surface every delivery that isn't actively being handled:
    //   1. unassigned/pending deliveries with no rider
    //   2. for riders: every delivery they personally rejected (via SECURITY DEFINER RPC,
    //      to bypass the rider RLS that hides deliveries re-dispatched to others).
    //   3. for non-riders: any delivery with rejection history that isn't delivered/cancelled.
    let rejectedDeliveries: any[] = [];
    if (isRider) {
      const { data } = await rpcGetRiderRejectedDeliveries();
      const rows = data ?? [];
      const restIds = Array.from(new Set(rows.map(r => r.merchant_id).filter(Boolean)));
      let restMap: Record<string, { name: string }> = {};
      if (restIds.length > 0) {
        const { data: rests } = await supabase.from('merchants').select('id, name').in('id', restIds);
        ((rests as any[]) || []).forEach(r => { restMap[r.id] = { name: r.name }; });
      }
      rejectedDeliveries = rows.map(r => ({ ...r, merchants: r.merchant_id ? restMap[r.merchant_id] || null : null }));
    } else {
      const { data: rejRows } = await supabase
        .from('delivery_rejections')
        .select('delivery_id')
        .order('created_at', { ascending: false });
      const rejectedIds = Array.from(new Set(((rejRows as any[]) || []).map(r => r.delivery_id)));
      if (rejectedIds.length > 0) {
        const { data } = await supabase
          .from('deliveries')
          .select('*, merchants(name)')
          .in('id', rejectedIds)
          .not('status', 'in', '(delivered,cancelled)')
          .order('created_at', { ascending: false });
        rejectedDeliveries = (data as any[]) || [];
      }
    }

    // Unassigned/pending listing: riders use the masked RPC (no customer PII pre-acceptance);
    // managers/admins/accountants use direct table access governed by their RLS policies.
    let unassignedRes: { data: any[] | null } = { data: [] };
    if (isRider) {
      const { data } = await rpcGetUnassignedDeliveriesForRider();
      const rows = (data ?? []).filter((d) => d.status === 'unassigned' || d.status === 'pending');
      const mIds = Array.from(new Set(rows.map((r: any) => r.merchant_id).filter(Boolean)));
      let mMap: Record<string, { name: string }> = {};
      if (mIds.length > 0) {
        const { data: ms } = await supabase.from('merchants').select('id, name').in('id', mIds as string[]);
        ((ms as any[]) || []).forEach(m => { mMap[m.id] = { name: m.name }; });
      }
      unassignedRes = { data: rows.map((r: any) => ({ ...r, merchants: r.merchant_id ? mMap[r.merchant_id] || null : null })) };
    } else {
      const r = await supabase
        .from('deliveries')
        .select('*, merchants(name)')
        .in('status', ['unassigned', 'pending'])
        .is('rider_id', null)
        .order('created_at', { ascending: false });
      unassignedRes = { data: (r.data as any[]) || [] };
    }

    const byId = new Map<string, Delivery>();
    [...((unassignedRes.data as any[]) || []), ...rejectedDeliveries].forEach((d: Delivery) => {
      if (!byId.has(d.id)) byId.set(d.id, d);
    });
    const list = Array.from(byId.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    setRows(list);

    // Load rejection details for visible deliveries
    const ids = list.map((d: Delivery) => d.id);
    if (ids.length === 0) { setRejections({}); setRiderShares({}); setLoading(false); return; }
    const { data: rejRows } = await supabase
      .from('delivery_rejections')
      .select('delivery_id, rider_id, reason, created_at')
      .in('delivery_id', ids)
      .order('created_at', { ascending: false });
    const rejList = (rejRows as any[]) || [];
    const riderIds = Array.from(new Set(rejList.map(r => r.rider_id)));
    let infoByRider: Record<string, { name: string; phone: string | null }> = {};
    if (riderIds.length > 0) {
      const { data: ridersData } = await supabase.from('riders').select('id, user_id, rider_code').in('id', riderIds);
      const userIds = ((ridersData as any[]) || []).map(r => r.user_id);
      const { data: profs } = await supabase.from('profiles').select('user_id, full_name, phone').in('user_id', userIds);
      const profByUser: Record<string, { full_name: string; phone: string | null }> = {};
      ((profs as any[]) || []).forEach(p => { profByUser[p.user_id] = { full_name: p.full_name, phone: p.phone }; });
      ((ridersData as any[]) || []).forEach(r => {
        const p = profByUser[r.user_id];
        infoByRider[r.id] = { name: p?.full_name || r.rider_code || 'Rider', phone: p?.phone || null };
      });
    }
    const grouped: Record<string, RejectionInfo[]> = {};
    rejList.forEach(r => {
      const info = infoByRider[r.rider_id];
      (grouped[r.delivery_id] ||= []).push({
        rider_id: r.rider_id,
        rider_name: info?.name || 'Rider',
        rider_phone: info?.phone || null,
        reason: r.reason || null,
        created_at: r.created_at,
        mine: !!effective && r.rider_id === effective,
      });
    });
    // Sort so the current rider's own rejection appears first
    Object.keys(grouped).forEach(k => {
      grouped[k].sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0));
    });
    setRejections(grouped);

    // Rider revenue share per merchant: prefer rider-specific rule, fall back to merchant default (rider_id IS NULL).
    if (isRider && effective) {
      const restIds = Array.from(new Set(list.map((d: Delivery) => d.merchant_id).filter(Boolean))) as string[];
      if (restIds.length > 0) {
        const { data: rs } = await supabase
          .from('revenue_sharing')
          .select('merchant_id, rider_percentage, rider_id, created_at')
          .in('merchant_id', restIds)
          .order('created_at', { ascending: false });
        const personal: Record<string, number> = {};
        const fallback: Record<string, number> = {};
        ((rs as any[]) || []).forEach(r => {
          if (!r.merchant_id) return;
          if (r.rider_id === effective && personal[r.merchant_id] == null) {
            personal[r.merchant_id] = Number(r.rider_percentage || 0);
          } else if (r.rider_id == null && fallback[r.merchant_id] == null) {
            fallback[r.merchant_id] = Number(r.rider_percentage || 0);
          }
        });
        const map: Record<string, number> = { ...fallback, ...personal };
        setRiderShares(map);
      } else {
        setRiderShares({});
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      let rId: string | null = null;
      if (isRider) {
        const { data } = await supabase.from('riders').select('id').eq('user_id', user.id).maybeSingle();
        rId = data?.id ?? null;
        setRiderId(rId);
      }
      await load(rId);
    };
    init();

    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => load(), 600);
    };
    const channel = supabase
      .channel('rejected-deliveries-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_rejections' }, () => scheduleReload())
      .subscribe();
    return () => { if (reloadTimer) clearTimeout(reloadTimer); supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(d =>
      (d.merchants?.name || '').toLowerCase().includes(q) ||
      (d.customer_name || '').toLowerCase().includes(q) ||
      (d.customer_phone || '').toLowerCase().includes(q) ||
      (d.pickup_address || '').toLowerCase().includes(q) ||
      (d.dropoff_address || '').toLowerCase().includes(q) ||
      (d.order_reference || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Paginated slice via the shared helper (1-based page). The merged
  // rejected+unassigned list is still assembled client-side —
  // TODO(data-layer): page it on the server via fetchDeliveriesPage once the
  // rejected-ids prefetch moves into a query helper.
  const visibleRows = useMemo(
    () => paginate(filtered, 1, visibleCount),
    [filtered, visibleCount],
  );

  const handleClaim = async (d: Delivery) => {
    if (!isRider) return;
    setClaiming(d.id);
    // Claiming also puts the rider online — say so instead of silently flipping state.
    await markRiderOnlineByRiderId(riderId!);
    const isUnassigned = d.status === 'unassigned' && !d.rider_id;
    const { error } = isUnassigned
      ? await rpcClaimDelivery(d.id)
      : await rpcReclaimDelivery(d.id);
    setClaiming(null);
    if (error) {
      if ((error.message || '').includes('DELIVERY_LOCKED')) {
        toast.error('Another rider has already accepted this delivery.');
      } else {
        toast.error(`Could not claim: ${error.message}`);
      }
      load();
      return;
    }
    toast.success(isUnassigned ? 'Delivery claimed! Check My Deliveries.' : 'Delivery reassigned to you. Check My Deliveries.');
    setDetail(null);
    setRows(prev => prev.filter(r => r.id !== d.id));
    load();
  };

  const canClaim = (d: Delivery) =>
    isRider && d.rider_id !== riderId && (d.status === 'unassigned' || d.status === 'dispatched');

  const isLocked = (d: Delivery) => LOCKED_STATUSES.includes(d.status);

  const loadHolderHistory = async (deliveryId: string) => {
    setHolderHistory([]);
    const { data } = await supabase
      .from('delivery_holder_events')
      .select('id, rider_id, from_rider_id, event_type, created_at')
      .eq('delivery_id', deliveryId)
      .order('created_at', { ascending: true });
    const events = ((data as any[]) || []) as HolderEvent[];
    if (events.length === 0) { setHolderHistory([]); return; }
    const ids = Array.from(new Set(events.flatMap(e => [e.rider_id, e.from_rider_id].filter(Boolean) as string[])));
    const { data: ridersData } = await supabase.from('riders').select('id, user_id, rider_code').in('id', ids);
    const userIds = ((ridersData as any[]) || []).map(r => r.user_id);
    const { data: profs } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
    const nameByUser: Record<string, string> = {};
    ((profs as any[]) || []).forEach(p => { nameByUser[p.user_id] = p.full_name; });
    const nameByRider: Record<string, string> = {};
    ((ridersData as any[]) || []).forEach((r: any) => { nameByRider[r.id] = nameByUser[r.user_id] || r.rider_code || 'Rider'; });
    setHolderHistory(events.map(e => ({
      ...e,
      rider_name: nameByRider[e.rider_id] || 'Rider',
      from_rider_name: e.from_rider_id ? (nameByRider[e.from_rider_id] || 'Rider') : undefined,
    })));
  };

  const openDetail = (d: Delivery) => {
    setDetail(d);
    loadHolderHistory(d.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display tracking-tight flex items-center gap-2">
            <PackageX className="h-7 w-7 text-warning" aria-hidden="true" />
            Rejected & Unassigned Deliveries
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRider
              ? 'Tap Claim to add any delivery to your queue.'
              : 'Deliveries currently with no assigned rider, including ones rejected by riders.'}
          </p>
        </div>
        <div className="relative">
          <Label htmlFor="rejected-search" className="sr-only">Search rejected deliveries</Label>
          <Input id="rejected-search" placeholder="Search merchant, customer, address…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
      </div>

      {loading ? (
        <div role="status" aria-label="Loading rejected deliveries" className="space-y-3 py-6">
          <Skeleton className="shimmer h-16 w-full rounded-lg" />
          <Skeleton className="shimmer h-16 w-full rounded-lg" />
          <Skeleton className="shimmer h-16 w-full rounded-lg" />
          <span className="sr-only">Loading rejected deliveries…</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <PackageX className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <EmptyState {...pageEmptyStates.rejectedDeliveries.list} />
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid gap-3">
          {visibleRows.map(d => {
            const dRej = rejections[d.id] || [];
            const rejCount = dRej.length;
            const myRej = dRej.find(r => r.mine);
            return (
              <Card key={d.id} className={`hover:shadow-md transition-shadow ${myRej ? 'border-destructive/40' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {d.merchants?.name || 'Merchant'}
                        {d.order_reference && <Badge variant="outline" className="text-xs">#{d.order_reference}</Badge>}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        <time dateTime={d.created_at}>{new Date(d.created_at).toLocaleString()}</time>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {myRej && (
                        <Badge variant="destructive" className="text-xs tabular-nums">
                          You rejected · <time dateTime={myRej.created_at}>{new Date(myRej.created_at).toLocaleString()}</time>
                        </Badge>
                      )}
                      {rejCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {rejCount} rejection{rejCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {(d.status === 'unassigned' && !d.rider_id) ? (
                        <Badge className="bg-warning/10 text-warning border-warning/20">Unassigned</Badge>
                      ) : d.status === 'dispatched' ? (
                        <Badge variant="secondary" className="text-xs">Claimed · not yet accepted</Badge>
                      ) : isLocked(d) ? (
                        <Badge variant="outline" className="text-xs border-destructive/40 text-destructive">
                          Locked · accepted by another rider
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{d.status.replace('_', ' ')}</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-success shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground">Pickup</div>
                        <div>{d.pickup_address}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground">Dropoff</div>
                        <div>{d.dropoff_address}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{d.customer_name || '—'}</span>
                    </div>
<div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {d.customer_phone && (() => {
                        const phone = d.customer_phone;
                        return <a href={`tel:${phone}`} className="hover:underline">{phone}</a>;
                      })()}
                    </div>
                  </div>

                  {dRej.length > 0 && (
                    <div className="rounded-md bg-muted/40 p-2 text-xs space-y-1.5">
                      <div className="font-medium text-muted-foreground uppercase tracking-wide text-xs">Recent rejections</div>
                      {dRej.slice(0, 2).map((r, i) => (
                        <div key={i} className={`rounded border px-2 py-1 ${r.mine ? 'border-destructive/60 bg-destructive/5' : 'border-border'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{r.mine ? 'You' : r.rider_name}</span>
                            <span className="text-muted-foreground"><time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString()}</time></span>
                          </div>
                          <div className="italic text-muted-foreground">{r.reason || 'No reason given'}</div>
                        </div>
                      ))}
                      {dRej.length > 2 && (
                        <Button variant="link" size="sm" className="min-h-[44px] px-0" onClick={() => openDetail(d)}>
                          + {dRej.length - 2} more
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap">
                    <div className="text-sm flex items-center gap-3 flex-wrap">
                      <div>
                        <span className="text-muted-foreground">Tariff: </span>
                        <span className="font-semibold tabular-nums">{formatMoney(Number(d.estimated_tariff || 0))}</span>
                      </div>
                      {isRider && d.merchant_id && riderShares[d.merchant_id] != null && (
                        <Badge variant="outline" className="text-primary border-primary/40 tabular-nums">
                          Your share: {riderShares[d.merchant_id]}% · {formatMoney(Number(d.estimated_tariff || 0) * riderShares[d.merchant_id] / 100)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openDetail(d)}>View</Button>
                      {canClaim(d) && (
                        <Button size="sm" disabled={claiming === d.id} onClick={() => handleClaim(d)} title="Claiming also puts you online">
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          {claiming === d.id ? 'Claiming…' : (d.status === 'unassigned' && !d.rider_id ? 'Claim' : 'Reclaim')}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {visibleCount < filtered.length && (
          <>
            <Button variant="outline" className="w-full" onClick={() => setVisibleCount(v => v + REJECTED_PAGE_SIZE)}>
              Show more ({filtered.length - visibleCount} remaining)
            </Button>
            <p className="text-xs text-muted-foreground text-center" role="status">
              Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
            </p>
          </>
        )}
        </>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Delivery details</DialogTitle>
            <DialogDescription>{detail?.merchants?.name}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><div className="text-xs text-muted-foreground">Order</div><div>{detail.order_reference || '—'}</div></div>
                <div><div className="text-xs text-muted-foreground">Tariff</div><div className="tabular-nums">{formatMoney(Number(detail.estimated_tariff || 0))}</div></div>
                <div><div className="text-xs text-muted-foreground">Customer</div><div>{detail.customer_name}</div></div>
                <div><div className="text-xs text-muted-foreground">Phone</div><div>{detail.customer_phone ? <a href={`tel:${detail.customer_phone}`} className="hover:underline">{detail.customer_phone}</a> : '—'}</div></div>
              </div>
              <div><div className="text-xs text-muted-foreground">Pickup</div><div>{detail.pickup_address}</div></div>
              <div><div className="text-xs text-muted-foreground">Dropoff</div><div>{detail.dropoff_address}</div></div>
              <div className="text-xs text-muted-foreground">Created <time dateTime={detail.created_at}>{new Date(detail.created_at).toLocaleString()}</time></div>

              <div className="border-t pt-3">
                <div className="font-medium text-sm mb-2">Holder history ({holderHistory.length})</div>
                {holderHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No claim or reassignment events recorded.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs max-h-48 overflow-auto">
                    {holderHistory.map(ev => (
                      <li key={ev.id} className="flex items-center justify-between gap-2 border-b pb-1 last:border-0">
                        <span>
                          {ev.event_type === 'reassigned_from' ? (
                            <>Reassigned from <span className="font-medium">{ev.from_rider_name}</span> to <span className="font-medium">{ev.rider_name}</span></>
                          ) : ev.event_type === 'released' ? (
                            <>Released by <span className="font-medium">{ev.rider_name}</span></>
                          ) : (
                            <>Claimed by <span className="font-medium">{ev.rider_name}</span></>
                          )}
                        </span>
                        <span className="text-muted-foreground"><time dateTime={ev.created_at}>{new Date(ev.created_at).toLocaleString()}</time></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(() => {
                const dRej = rejections[detail.id] || [];
                return (
                  <div className="border-t pt-3">
                    <div className="font-medium text-sm mb-2">Rejection history ({dRej.length})</div>
                    {dRej.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No rejections recorded.</p>
                    ) : (
                      <ul className="space-y-2 text-xs max-h-56 overflow-auto">
                        {dRej.map((r, i) => (
                          <li key={i} className="border-b pb-2 last:border-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{r.rider_name}</span>
                              <span className="text-muted-foreground"><time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString()}</time></span>
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
                );
              })()}
              {canClaim(detail) && (
                <Button className="w-full" disabled={claiming === detail.id} onClick={() => handleClaim(detail)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {claiming === detail.id ? 'Claiming…' : (detail.status === 'unassigned' && !detail.rider_id ? 'Claim delivery' : 'Reclaim delivery')}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
