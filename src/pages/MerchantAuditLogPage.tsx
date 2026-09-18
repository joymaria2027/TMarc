import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollText, ChevronDown } from 'lucide-react';
import { filterAuditRows, paginateList } from './merchantGroup.helpers';

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
  const [debouncedSearch, setDebouncedSearch] = useState('');
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

  // Debounced reload: audit bursts collapse into one fetch (scoped client-side
  // by the merchant/event/search filters below).
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    load();
    const channel = supabase
      .channel('merchant-audit-log')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_audit_log' }, () => {
        if (loadTimer.current) clearTimeout(loadTimer.current);
        loadTimer.current = setTimeout(() => { load(); }, 350);
      })
      .subscribe();
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  // Debounce the search box so each keystroke does not re-filter 1000 rows.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const merchantName = (id: string) => merchants.find(m => m.id === id)?.name || 'Unknown store';

  const filtered = useMemo(() => filterAuditRows(rows, {
    merchantFilter,
    eventFilter,
    search: debouncedSearch,
    merchantName: (id: string) => merchants.find(m => m.id === id)?.name || 'Unknown store',
    actorText: (uid: string) => profiles[uid]?.full_name || profiles[uid]?.email || '',
  }), [rows, merchantFilter, eventFilter, debouncedSearch, profiles, merchants]);

  const pageRows = paginateList(filtered, page, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const filtersActive = merchantFilter !== 'all' || eventFilter !== 'all' || debouncedSearch.trim() !== '';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <ScrollText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-2xl font-bold">Merchant Audit Log</h1>
        <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="audit-store" className="text-xs">Store</Label>
          <Select value={merchantFilter} onValueChange={v => { setMerchantFilter(v); setPage(0); }}>
            <SelectTrigger id="audit-store" className="min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stores</SelectItem>
              {merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-event" className="text-xs">Event</Label>
          <Select value={eventFilter} onValueChange={v => { setEventFilter(v); setPage(0); }}>
            <SelectTrigger id="audit-event" className="min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {Object.entries(EVENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-search" className="text-xs">Search</Label>
          <Input id="audit-search" className="min-h-[44px]" placeholder="Store or person" autoComplete="off" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
      </div>

      {loading ? (
        <div role="status" aria-label="Loading audit log" className="space-y-2">
          <div className="shimmer h-12 rounded-md" aria-hidden="true" />
          <div className="shimmer h-12 rounded-md" aria-hidden="true" />
          <div className="shimmer h-12 rounded-md" aria-hidden="true" />
          <span className="sr-only">Loading audit log…</span>
        </div>
      ) : pageRows.length === 0 ? (
        <p className="text-muted-foreground" role="status">
          {filtersActive ? 'No entries match these filters. Clear the search or choose a different store.' : 'No audit entries yet. Store approvals and QR activity will appear here.'}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-md border" role="region" aria-label="Merchant audit log">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Event</TableHead>
                <TableHead scope="col">Store</TableHead>
                <TableHead scope="col">Actor</TableHead>
                <TableHead scope="col" className="text-right">Time</TableHead>
                <TableHead scope="col"><span className="sr-only">Details</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map(r => {
                const actor = profiles[r.actor_user_id];
                const hasDetail = r.detail && Object.keys(r.detail).length > 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge className="text-xs" variant={r.event_type.startsWith('qr_') ? 'outline' : 'default'}>
                        {EVENT_LABELS[r.event_type] || r.event_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{merchantName(r.merchant_id)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {actor?.full_name || actor?.email || 'Unknown user'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs text-right tabular-nums">
                      <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString()}</time>
                    </TableCell>
                    <TableCell>
                      {hasDetail ? (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button size="sm" variant="ghost" aria-label={`Show details for ${EVENT_LABELS[r.event_type] || r.event_type} at ${merchantName(r.merchant_id)}`}>
                              Details <ChevronDown className="h-3 w-3" aria-hidden="true" />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="mt-1 max-w-md text-xs text-muted-foreground bg-muted rounded p-2 overflow-auto">
                              {JSON.stringify(r.detail, null, 2)}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
            <span className="text-xs text-muted-foreground" role="status">Page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} aria-label="Previous audit page" onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} aria-label="Next audit page" onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
