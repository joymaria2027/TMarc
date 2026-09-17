import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollText } from 'lucide-react';

const EVENT_LABELS: Record<string, string> = {
  submerchant_created: 'Sub-merchant created',
  submerchant_approved: 'Approved',
  submerchant_rejected: 'Rejected',
  submerchant_status_changed: 'Status changed',
  qr_viewed: 'QR viewed',
  qr_downloaded: 'QR downloaded',
  qr_printed: 'QR poster printed',
  qr_link_copied: 'QR link copied',
};

const PAGE_SIZE = 25;

export default function MerchantAuditLogPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [merchantFilter, setMerchantFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [logRes, mRes, pRes] = await Promise.all([
      supabase.from('merchant_audit_log' as any).select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('merchants').select('id,name'),
      supabase.rpc('get_public_profiles'),
    ]);
    setRows((logRes.data as any) || []);
    setMerchants(mRes.data || []);
    const map: Record<string, any> = {};
    ((pRes.data as any) || []).forEach((p: any) => { map[p.user_id] = p; });
    setProfiles(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('merchant-audit-log')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_audit_log' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const merchantName = (id: string) => merchants.find(m => m.id === id)?.name || 'Unknown store';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (merchantFilter !== 'all' && r.merchant_id !== merchantFilter) return false;
      if (eventFilter !== 'all' && r.event_type !== eventFilter) return false;
      if (!q) return true;
      const actor = profiles[r.actor_user_id]?.full_name || profiles[r.actor_user_id]?.email || '';
      return `${merchantName(r.merchant_id)} ${actor} ${r.event_type}`.toLowerCase().includes(q);
    });
  }, [rows, merchantFilter, eventFilter, search, profiles, merchants]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Merchant Audit Log</h1>
        <Badge variant="secondary">{filtered.length}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Store</Label>
          <Select value={merchantFilter} onValueChange={v => { setMerchantFilter(v); setPage(0); }}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stores</SelectItem>
              {merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Event</Label>
          <Select value={eventFilter} onValueChange={v => { setEventFilter(v); setPage(0); }}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {Object.entries(EVENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Search</Label>
          <Input className="h-9" placeholder="Store or person" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : pageRows.length === 0 ? (
        <p className="text-muted-foreground">No audit entries yet.</p>
      ) : (
        <div className="space-y-2">
          {pageRows.map(r => {
            const actor = profiles[r.actor_user_id];
            return (
              <Card key={r.id}>
                <CardContent className="p-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <Badge variant={r.event_type.startsWith('qr_') ? 'outline' : 'default'}>
                    {EVENT_LABELS[r.event_type] || r.event_type}
                  </Badge>
                  <span className="font-medium">{merchantName(r.merchant_id)}</span>
                  <span className="text-muted-foreground">
                    by {actor?.full_name || actor?.email || 'Unknown user'}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                  {r.detail && Object.keys(r.detail).length > 0 && (
                    <pre className="w-full text-xs text-muted-foreground bg-muted rounded p-2 overflow-auto">
                      {JSON.stringify(r.detail, null, 2)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">Page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
