import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import DeliveryMap from '@/components/DeliveryMap';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Eye, Flag, Search, Package, CreditCard, CheckCircle2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function DeliveriesPage() {
  const { user, hasRole } = useAuth();
  const isRider = hasRole('rider');
  const [riderId, setRiderId] = useState<string | null>(null);
  const riderIdRef = useRef<string | null>(null);
  useEffect(() => { riderIdRef.current = riderId; }, [riderId]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [unattended, setUnattended] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectionCounts, setRejectionCounts] = useState<Record<string, number>>({});
  const [selectedRejections, setSelectedRejections] = useState<Array<{ rider_name: string; created_at: string }>>([]);

  const loadUnattended = async (rId?: string | null) => {
    const effectiveRid = rId !== undefined ? rId : riderIdRef.current;
    let rejectedIds: string[] = [];
    if (isRider && effectiveRid) {
      const { data: rejs } = await supabase
        .from('delivery_rejections')
        .select('delivery_id')
        .eq('rider_id', effectiveRid);
      rejectedIds = ((rejs as any[]) || []).map(r => r.delivery_id);
    }
    let q = supabase
      .from('deliveries')
      .select('*')
      .in('status', ['unassigned', 'pending'])
      .is('rider_id', null)
      .order('created_at', { ascending: false });
    if (rejectedIds.length > 0) {
      q = q.not('id', 'in', `(${rejectedIds.join(',')})`);
    }
    const { data } = await q;
    setUnattended(data || []);
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
    const load = async () => {
      let query = supabase.from('deliveries').select('*').order('created_at', { ascending: false });
      if (filter !== 'all') query = query.eq('status', filter);
      const { data } = await query;
      setDeliveries(data || []);
      setLoading(false);
    };
    load();
    loadRejectionCounts();
    loadUnattended();

    const channel = supabase
      .channel('deliveries-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setDeliveries(prev => [payload.new as any, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setDeliveries(prev => prev.map(d => d.id === (payload.new as any).id ? payload.new as any : d));
        } else if (payload.eventType === 'DELETE') {
          setDeliveries(prev => prev.filter(d => d.id !== (payload.old as any).id));
        }
        loadUnattended();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_rejections' }, () => {
        loadRejectionCounts();
        loadUnattended();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [filter]);

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
      unassigned: 'bg-warning/10 text-warning border-warning/20',
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Deliveries</h1>
          <p className="text-muted-foreground">Monitor all deliveries with route playback</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search deliveries..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="unassigned">Unattended</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {(() => {
        const unattendedList = unattended;
        const otherList = filtered.filter(d => !((d.status === 'unassigned' || d.status === 'pending') && !d.rider_id));
        return (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
            {/* Unattended / Rejected column */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-semibold text-warning">Unattended / Rejected ({unattendedList.length})</h2>
              </div>
              {unattendedList.length === 0 && (
                <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg text-xs">
                  All deliveries currently assigned.
                </div>
              )}
              {unattendedList.map(d => {
                const rejCount = rejectionCounts[d.id] || 0;
                return (
                  <Card key={d.id} className="border-warning/30 bg-warning/5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => viewDelivery(d)}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">{d.order_reference || d.id.slice(0, 8)}</p>
                        <Badge className={statusColor(d.status)}>{d.status.replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">📍 {d.pickup_address}</p>
                      <p className="text-xs text-muted-foreground truncate">🏁 {d.dropoff_address}</p>
                      <div className="flex items-center justify-between text-xs">
                        {d.estimated_tariff && <span className="font-medium">D{Number(d.estimated_tariff).toLocaleString()}</span>}
                        {rejCount > 0 && (
                          <Badge variant="outline" className="text-destructive border-destructive/30">
                            Rejected by {rejCount} rider{rejCount === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </div>
                      {isRider && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button onClick={() => handleClaim(d)} size="sm" className="w-full">
                            <CheckCircle2 className="h-4 w-4 mr-1.5" />Claim Delivery
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Main list column */}
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{otherList.length} deliveries</div>
        {otherList.map(d => (
          <Card key={d.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-lg shrink-0 ${d.status === 'delivered' ? 'bg-accent/10' : 'bg-primary/10'}`}>
                  <MapPin className={`h-4 w-4 ${d.status === 'delivered' ? 'text-accent' : 'text-primary'}`} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{d.order_reference || d.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.pickup_address} → {d.dropoff_address}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {d.actual_distance_km && <span className="text-xs text-muted-foreground">{d.actual_distance_km} km</span>}
                    {d.estimated_tariff && <span className="text-xs font-medium">D{Number(d.estimated_tariff).toLocaleString()}</span>}
                    <span className="text-xs text-muted-foreground">{format(new Date(d.created_at), 'MMM d, HH:mm')}</span>
                    {d.payment_method && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <CreditCard className="h-3 w-3" />
                        {d.payment_method === 'bank_transfer' && d.payment_bank_name
                          ? `Bank (${d.payment_bank_name})`
                          : { cash: 'Cash', wave: 'Wave', qmoney: 'QMoney', afrimoney: 'Afrimoney', aps_wallet: 'APS Wallet', bank_transfer: 'Bank Transfer' }[d.payment_method] || d.payment_method}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.is_flagged && <Badge variant="destructive">⚠ Flagged</Badge>}
                {d.route_deviation_detected && <Badge className="bg-warning/10 text-warning border-warning/20">Deviation</Badge>}
                <Badge className={statusColor(d.status)}>{d.status.replace('_', ' ')}</Badge>
                <Button variant="ghost" size="icon" onClick={() => viewDelivery(d)}><Eye className="h-4 w-4" /></Button>
                {!d.is_flagged && <Button variant="ghost" size="icon" onClick={() => flagDelivery(d.id)}><Flag className="h-4 w-4" /></Button>}
                {hasRole('admin') && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => e.stopPropagation()}><Trash2 className="h-4 w-4" /></Button>
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
              <DeliveryMap
                waypoints={waypoints}
                pickupLat={selected.pickup_latitude} pickupLng={selected.pickup_longitude}
                dropoffLat={selected.dropoff_latitude} dropoffLng={selected.dropoff_longitude}
                className="h-72 w-full rounded-lg"
              />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge className={statusColor(selected.status)}>{selected.status.replace('_', ' ')}</Badge></div>
                <div><span className="text-muted-foreground">GPS Confirmed:</span> {selected.gps_confirmed ? '✅' : '❌'}</div>
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
