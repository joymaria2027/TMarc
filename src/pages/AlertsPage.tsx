import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import {
  filterAlerts,
  humanizeAlertType,
  patchAlerts,
  type AlertGroup,
} from '@/lib/alertFilters';
import {
  applyBulkResolve,
  applyBulkUnresolve,
  normalizeResolveNote,
  RESOLVE_NOTE_MAX_LENGTH,
  toggleSelected,
} from '@/lib/alertBulk';
import { nextFocusIndex, prevFocusIndex } from '@/lib/alertKeys';

interface AlertItem {
  id: string;
  alert_type: string;
  message: string;
  created_at: string;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_note: string | null;
  delivery_id: string | null;
  merchant_id: string | null;
}

export default function AlertsPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState('all');
  const [group, setGroup] = useState<AlertGroup>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<AlertItem[] | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number>(-1);

  const load = async () => {
    let query = supabase.from('delivery_alerts').select('*').order('created_at', { ascending: false });
    if (filter === 'unresolved') query = query.eq('is_resolved', false);
    if (filter === 'resolved') query = query.eq('is_resolved', true);
    const { data } = await query;
    setAlerts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, (payload) => {
        // Patch state for the common case so the list doesn't jump while triaging.
        const p = payload as { eventType?: string; new?: AlertItem; old?: { id?: string } };
        const eventType = p.eventType ?? '';
        if (eventType === 'INSERT' && p.new?.id) {
          const status = filter === 'resolved' ? 'resolved' : filter === 'unresolved' ? 'unresolved' : 'all';
          setAlerts(prev => patchAlerts(prev, { kind: 'INSERT', row: p.new as AlertItem }, status));
        } else if (eventType === 'UPDATE' && p.new?.id) {
          const status = filter === 'resolved' ? 'resolved' : filter === 'unresolved' ? 'unresolved' : 'all';
          setAlerts(prev => patchAlerts(prev, { kind: 'UPDATE', row: p.new as AlertItem }, status));
        } else if (eventType === 'DELETE' && p.old?.id) {
          setAlerts(prev => patchAlerts(prev, { kind: 'DELETE', id: p.old?.id as string }, 'all'));
        } else {
          load();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // Intentional: resubscribe only when the server-side status filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const validateNote = (raw: string): boolean => {
    if (raw.trim().length > RESOLVE_NOTE_MAX_LENGTH) {
      setNoteError(`Note must be ${RESOLVE_NOTE_MAX_LENGTH} characters or less`);
      return false;
    }
    setNoteError(null);
    return true;
  };

  const resolveAlert = async (id: string) => {
    if (!validateNote(resolveNote)) return;
    const note = normalizeResolveNote(resolveNote);
    await supabase.from('delivery_alerts').update({ is_resolved: true, resolved_by: user?.id, resolved_note: note }).eq('id', id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_resolved: true, resolved_note: note } : a));
    toast.success('Alert resolved');
  };

  const resolveSelected = async () => {
    if (bulkBusy || selected.length === 0) return;
    if (!validateNote(resolveNote)) return;
    const note = normalizeResolveNote(resolveNote);
    const targets = alerts.filter(a => selected.includes(a.id) && !a.is_resolved);
    if (targets.length === 0) { setSelected([]); return; }
    setBulkBusy(true);
    setAlerts(prev => applyBulkResolve(prev, selected, user?.id).map(a => selected.includes(a.id) ? { ...a, resolved_note: note } : a));
    const failed: string[] = [];
    for (const t of targets) {
      const { error } = await supabase
        .from('delivery_alerts')
        .update({ is_resolved: true, resolved_by: user?.id, resolved_note: note })
        .eq('id', t.id);
      if (error) failed.push(t.id);
    }
    if (failed.length > 0) {
      const failedSet = new Set(failed);
      setAlerts(prev => applyBulkUnresolve(prev, targets.filter(t => failedSet.has(t.id))));
      setSelected(failed);
      setUndoSnapshot(targets.filter(t => !failedSet.has(t.id)));
      toast.error(`Resolved ${targets.length - failed.length} of ${targets.length} — ${failed.length} failed, kept selected`);
    } else {
      setSelected([]);
      setUndoSnapshot(targets);
      toast.success(`Resolved ${targets.length} ${targets.length === 1 ? 'alert' : 'alerts'}`);
    }
    setBulkBusy(false);
  };

  const undoBulk = async () => {
    if (bulkBusy || !undoSnapshot || undoSnapshot.length === 0) return;
    const snapshot = undoSnapshot;
    setBulkBusy(true);
    try {
      for (const s of snapshot) {
        const { error } = await supabase
          .from('delivery_alerts')
          .update({ is_resolved: false, resolved_by: null })
          .eq('id', s.id);
        if (error) throw error;
      }
      // Only re-add rows visible under the current status filter.
      const visible = filter === 'resolved' ? [] : snapshot;
      setAlerts(prev => applyBulkUnresolve(prev, visible));
      setUndoSnapshot(null);
      toast.success(`Restored ${snapshot.length} ${snapshot.length === 1 ? 'alert' : 'alerts'} to active`);
    } catch {
      toast.error('Undo failed — please try again');
    } finally {
      setBulkBusy(false);
    }
  };

  const alertColor = (type: string) => {
    const map: Record<string, string> = {
      late_delivery: 'bg-warning/10 text-warning border-warning/20',
      route_deviation: 'bg-destructive/10 text-destructive border-destructive/20',
      suspicious: 'bg-destructive/10 text-destructive border-destructive/20',
      duplicate: 'bg-primary/10 text-primary border-primary/20',
      out_of_area: 'bg-destructive/10 text-destructive border-destructive/20',
      delivery_completed: 'bg-accent/10 text-accent border-accent/20',
      withdrawal_request: 'bg-primary/10 text-primary border-primary/20',
      withdrawal_completed: 'bg-accent/10 text-accent border-accent/20',
      withdrawal_rejected: 'bg-destructive/10 text-destructive border-destructive/20',
      wallet_credit: 'bg-accent/10 text-accent border-accent/20',
      wallet_credit_corrected: 'bg-warning/10 text-warning border-warning/20',
    };
    return map[type] || '';
  };

  const alertIcon = (type: string) => {
    if (['delivery_completed', 'withdrawal_completed', 'wallet_credit', 'wallet_credit_corrected'].includes(type)) return <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />;
    if (type === 'withdrawal_request') return <Bell className="h-4 w-4 text-primary shrink-0" />;
    return <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />;
  };

  const unresolvedCount = alerts.filter(a => !a.is_resolved).length;
  const visibleAlerts = filterAlerts(alerts, { group, query: search });
  const visibleUnresolved = visibleAlerts.filter(a => !a.is_resolved);
  const selectAllState =
    visibleUnresolved.length > 0 && visibleUnresolved.every(a => selected.includes(a.id))
      ? true
      : visibleUnresolved.some(a => selected.includes(a.id))
        ? ('indeterminate' as const)
        : false;

  // Trim + clamp only when the visible count changes.
  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, visibleAlerts.length);
    setFocusIndex(prev => (prev >= visibleAlerts.length ? -1 : prev));
  }, [visibleAlerts.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'j' || e.key === 'k') {
        if (visibleAlerts.length === 0) return;
        e.preventDefault();
        const next = e.key === 'j'
          ? nextFocusIndex(focusIndex, visibleAlerts.length)
          : prevFocusIndex(focusIndex, visibleAlerts.length);
        setFocusIndex(next);
        cardRefs.current[next]?.focus();
        return;
      }
      if (e.key === 'x') {
        const current = visibleAlerts[focusIndex];
        if (!current || current.is_resolved) return;
        setSelected(prev => toggleSelected(prev, current.id));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visibleAlerts, focusIndex]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Alerts
            {unresolvedCount > 0 && <Badge variant="destructive">{unresolvedCount} active</Badge>}
          </h1>
          <p className="text-muted-foreground">Deliveries, withdrawals, and system notifications</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="alerts-search"
            ref={searchRef}
            value={search}
            onChange={e => { setSearch(e.target.value); setSelected([]); }}
            placeholder="Search alerts…"
            aria-label="Search alerts by message or type"
            className="max-w-xs"
          />
          <Select value={group} onValueChange={v => { setGroup(v as AlertGroup); setSelected([]); }}>
            <SelectTrigger className="w-36" aria-label="Filter by alert group"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="money">Money</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter} onValueChange={v => { setFilter(v); setSelected([]); }}>
            <SelectTrigger className="w-36" aria-label="Filter by resolution status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Alerts</SelectItem>
              <SelectItem value="unresolved">Active</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Shortcuts: <kbd className="rounded border border-border bg-muted px-1">j</kbd> / <kbd className="rounded border border-border bg-muted px-1">k</kbd> move, <kbd className="rounded border border-border bg-muted px-1">x</kbd> select, <kbd className="rounded border border-border bg-muted px-1">/</kbd> search
      </p>
      <div className="space-y-3">
        {undoSnapshot && undoSnapshot.length > 0 && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded border border-accent/40 bg-accent/10 p-3 text-sm">
            <span>
              Resolved {undoSnapshot.length} {undoSnapshot.length === 1 ? 'alert' : 'alerts'}
              <span className="text-muted-foreground"> — undo restores {undoSnapshot.length === 1 ? 'it' : 'them'} to active</span>
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={undoBulk} disabled={bulkBusy}>
                {bulkBusy ? 'Working…' : 'Undo'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setUndoSnapshot(null)} disabled={bulkBusy}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
        {visibleAlerts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Bulk alert actions">
            <label className="flex h-11 w-11 items-center justify-center shrink-0 cursor-pointer">
              <Checkbox
                checked={selectAllState}
                onCheckedChange={() => {
                  setSelected(prev => {
                    const ids = visibleUnresolved.map(a => a.id);
                    const allSelected = ids.length > 0 && ids.every(id => prev.includes(id));
                    return allSelected ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])];
                  });
                }}
                disabled={bulkBusy || visibleUnresolved.length === 0}
                aria-label="Select all visible unresolved alerts"
              />
            </label>
            <span className="text-sm text-muted-foreground" role="status">
              {selected.length === 0 ? `${visibleUnresolved.length} unresolved visible` : `${selected.length} selected`}
            </span>
            <div className="flex-1" />
            {selected.length > 0 && (
              <>
                <Input
                  value={resolveNote}
                  onChange={e => {
                    setResolveNote(e.target.value);
                    if (e.target.value.trim().length > RESOLVE_NOTE_MAX_LENGTH) {
                      setNoteError(`Note must be ${RESOLVE_NOTE_MAX_LENGTH} characters or less`);
                    } else {
                      setNoteError(null);
                    }
                  }}
                  placeholder="Resolve note (optional)…"
                  aria-label="Resolve note (optional, applied to every resolve in the batch)"
                  aria-invalid={noteError !== null}
                  aria-describedby={noteError ? 'resolve-note-error' : undefined}
                  className="h-11 max-w-xs"
                />
                <Button size="sm" onClick={resolveSelected} disabled={bulkBusy || noteError !== null}>
                  {bulkBusy ? 'Resolving…' : `Resolve ${selected.length} selected`}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected([])} disabled={bulkBusy}>
                  Clear
                </Button>
              </>
            )}
            {noteError && (
              <p id="resolve-note-error" role="alert" className="w-full text-sm text-destructive">
                {noteError}
              </p>
            )}
          </div>
        )}
        {visibleAlerts.map((a, i) => (
          <Card
            key={a.id}
            tabIndex={-1}
            ref={(el) => { cardRefs.current[i] = el; }}
            onFocus={() => setFocusIndex(i)}
            className={`outline-none ${a.is_resolved ? 'opacity-60' : ''} ${focusIndex === i ? 'ring-2 ring-primary' : ''}`}
          >
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {!a.is_resolved ? (
                  <label className="flex h-11 w-11 items-center justify-center shrink-0 cursor-pointer">
                    <Checkbox
                      checked={selected.includes(a.id)}
                      onCheckedChange={() => setSelected(prev => toggleSelected(prev, a.id))}
                      disabled={bulkBusy}
                      aria-label={`Select alert: ${humanizeAlertType(a.alert_type)}`}
                    />
                  </label>
                ) : (
                  <span className="w-11 shrink-0" aria-hidden="true" />
                )}
                {alertIcon(a.alert_type)}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className={alertColor(a.alert_type)}>{humanizeAlertType(a.alert_type)}</Badge>
                    {a.is_resolved && <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />Resolved</Badge>}
                  </div>
                  <p className="text-sm">{a.message}</p>
                  {a.resolved_note && (
                    <p className="text-xs text-muted-foreground">Notes: {a.resolved_note}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'MMM d, yyyy HH:mm:ss')}</p>
                    {a.delivery_id && (
                      <Link
                        to={`/deliveries?highlight=${a.delivery_id}`}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        View delivery
                      </Link>
                    )}
                  </div>
                </div>
              </div>
              {!a.is_resolved && (
                <Button size="sm" variant="outline" onClick={() => resolveAlert(a.id)} disabled={noteError !== null} className="shrink-0">Resolve</Button>
              )}
            </CardContent>
          </Card>
        ))}
        {visibleAlerts.length === 0 && (
          <div className="text-center py-10 text-muted-foreground space-y-3">
            <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p role="status">{alerts.length === 0 ? 'No alerts – all clear!' : 'No alerts match these filters.'}</p>
            {alerts.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => { setGroup('all'); setSearch(''); setFilter('all'); }}>
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
