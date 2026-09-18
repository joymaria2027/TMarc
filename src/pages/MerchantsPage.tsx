import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Building2, Plus, DollarSign, Truck, Edit2, UserCheck, Tag, QrCode, GitBranch, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import StoreQrDialog from '@/components/StoreQrDialog';
import { useAuth } from '@/hooks/useAuth';
import {
  groupMerchants, paginateList, validateMerchantForm, validateDeliveryForm,
  validateTariffForm, type Errors,
} from './merchantGroup.helpers';
import { parseHighlightId } from '@/lib/deliveries';
import { guardedWrite } from '@/lib/guardedWrite';

export const MERCHANT_PAGE_SIZE = 9;

export default function MerchantsPage() {
  const { user, hasRole } = useAuth();
  const [merchants, setMerchants] = useState<any[]>([]);
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [riderProfiles, setRiderProfiles] = useState<Record<string, any>>({});
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [accountantUsers, setAccountantUsers] = useState<any[]>([]);
  const [managerUsers, setManagerUsers] = useState<any[]>([]);
  const [merchantRiders, setMerchantRiders] = useState<Record<string, string[]>>({});
  const [businessTypes, setBusinessTypes] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [tariffOpen, setTariffOpen] = useState(false);
  const [editTariffOpen, setEditTariffOpen] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState<any>(null);
  const [editingTariff, setEditingTariff] = useState<any>(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', latitude: '', longitude: '', business_type_id: '' });
  const [formErrors, setFormErrors] = useState<Errors>({});
  const [tariffForm, setTariffForm] = useState({ location_name: '', tariff_amount: '' });
  const [tariffErrors, setTariffErrors] = useState<Errors>({});
  const [qrMerchant, setQrMerchant] = useState<any>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [subParent, setSubParent] = useState<any>(null);
  const [subForm, setSubForm] = useState({ name: '', address: '', phone: '', latitude: '', longitude: '' });
  const [subErrors, setSubErrors] = useState<Errors>({});
  const [page, setPage] = useState(0);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  const isAdmin = hasRole('admin');
  const isManager = hasRole('company_manager');

  const load = useCallback(async () => {
    const [restRes, tariffRes, riderRes, rrRes, btRes] = await Promise.all([
      supabase.from('merchants').select('*').order('name'),
      supabase.from('merchant_tariffs').select('*').order('location_name'),
      supabase.from('riders').select('*').eq('is_active', true),
      supabase.from('merchant_riders').select('*'),
      supabase.from('business_types' as any).select('*').eq('is_active', true).order('name'),
    ]);
    setMerchants(restRes.data || []);
    setTariffs(tariffRes.data || []);
    setBusinessTypes((btRes.data as any) || []);
    const ridersList = riderRes.data || [];
    setRiders(ridersList);

    // Build merchant-rider map
    const rrMap: Record<string, string[]> = {};
    (rrRes.data || []).forEach((rr: any) => {
      if (!rrMap[rr.merchant_id]) rrMap[rr.merchant_id] = [];
      rrMap[rr.merchant_id].push(rr.rider_id);
    });
    setMerchantRiders(rrMap);

    // Fetch all profiles (safe public view) for rider/manager/accountant name lookups
    const { data: profiles } = await supabase.rpc('get_public_profiles');
    setAllProfiles(profiles || []);

    if (ridersList.length > 0) {
      const userIds = ridersList.map(r => r.user_id);
      const map: Record<string, any> = {};
      (profiles || []).filter((p: any) => userIds.includes(p.user_id)).forEach((p: any) => { map[p.user_id] = p; });
      setRiderProfiles(map);
    }

    // Build manager/accountant assignment dropdown lists from role table (admin only)
    if (isAdmin) {
      const { data: roleRows } = await supabase.from('user_roles').select('user_id, role').in('role', ['accountant', 'company_manager']);
      const accountantIds = (roleRows || []).filter(r => r.role === 'accountant').map(r => r.user_id);
      const managerIds = (roleRows || []).filter(r => r.role === 'company_manager').map(r => r.user_id);
      setAccountantUsers((profiles || []).filter((p: any) => accountantIds.includes(p.user_id)));
      setManagerUsers((profiles || []).filter((p: any) => managerIds.includes(p.user_id)));
    }

    setLoading(false);
  }, [isAdmin]);

  // Debounced reload: realtime fan-in (merchants, tariffs, deliveries,
  // merchant_riders) collapses bursts into one fetch. Payload scoping happens
  // in the channel handlers below; deliveries only touch visible merchants.
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLoad = useCallback(() => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => { load(); }, 350);
  }, [load]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('merchants-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, () => scheduleLoad())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_tariffs' }, () => scheduleLoad())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleLoad())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_riders' }, () => scheduleLoad())
      .subscribe();
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [load, scheduleLoad]);

  useEffect(() => { setPage(0); }, [filterType]);

  // Deep-link contract (mirrors DeliveriesPage): /merchants?highlight=<id>
  // highlights the matching merchant card + scrolls it into view once per id.
  // Unknown ids are ignored silently.
  const [searchParams] = useSearchParams();
  const highlightId = parseHighlightId(searchParams.get('highlight'));
  const pageRef = useRef<HTMLDivElement>(null);
  const scrolledHighlightRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightId) return;
    if (scrolledHighlightRef.current === highlightId) return;
    const el = pageRef.current?.querySelector(`[data-merchant-id="${CSS.escape(highlightId)}"]`);
    if (el instanceof HTMLElement) {
      scrolledHighlightRef.current = highlightId;
      el.scrollIntoView({ block: 'center' });
    }
  }, [highlightId, merchants]);

  const createMerchant = async () => {
    const errs = validateMerchantForm(form);
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.address.trim()) errs.address = 'Address is required';
    setFormErrors(errs);
    if (Object.keys(errs).length) return;
    const { error } = await supabase.from('merchants').insert({
      name: form.name, address: form.address, phone: form.phone || null,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      business_type_id: form.business_type_id,
      approval_status: 'approved',
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Merchant added');
    setOpen(false);
    setForm({ name: '', address: '', phone: '', latitude: '', longitude: '', business_type_id: '' });
    setFormErrors({});
    load();
  };

  const assignBusinessType = async (merchantId: string, businessTypeId: string) => {
    const { error } = await (supabase.from('merchants').update({ business_type_id: businessTypeId } as any) as any).eq('id', merchantId);
    if (error) { toast.error(error.message); return; }
    toast.success('Business type updated');
    setMerchants(prev => prev.map(r => r.id === merchantId ? { ...r, business_type_id: businessTypeId } : r));
  };

  const toggleSubPermission = async (merchantId: string, allowed: boolean) => {
    const { error } = await (supabase.from('merchants').update({ can_create_submerchants: allowed } as any) as any).eq('id', merchantId);
    if (error) { toast.error(error.message); return; }
    toast.success(allowed ? 'Merchant can now create sub-merchants' : 'Sub-merchant permission removed');
    setMerchants(prev => prev.map(r => r.id === merchantId ? { ...r, can_create_submerchants: allowed } : r));
  };

  const reviewMerchant = async (merchantId: string, approve: boolean, reason?: string) => {
    if (!user) return;
    const patch = approve
      ? { approval_status: 'approved', rejection_reason: null, approved_by: user.id, approved_at: new Date().toISOString() }
      : { approval_status: 'rejected', rejection_reason: reason || null, approved_by: user.id, approved_at: new Date().toISOString() };
    const { error } = await (supabase.from('merchants').update(patch as any) as any).eq('id', merchantId);
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? 'Sub-merchant published' : 'Sub-merchant rejected');
    load();
  };

  const createSubMerchant = async () => {
    if (!subParent || !user) return;
    const errs: Errors = {};
    if (!subForm.name.trim()) errs.name = 'Name is required';
    if (!subForm.address.trim()) errs.address = 'Address is required';
    setSubErrors(errs);
    if (Object.keys(errs).length) return;
    const { error } = await supabase.from('merchants').insert({
      name: subForm.name.trim(),
      address: subForm.address.trim(),
      phone: subForm.phone || null,
      latitude: subForm.latitude ? parseFloat(subForm.latitude) : subParent.latitude,
      longitude: subForm.longitude ? parseFloat(subForm.longitude) : subParent.longitude,
      business_type_id: subParent.business_type_id,
      manager_user_id: user.id,
      parent_merchant_id: subParent.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Sub-merchant created');
    setSubOpen(false);
    setSubForm({ name: '', address: '', phone: '', latitude: '', longitude: '' });
    setSubErrors({});
    load();
  };



  const addTariff = async () => {
    if (!selectedMerchant || !user) return;
    const errs = validateTariffForm(tariffForm);
    setTariffErrors(errs);
    if (Object.keys(errs).length) return;
    const { error } = await supabase.from('merchant_tariffs').insert({
      merchant_id: selectedMerchant.id,
      location_name: tariffForm.location_name,
      tariff_amount: parseFloat(tariffForm.tariff_amount),
      set_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Tariff added – stakeholders notified');
    setTariffOpen(false);
    setTariffForm({ location_name: '', tariff_amount: '' });
    setTariffErrors({});
    load();
  };

  const updateTariff = async () => {
    if (!editingTariff) return;
    const errs = validateTariffForm({ location_name: editingTariff.location_name || 'zone', tariff_amount: tariffForm.tariff_amount });
    setTariffErrors(errs.tariff_amount ? { tariff_amount: errs.tariff_amount } : {});
    if (errs.tariff_amount) return;
    const { error } = await supabase.from('merchant_tariffs').update({
      tariff_amount: parseFloat(tariffForm.tariff_amount),
    }).eq('id', editingTariff.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Tariff updated – stakeholders notified');
    setEditTariffOpen(false);
    setEditingTariff(null);
    setTariffForm({ location_name: '', tariff_amount: '' });
    setTariffErrors({});
    load();
  };

  const assignAccountant = async (merchantId: string, accountantUserId: string | null) => {
    const { error } = await supabase.from('merchants').update({
      accountant_user_id: accountantUserId,
    }).eq('id', merchantId);
    if (error) { toast.error(error.message); return; }
    toast.success('Accountant assigned');
    setMerchants(prev => prev.map(r => r.id === merchantId ? { ...r, accountant_user_id: accountantUserId } : r));
  };

  const getAccountantName = (userId: string | null) => {
    if (!userId) return null;
    return allProfiles.find(p => p.user_id === userId)?.full_name || 'Unknown';
  };

  const assignManager = async (merchantId: string, managerUserId: string | null) => {
    const { error } = await supabase.from('merchants').update({
      manager_user_id: managerUserId,
    }).eq('id', merchantId);
    if (error) { toast.error(error.message); return; }
    toast.success('Manager assigned');
    setMerchants(prev => prev.map(r => r.id === merchantId ? { ...r, manager_user_id: managerUserId } : r));
  };

  const getManagerName = (userId: string | null) => {
    if (!userId) return null;
    return allProfiles.find(p => p.user_id === userId)?.full_name || 'Unknown';
  };

  const assignRiderToMerchant = async (merchantId: string, riderId: string) => {
    const existing = merchantRiders[merchantId] || [];
    if (existing.includes(riderId)) return;
    const { error } = await supabase.from('merchant_riders').insert({ merchant_id: merchantId, rider_id: riderId });
    if (error) { toast.error(error.message); return; }
    toast.success('Rider assigned to merchant');
    setMerchantRiders(prev => ({ ...prev, [merchantId]: [...(prev[merchantId] || []), riderId] }));
  };

  const unassignRiderFromMerchant = async (merchantId: string, riderId: string) => {
    const { error } = await supabase.from('merchant_riders').delete().eq('merchant_id', merchantId).eq('rider_id', riderId);
    if (error) { toast.error(error.message); return; }
    toast.success('Rider removed from merchant');
    setMerchantRiders(prev => ({ ...prev, [merchantId]: (prev[merchantId] || []).filter(id => id !== riderId) }));
  };

  const getRiderName = (riderId: string) => {
    const rider = riders.find(r => r.id === riderId);
    if (!rider) return riderId.slice(0, 8);
    return riderProfiles[rider.user_id]?.full_name || riderId.slice(0, 8);
  };

  // Memoized tariff lookup: avoids O(merchants × tariffs) filter per render.
  const tariffsByMerchant = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of tariffs) {
      const list = map.get(t.merchant_id);
      if (list) list.push(t);
      else map.set(t.merchant_id, [t]);
    }
    return map;
  }, [tariffs]);
  const merchantTariffs = useCallback((id: string) => tariffsByMerchant.get(id) || [], [tariffsByMerchant]);

  // Grouped + paginated merchant list (group order preserved).
  const allGroups = useMemo(
    () => groupMerchants(merchants, businessTypes, filterType, { isAdmin, userId: user?.id }),
    [merchants, businessTypes, filterType, isAdmin, user?.id],
  );
  const totalCount = useMemo(() => allGroups.reduce((n, g) => n + g.items.length, 0), [allGroups]);
  const groupPages = Math.max(1, Math.ceil(totalCount / MERCHANT_PAGE_SIZE));
  const safePage = Math.min(page, groupPages - 1);
  const visibleGroups = useMemo(() => {
    const flat: { groupId: string; item: any }[] = [];
    for (const g of allGroups) for (const item of g.items) flat.push({ groupId: g.id, item });
    const slice = paginateList(flat, safePage, MERCHANT_PAGE_SIZE);
    const byId = new Map(allGroups.map(g => [g.id, { ...g, items: [] as any[] }]));
    for (const row of slice) byId.get(row.groupId)?.items.push(row.item);
    return allGroups.map(g => byId.get(g.id)!).filter(g => g.items.length > 0);
  }, [allGroups, safePage]);

  if (loading) return (
    <div className="flex items-center justify-center py-20" role="status">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
      <span className="sr-only">Loading merchants…</span>
    </div>
  );

  return (
    <div ref={pageRef} className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Merchants</h1>
          <p className="text-muted-foreground">Manage partner merchants & tariffs</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Add Merchant</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Merchant</DialogTitle>
                <DialogDescription>Register a partner merchant. Name, address and business type are required.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="merchant-business-type">Business Type *</Label>
                  <Select value={form.business_type_id} onValueChange={v => setForm(p => ({ ...p, business_type_id: v }))}>
                    <SelectTrigger id="merchant-business-type" aria-required="true" aria-invalid={!!formErrors.business_type_id} aria-describedby={formErrors.business_type_id ? 'merchant-business-type-error' : undefined}><SelectValue placeholder="Select business type" /></SelectTrigger>
                    <SelectContent>
                      {businessTypes.map(bt => (
                        <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors.business_type_id
                    ? <p id="merchant-business-type-error" className="text-xs text-destructive">{formErrors.business_type_id}</p>
                    : businessTypes.length === 0 && (
                      <p className="text-xs text-muted-foreground">No business types yet. Create one under "Business Types".</p>
                    )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="merchant-name">Name *</Label>
                  <Input id="merchant-name" required aria-required="true" aria-invalid={!!formErrors.name} aria-describedby={formErrors.name ? 'merchant-name-error' : undefined} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                  {formErrors.name && <p id="merchant-name-error" className="text-xs text-destructive">{formErrors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="merchant-address">Address *</Label>
                  <Input id="merchant-address" required aria-required="true" aria-invalid={!!formErrors.address} aria-describedby={formErrors.address ? 'merchant-address-error' : undefined} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
                  {formErrors.address && <p id="merchant-address-error" className="text-xs text-destructive">{formErrors.address}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="merchant-phone">Phone</Label>
                  <Input id="merchant-phone" type="tel" autoComplete="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="merchant-lat">Latitude</Label>
                    <Input id="merchant-lat" type="number" step="any" value={form.latitude} onChange={e => setForm(p => ({ ...p, latitude: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="merchant-lng">Longitude</Label>
                    <Input id="merchant-lng" type="number" step="any" value={form.longitude} onChange={e => setForm(p => ({ ...p, longitude: e.target.value }))} />
                  </div>
                </div>
                <Button onClick={createMerchant} className="w-full">Add Merchant</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Label htmlFor="merchant-filter-type" className="text-sm">Filter by business type:</Label>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger id="merchant-filter-type" className="w-56 min-h-[44px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Business Types</SelectItem>
            {businessTypes.map(bt => <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>)}
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {allGroups.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground" role="status">
          <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" aria-hidden="true" />
          <p>No merchants to show</p>
          <p className="text-sm mt-1">{filterType !== 'all' ? 'Try a different business-type filter.' : 'Add your first merchant to get started.'}</p>
        </div>
      ) : (
        <>
          {visibleGroups.map(group => (
            <section key={group.id} className="space-y-3" aria-label={group.name}>
              <div className="flex items-center gap-2 border-b pb-2 flex-wrap">
                <Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-lg font-semibold">{group.name}</h2>
                <Badge variant="secondary" className="text-xs">{group.items.length}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map(r => {
                  const rTariffs = merchantTariffs(r.id);
                  return (
                    <Card
                      key={r.id}
                      data-merchant-id={r.id}
                      className={highlightId !== null && r.id === highlightId ? 'ring-2 ring-primary' : undefined}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                          <span className="font-medium">{r.name}</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {r.approval_status === 'pending' && <Badge variant="outline" className="text-xs">Pending review</Badge>}
                            {r.approval_status === 'rejected' && <Badge variant="destructive" className="text-xs">Rejected</Badge>}
                            <Badge variant={r.is_active ? 'default' : 'secondary'} className="text-xs">{r.is_active ? 'Active' : 'Inactive'}</Badge>
                          </div>
                        </div>
                        {r.approval_status === 'rejected' && r.rejection_reason && (
                          <p className="text-xs text-destructive">Reason: {r.rejection_reason}</p>
                        )}
                        {isAdmin && r.approval_status !== 'approved' && (
                          <div className="flex gap-2 flex-wrap">
                            <Button size="sm" onClick={() => reviewMerchant(r.id, true)}>Approve &amp; publish</Button>
                            <Button size="sm" variant="destructive" onClick={() => { setRejectTarget(r); setRejectReason(''); }}>Reject</Button>
                          </div>
                        )}
                        {r.parent_merchant_id && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <GitBranch className="h-3 w-3" aria-hidden="true" />
                            Branch of {merchants.find(m => m.id === r.parent_merchant_id)?.name || 'parent'}
                          </Badge>
                        )}
                        <p className="text-sm text-muted-foreground">{r.address}</p>
                        {r.phone && <p className="text-sm text-muted-foreground">{r.phone}</p>}

                        {isAdmin && !r.parent_merchant_id && (
                          <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                            <Label htmlFor={`sub-perm-${r.id}`} className="text-xs text-muted-foreground">Can create sub-merchants</Label>
                            <Switch id={`sub-perm-${r.id}`} checked={!!r.can_create_submerchants} onCheckedChange={v => toggleSubPermission(r.id, v)} aria-label={`Allow ${r.name} to create sub-merchants`} />
                          </div>
                        )}


                        {/* Business type */}
                        <div className="flex items-center gap-2 text-xs">
                          <Tag className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          <span className="text-muted-foreground">
                            Type: {businessTypes.find(bt => bt.id === r.business_type_id)?.name || 'Unassigned'}
                          </span>
                        </div>
                        {isAdmin && businessTypes.length > 0 && (
                          <div className="space-y-1">
                            <Label htmlFor={`biz-type-${r.id}`} className="sr-only">Set business type for {r.name}</Label>
                            <Select
                              value={r.business_type_id || ''}
                              onValueChange={v => assignBusinessType(r.id, v)}
                            >
                              <SelectTrigger id={`biz-type-${r.id}`} className="min-h-[44px] text-xs">
                                <SelectValue placeholder="Set business type" />
                              </SelectTrigger>
                              <SelectContent>
                                {businessTypes.map(bt => (
                                  <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Accountant info */}
                        <div className="flex items-center gap-2 text-xs">
                          <UserCheck className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          <span className="text-muted-foreground">
                            Accountant: {getAccountantName(r.accountant_user_id) || 'Not assigned'}
                          </span>
                        </div>

                        {/* Manager info */}
                        <div className="flex items-center gap-2 text-xs">
                          <UserCheck className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          <span className="text-muted-foreground">
                            Manager: {getManagerName(r.manager_user_id) || 'Not assigned'}
                          </span>
                        </div>

                        {/* Manager assignment (admin only) */}
                        {isAdmin && managerUsers.length > 0 && (
                          <div className="space-y-1">
                            <Label htmlFor={`mgr-${r.id}`} className="sr-only">Assign merchant manager for {r.name}</Label>
                            <Select
                              value={r.manager_user_id || ''}
                              onValueChange={v => assignManager(r.id, v || null)}
                            >
                              <SelectTrigger id={`mgr-${r.id}`} className="min-h-[44px] text-xs">
                                <SelectValue placeholder="Assign merchant manager" />
                              </SelectTrigger>
                              <SelectContent>
                                {managerUsers.map(m => (
                                  <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || m.email}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Accountant assignment (admin only) */}
                        {isAdmin && accountantUsers.length > 0 && (
                          <div className="space-y-1">
                            <Label htmlFor={`acct-${r.id}`} className="sr-only">Assign accountant for {r.name}</Label>
                            <Select
                              value={r.accountant_user_id || ''}
                              onValueChange={v => assignAccountant(r.id, v || null)}
                            >
                              <SelectTrigger id={`acct-${r.id}`} className="min-h-[44px] text-xs">
                                <SelectValue placeholder="Assign accountant" />
                              </SelectTrigger>
                              <SelectContent>
                                {accountantUsers.map(a => (
                                  <SelectItem key={a.user_id} value={a.user_id}>{a.full_name || a.email}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Assigned Riders */}
                        <div className="border-t pt-2">
                          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Truck className="h-3 w-3" aria-hidden="true" />Assigned Riders</p>
                          {(merchantRiders[r.id] || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {(merchantRiders[r.id] || []).map(riderId => (
                                <Badge key={riderId} variant="secondary" className="text-xs gap-1">
                                  {getRiderName(riderId)}
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => unassignRiderFromMerchant(r.id, riderId)}
                                      className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded hover:text-destructive"
                                      aria-label={`Remove rider ${getRiderName(riderId)} from ${r.name}`}
                                    >
                                      <X className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground mb-1">No riders assigned</p>
                          )}
                          {isAdmin && riders.length > 0 && (
                            <div className="space-y-1">
                              <Label htmlFor={`rider-${r.id}`} className="sr-only">Assign rider to {r.name}</Label>
                              <Select key={`${r.id}-${(merchantRiders[r.id] || []).length}`} onValueChange={v => assignRiderToMerchant(r.id, v)}>
                                <SelectTrigger id={`rider-${r.id}`} className="min-h-[44px] text-xs">
                                  <SelectValue placeholder="Assign rider..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {riders.filter(rd => !(merchantRiders[r.id] || []).includes(rd.id)).map(rd => (
                                    <SelectItem key={rd.id} value={rd.id}>
                                      {riderProfiles[rd.user_id]?.full_name || rd.id.slice(0, 8)} – {rd.vehicle_type}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>

                        {/* Tariffs section */}
                        {rTariffs.length > 0 && (
                          <div className="border-t pt-2">
                            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><DollarSign className="h-3 w-3" aria-hidden="true" />Delivery Tariffs</p>
                            <div className="space-y-1">
                              {rTariffs.map(t => (
                                <div key={t.id} className="flex items-center justify-between text-sm gap-2">
                                  <span>{t.location_name}</span>
                                  <div className="flex items-center gap-1">
                                    <Badge variant="outline" className="text-xs tabular-nums">D{Number(t.tariff_amount).toLocaleString()}</Badge>
                                    {(isAdmin || (isManager && r.manager_user_id === user?.id)) && (
                                      <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Edit tariff ${t.location_name}`} onClick={() => {
                                        setEditingTariff(t);
                                        setTariffForm({ location_name: t.location_name, tariff_amount: String(t.tariff_amount) });
                                        setTariffErrors({});
                                        setEditTariffOpen(true);
                                      }}><Edit2 className="h-3 w-3" aria-hidden="true" /></Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {r.approval_status === 'approved' && (
                            <Button size="sm" variant="outline" onClick={() => setQrMerchant(r)}>
                              <QrCode className="h-3 w-3 mr-1" aria-hidden="true" />Store QR
                            </Button>
                          )}
                          {r.can_create_submerchants && !r.parent_merchant_id && r.manager_user_id === user?.id && (
                            <Button size="sm" variant="outline" onClick={() => { setSubParent(r); setSubForm({ name: '', address: '', phone: '', latitude: '', longitude: '' }); setSubErrors({}); setSubOpen(true); }}>
                              <GitBranch className="h-3 w-3 mr-1" aria-hidden="true" />Add Sub-merchant
                            </Button>
                          )}
                          {(isAdmin || (isManager && r.manager_user_id === user?.id)) && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => {
                                setSelectedMerchant(r);
                                setTariffForm({ location_name: '', tariff_amount: '' });
                                setTariffErrors({});
                                setTariffOpen(true);
                              }}>
                                <DollarSign className="h-3 w-3 mr-1" aria-hidden="true" />Set Tariff
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => navigate(`/deliveries/new?merchant=${r.id}`)}>
                                <Truck className="h-3 w-3 mr-1" aria-hidden="true" />Create Delivery
                              </Button>
                            </>
                          )}
                          {isAdmin && (
                            <Button size="sm" variant={r.is_active ? 'destructive' : 'default'} aria-label={`${r.is_active ? 'Deactivate' : 'Activate'} ${r.name}`} onClick={async () => {
                              const { error: deactErr } = await guardedWrite(
                                supabase.from('merchants').update({ is_active: !r.is_active }).eq('id', r.id),
                                { context: r.is_active ? 'Deactivate failed' : 'Activate failed' },
                              );
                              if (deactErr) return;
                              setMerchants(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !r.is_active } : x));
                              toast.success(r.is_active ? 'Deactivated' : 'Activated');
                            }}>
                              {r.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
          {groupPages > 1 && (
            <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
              <span className="text-xs text-muted-foreground" role="status">Page {safePage + 1} of {groupPages} · {totalCount} merchants</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={safePage === 0} aria-label="Previous merchants page" onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={safePage + 1 >= groupPages} aria-label="Next merchants page" onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Tariff Dialog */}
      <Dialog open={tariffOpen} onOpenChange={setTariffOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set Delivery Tariff – {selectedMerchant?.name}</DialogTitle>
            <DialogDescription>Zone tariffs apply to deliveries from this store.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tariff-zone">Location / Zone Name *</Label>
              <Input id="tariff-zone" required aria-required="true" aria-invalid={!!tariffErrors.location_name} aria-describedby={tariffErrors.location_name ? 'tariff-zone-error' : undefined} placeholder="e.g. Lekki, Ikeja, Surulere" value={tariffForm.location_name} onChange={e => setTariffForm(p => ({ ...p, location_name: e.target.value }))} />
              {tariffErrors.location_name && <p id="tariff-zone-error" className="text-xs text-destructive">{tariffErrors.location_name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tariff-amount">Tariff Amount (GMD) *</Label>
              <Input id="tariff-amount" required aria-required="true" type="number" step="0.01" min={0} aria-invalid={!!tariffErrors.tariff_amount} aria-describedby={tariffErrors.tariff_amount ? 'tariff-amount-error' : undefined} value={tariffForm.tariff_amount} onChange={e => setTariffForm(p => ({ ...p, tariff_amount: e.target.value }))} />
              {tariffErrors.tariff_amount && <p id="tariff-amount-error" className="text-xs text-destructive">{tariffErrors.tariff_amount}</p>}
            </div>
            <Button onClick={addTariff} className="w-full">Save Tariff</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Tariff Dialog */}
      <Dialog open={editTariffOpen} onOpenChange={setEditTariffOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Tariff – {editingTariff?.location_name}</DialogTitle>
            <DialogDescription>Stakeholders are notified when a tariff changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tariff-edit-amount">New Tariff Amount (GMD) *</Label>
              <Input id="tariff-edit-amount" required aria-required="true" type="number" step="0.01" min={0} aria-invalid={!!tariffErrors.tariff_amount} aria-describedby={tariffErrors.tariff_amount ? 'tariff-edit-amount-error' : undefined} value={tariffForm.tariff_amount} onChange={e => setTariffForm(p => ({ ...p, tariff_amount: e.target.value }))} />
              {tariffErrors.tariff_amount && <p id="tariff-edit-amount-error" className="text-xs text-destructive">{tariffErrors.tariff_amount}</p>}
            </div>
            <Button onClick={updateTariff} className="w-full">Update Tariff</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Sub-merchant Dialog */}
      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Sub-merchant under {subParent?.name}</DialogTitle>
            <DialogDescription>The branch goes live immediately and inherits the parent's business type. You stay its manager.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sub-name">Name *</Label>
              <Input id="sub-name" required aria-required="true" aria-invalid={!!subErrors.name} aria-describedby={subErrors.name ? 'sub-name-error' : undefined} value={subForm.name} onChange={e => setSubForm(p => ({ ...p, name: e.target.value }))} />
              {subErrors.name && <p id="sub-name-error" className="text-xs text-destructive">{subErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-address">Address *</Label>
              <Input id="sub-address" required aria-required="true" aria-invalid={!!subErrors.address} aria-describedby={subErrors.address ? 'sub-address-error' : undefined} value={subForm.address} onChange={e => setSubForm(p => ({ ...p, address: e.target.value }))} />
              {subErrors.address && <p id="sub-address-error" className="text-xs text-destructive">{subErrors.address}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-phone">Phone</Label>
              <Input id="sub-phone" type="tel" autoComplete="tel" value={subForm.phone} onChange={e => setSubForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sub-lat">Latitude</Label>
                <Input id="sub-lat" type="number" step="any" placeholder={subParent?.latitude ?? ''} value={subForm.latitude} onChange={e => setSubForm(p => ({ ...p, latitude: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-lng">Longitude</Label>
                <Input id="sub-lng" type="number" step="any" placeholder={subParent?.longitude ?? ''} value={subForm.longitude} onChange={e => setSubForm(p => ({ ...p, longitude: e.target.value }))} />
              </div>
            </div>
            <Button onClick={createSubMerchant} className="w-full">Create Sub-merchant</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Sub-merchant Dialog (accessible replacement for native prompt) */}
      <AlertDialog open={!!rejectTarget} onOpenChange={v => { if (!v) setRejectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {rejectTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The store stays hidden until approved. Add a reason so the manager knows what to fix.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Rejection reason</Label>
            <Textarea
              id="reject-reason"
              placeholder="e.g. address could not be verified"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { reviewMerchant(rejectTarget.id, false, rejectReason.trim() || undefined); setRejectTarget(null); }}
            >
              Reject store
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {qrMerchant && (
        <StoreQrDialog
          open={!!qrMerchant}
          onOpenChange={v => { if (!v) setQrMerchant(null); }}
          merchantId={qrMerchant.id}
          merchantName={qrMerchant.name}
        />
      )}
    </div>

  );
}
