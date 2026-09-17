import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Building2, Plus, DollarSign, Truck, Edit2, UserCheck, Tag, QrCode, GitBranch } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import StoreQrDialog from '@/components/StoreQrDialog';
import { useAuth } from '@/hooks/useAuth';

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
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [editTariffOpen, setEditTariffOpen] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState<any>(null);
  const [editingTariff, setEditingTariff] = useState<any>(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', latitude: '', longitude: '', business_type_id: '' });
  const [tariffForm, setTariffForm] = useState({ location_name: '', tariff_amount: '' });
  const [deliveryForm, setDeliveryForm] = useState({
    pickup_address: '', dropoff_address: '', order_reference: '',
    rider_id: '', tariff_id: '', customer_name: '', customer_phone: '',
  });
  const [qrMerchant, setQrMerchant] = useState<any>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [subParent, setSubParent] = useState<any>(null);
  const [subForm, setSubForm] = useState({ name: '', address: '', phone: '', latitude: '', longitude: '' });

  const isAdmin = hasRole('admin');
  const isManager = hasRole('company_manager');

  const load = async () => {
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
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('merchants-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_tariffs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_riders' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const createMerchant = async () => {
    if (!form.business_type_id) { toast.error('Please select a business type'); return; }
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
    if (!subForm.name.trim() || !subForm.address.trim()) { toast.error('Name and address are required'); return; }
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
    load();
  };



  const addTariff = async () => {
    if (!selectedMerchant || !user) return;
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
    load();
  };

  const updateTariff = async () => {
    if (!editingTariff) return;
    const { error } = await supabase.from('merchant_tariffs').update({
      tariff_amount: parseFloat(tariffForm.tariff_amount),
    }).eq('id', editingTariff.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Tariff updated – stakeholders notified');
    setEditTariffOpen(false);
    setEditingTariff(null);
    setTariffForm({ location_name: '', tariff_amount: '' });
    load();
  };

  const createDelivery = async () => {
    if (!selectedMerchant) return;
    if (!deliveryForm.rider_id) {
      toast.error('Please assign a rider');
      return;
    }
    const customerName = deliveryForm.customer_name.trim();
    const customerPhone = deliveryForm.customer_phone.trim();
    if (!customerName) { toast.error('Customer name is required'); return; }
    if (!/^[+\d][\d\s\-]{6,19}$/.test(customerPhone)) { toast.error('Enter a valid customer phone number'); return; }
    const selectedTariff = tariffs.find(t => t.id === deliveryForm.tariff_id);
    const { error } = await supabase.from('deliveries').insert({
      merchant_id: selectedMerchant.id,
      pickup_address: deliveryForm.pickup_address || selectedMerchant.address,
      dropoff_address: deliveryForm.dropoff_address,
      order_reference: deliveryForm.order_reference || null,
      rider_id: deliveryForm.rider_id,
      customer_name: customerName,
      customer_phone: customerPhone,
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
      estimated_tariff: selectedTariff ? selectedTariff.tariff_amount : null,
      pickup_latitude: selectedMerchant.latitude,
      pickup_longitude: selectedMerchant.longitude,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Delivery created & dispatched to rider');
    setDeliveryOpen(false);
    setDeliveryForm({ pickup_address: '', dropoff_address: '', order_reference: '', rider_id: '', tariff_id: '', customer_name: '', customer_phone: '' });
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

  const merchantTariffs = (id: string) => tariffs.filter(t => t.merchant_id === id);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Merchants</h1>
          <p className="text-muted-foreground">Manage partner merchants & tariffs</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Merchant</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Merchant</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Business Type *</Label>
                  <Select value={form.business_type_id} onValueChange={v => setForm(p => ({ ...p, business_type_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger>
                    <SelectContent>
                      {businessTypes.map(bt => (
                        <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {businessTypes.length === 0 && (
                    <p className="text-xs text-muted-foreground">No business types yet. Create one under "Business Types".</p>
                  )}
                </div>
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Latitude</Label><Input type="number" step="any" value={form.latitude} onChange={e => setForm(p => ({ ...p, latitude: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Longitude</Label><Input type="number" step="any" value={form.longitude} onChange={e => setForm(p => ({ ...p, longitude: e.target.value }))} /></div>
                </div>
                <Button onClick={createMerchant} className="w-full">Add Merchant</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-sm">Filter by business type:</Label>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-56 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Business Types</SelectItem>
            {businessTypes.map(bt => <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>)}
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(() => {
        const myIds = merchants.filter(r => r.manager_user_id === user?.id).map(r => r.id);
        const baseList = (isAdmin ? merchants : merchants.filter(r => r.manager_user_id === user?.id || (r.parent_merchant_id && myIds.includes(r.parent_merchant_id))));
        const filtered = filterType === 'all' ? baseList
          : filterType === 'unassigned' ? baseList.filter(c => !c.business_type_id)
          : baseList.filter(c => c.business_type_id === filterType);
        const groups: { id: string; name: string; items: any[] }[] = [];
        businessTypes.forEach(bt => {
          const items = filtered.filter(c => c.business_type_id === bt.id);
          if (items.length) groups.push({ id: bt.id, name: bt.name, items });
        });
        const unassigned = filtered.filter(c => !c.business_type_id);
        if (unassigned.length) groups.push({ id: 'unassigned', name: 'Unassigned', items: unassigned });
        if (groups.length === 0) {
          return (
            <div className="text-center py-10 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No merchants to show</p>
            </div>
          );
        }
        return groups.map(group => (
          <section key={group.id} className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{group.name}</h2>
              <Badge variant="secondary">{group.items.length}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map(r => {
          const rTariffs = merchantTariffs(r.id);
          return (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{r.name}</span>
                  <div className="flex items-center gap-1">
                    {r.approval_status === 'pending' && <Badge variant="outline">Pending review</Badge>}
                    {r.approval_status === 'rejected' && <Badge variant="destructive">Rejected</Badge>}
                    <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                </div>
                {r.approval_status === 'rejected' && r.rejection_reason && (
                  <p className="text-xs text-destructive">Reason: {r.rejection_reason}</p>
                )}
                {isAdmin && r.approval_status !== 'approved' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => reviewMerchant(r.id, true)}>Approve &amp; publish</Button>
                    <Button size="sm" variant="destructive" onClick={() => {
                      const reason = window.prompt('Reason for rejecting this store?') || undefined;
                      reviewMerchant(r.id, false, reason);
                    }}>Reject</Button>
                  </div>
                )}
                {r.parent_merchant_id && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <GitBranch className="h-3 w-3" />
                    Branch of {merchants.find(m => m.id === r.parent_merchant_id)?.name || 'parent'}
                  </Badge>
                )}
                <p className="text-sm text-muted-foreground">{r.address}</p>
                {r.phone && <p className="text-sm text-muted-foreground">{r.phone}</p>}

                {isAdmin && !r.parent_merchant_id && (
                  <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
                    <span className="text-xs text-muted-foreground">Can create sub-merchants</span>
                    <Switch checked={!!r.can_create_submerchants} onCheckedChange={v => toggleSubPermission(r.id, v)} />
                  </div>
                )}


                {/* Business type */}
                <div className="flex items-center gap-2 text-xs">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Type: {businessTypes.find(bt => bt.id === r.business_type_id)?.name || 'Unassigned'}
                  </span>
                </div>
                {isAdmin && businessTypes.length > 0 && (
                  <Select
                    value={r.business_type_id || ''}
                    onValueChange={v => assignBusinessType(r.id, v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Set business type" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessTypes.map(bt => (
                        <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Accountant info */}
                <div className="flex items-center gap-2 text-xs">
                  <UserCheck className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Accountant: {getAccountantName(r.accountant_user_id) || 'Not assigned'}
                  </span>
                </div>

                {/* Manager info */}
                <div className="flex items-center gap-2 text-xs">
                  <UserCheck className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Manager: {getManagerName(r.manager_user_id) || 'Not assigned'}
                  </span>
                </div>

                {/* Manager assignment (admin only) */}
                {isAdmin && managerUsers.length > 0 && (
                  <Select
                    value={r.manager_user_id || ''}
                    onValueChange={v => assignManager(r.id, v || null)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Assign merchant manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {managerUsers.map(m => (
                        <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || m.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Accountant assignment (admin only) */}
                {isAdmin && accountantUsers.length > 0 && (
                  <Select
                    value={r.accountant_user_id || ''}
                    onValueChange={v => assignAccountant(r.id, v || null)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Assign accountant" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountantUsers.map(a => (
                        <SelectItem key={a.user_id} value={a.user_id}>{a.full_name || a.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Assigned Riders */}
                <div className="border-t pt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Truck className="h-3 w-3" />Assigned Riders</p>
                  {(merchantRiders[r.id] || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {(merchantRiders[r.id] || []).map(riderId => (
                        <Badge key={riderId} variant="secondary" className="text-xs gap-1">
                          {getRiderName(riderId)}
                          {isAdmin && (
                            <button onClick={() => unassignRiderFromMerchant(r.id, riderId)} className="ml-1 hover:text-destructive">×</button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mb-1">No riders assigned</p>
                  )}
                  {isAdmin && riders.length > 0 && (
                    <Select onValueChange={v => assignRiderToMerchant(r.id, v)}>
                      <SelectTrigger className="h-8 text-xs">
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
                  )}
                </div>

                {/* Tariffs section */}
                {rTariffs.length > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><DollarSign className="h-3 w-3" />Delivery Tariffs</p>
                    <div className="space-y-1">
                      {rTariffs.map(t => (
                        <div key={t.id} className="flex items-center justify-between text-sm">
                          <span>{t.location_name}</span>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline">D{Number(t.tariff_amount).toLocaleString()}</Badge>
                            {(isAdmin || (isManager && r.manager_user_id === user?.id)) && (
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                                setEditingTariff(t);
                                setTariffForm({ location_name: t.location_name, tariff_amount: String(t.tariff_amount) });
                                setEditTariffOpen(true);
                              }}><Edit2 className="h-3 w-3" /></Button>
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
                      <QrCode className="h-3 w-3 mr-1" />Store QR
                    </Button>
                  )}
                  {r.can_create_submerchants && !r.parent_merchant_id && r.manager_user_id === user?.id && (
                    <Button size="sm" variant="outline" onClick={() => { setSubParent(r); setSubForm({ name: '', address: '', phone: '', latitude: '', longitude: '' }); setSubOpen(true); }}>
                      <GitBranch className="h-3 w-3 mr-1" />Add Sub-merchant
                    </Button>
                  )}
                  {(isAdmin || (isManager && r.manager_user_id === user?.id)) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => {
                        setSelectedMerchant(r);
                        setTariffForm({ location_name: '', tariff_amount: '' });
                        setTariffOpen(true);
                      }}>
                        <DollarSign className="h-3 w-3 mr-1" />Set Tariff
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        setSelectedMerchant(r);
                        setDeliveryForm({ pickup_address: r.address, dropoff_address: '', order_reference: '', rider_id: '', tariff_id: '', customer_name: '', customer_phone: '' });
                        setDeliveryOpen(true);
                      }}>
                        <Truck className="h-3 w-3 mr-1" />Create Delivery
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant={r.is_active ? 'destructive' : 'default'} onClick={async () => {
                      await supabase.from('merchants').update({ is_active: !r.is_active }).eq('id', r.id);
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
        ));
      })()}

      {/* Add Tariff Dialog */}
      <Dialog open={tariffOpen} onOpenChange={setTariffOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Delivery Tariff – {selectedMerchant?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Location / Zone Name</Label><Input placeholder="e.g. Lekki, Ikeja, Surulere" value={tariffForm.location_name} onChange={e => setTariffForm(p => ({ ...p, location_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Tariff Amount (GMD)</Label><Input type="number" step="0.01" value={tariffForm.tariff_amount} onChange={e => setTariffForm(p => ({ ...p, tariff_amount: e.target.value }))} /></div>
            <Button onClick={addTariff} className="w-full">Save Tariff</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Tariff Dialog */}
      <Dialog open={editTariffOpen} onOpenChange={setEditTariffOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Tariff – {editingTariff?.location_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>New Tariff Amount (GMD)</Label><Input type="number" step="0.01" value={tariffForm.tariff_amount} onChange={e => setTariffForm(p => ({ ...p, tariff_amount: e.target.value }))} /></div>
            <Button onClick={updateTariff} className="w-full">Update Tariff</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Delivery Dialog */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Delivery – {selectedMerchant?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Pickup Address</Label><Input value={deliveryForm.pickup_address} onChange={e => setDeliveryForm(p => ({ ...p, pickup_address: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Drop-off Address</Label><Input value={deliveryForm.dropoff_address} onChange={e => setDeliveryForm(p => ({ ...p, dropoff_address: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Customer Name *</Label><Input required value={deliveryForm.customer_name} onChange={e => setDeliveryForm(p => ({ ...p, customer_name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Customer Phone *</Label><Input required type="tel" inputMode="tel" maxLength={20} placeholder="+220…" value={deliveryForm.customer_phone} onChange={e => setDeliveryForm(p => ({ ...p, customer_phone: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Order Reference</Label><Input value={deliveryForm.order_reference} onChange={e => setDeliveryForm(p => ({ ...p, order_reference: e.target.value }))} /></div>

            {/* Tariff selection */}
            {selectedMerchant && merchantTariffs(selectedMerchant.id).length > 0 && (
              <div className="space-y-2">
                <Label>Delivery Tariff</Label>
                <Select value={deliveryForm.tariff_id} onValueChange={v => setDeliveryForm(p => ({ ...p, tariff_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select tariff zone" /></SelectTrigger>
                  <SelectContent>
                    {merchantTariffs(selectedMerchant.id).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.location_name} – D{Number(t.tariff_amount).toLocaleString()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Rider assignment — only riders assigned to this merchant */}
            <div className="space-y-2">
              <Label>Assign Rider *</Label>
              {selectedMerchant && (merchantRiders[selectedMerchant.id] || []).length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-md p-2">
                  No riders are assigned to this merchant yet. Ask an admin to assign riders.
                </p>
              ) : (
                <Select value={deliveryForm.rider_id} onValueChange={v => setDeliveryForm(p => ({ ...p, rider_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select rider" /></SelectTrigger>
                  <SelectContent>
                    {riders
                      .filter(r => selectedMerchant ? (merchantRiders[selectedMerchant.id] || []).includes(r.id) : true)
                      .map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {riderProfiles[r.user_id]?.full_name || r.id.slice(0, 8)} – {r.vehicle_type}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button onClick={createDelivery} className="w-full">Create Delivery</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Sub-merchant Dialog */}
      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Sub-merchant under {subParent?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={subForm.name} onChange={e => setSubForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Address *</Label><Input value={subForm.address} onChange={e => setSubForm(p => ({ ...p, address: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={subForm.phone} onChange={e => setSubForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Latitude</Label><Input type="number" step="any" placeholder={subParent?.latitude ?? ''} value={subForm.latitude} onChange={e => setSubForm(p => ({ ...p, latitude: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Longitude</Label><Input type="number" step="any" placeholder={subParent?.longitude ?? ''} value={subForm.longitude} onChange={e => setSubForm(p => ({ ...p, longitude: e.target.value }))} /></div>
            </div>
            <p className="text-xs text-muted-foreground">The branch goes live immediately and inherits the parent's business type. You stay its manager.</p>
            <Button onClick={createSubMerchant} className="w-full">Create Sub-merchant</Button>
          </div>
        </DialogContent>
      </Dialog>

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
