import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { UserPlus, Users, Search, Bike, Car, MoreVertical, Plus, X } from 'lucide-react';

export default function RidersPage() {
  const [riders, setRiders] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [fuelVariants, setFuelVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('');
  const [vehicleType, setVehicleType] = useState('motorcycle');
  const [licensePlate, setLicensePlate] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState('');

  const load = async () => {
    const { data: ridersData } = await supabase.from('riders').select('*');
    const { data: profilesData } = await supabase.from('profiles').select('user_id, full_name, email');
    const { data: merchantsData } = await supabase.from('merchants').select('id, name').eq('is_active', true);
    const { data: assignmentsData } = await supabase.from('merchant_riders').select('rider_id, merchant_id');
    const { data: variantsData } = await supabase.from('fuel_variants').select('id, fuel_type, is_active, is_default').eq('is_active', true).order('is_default', { ascending: false }).order('fuel_type');
    const profileMap = Object.fromEntries((profilesData || []).map(p => [p.user_id, p]));
    const assignmentMap: Record<string, string[]> = {};
    (assignmentsData || []).forEach(a => {
      if (!assignmentMap[a.rider_id]) assignmentMap[a.rider_id] = [];
      assignmentMap[a.rider_id].push(a.merchant_id);
    });
    const restMap = Object.fromEntries((merchantsData || []).map(r => [r.id, r.name]));
    setRiders((ridersData || []).map(r => ({
      ...r,
      profile: profileMap[r.user_id] || null,
      assignedMerchantIds: assignmentMap[r.id] || [],
      merchantNames: (assignmentMap[r.id] || []).map(id => restMap[id]).filter(Boolean),
    })));
    setMerchants(merchantsData || []);
    setFuelVariants(variantsData || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('riders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_riders' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const createRider = async () => {
    const { data: profile } = await supabase.from('profiles').select('user_id').eq('email', email).single();
    if (!profile) { toast.error('User not found. They must sign up first.'); return; }
    const { data: newRider, error } = await (supabase.from('riders').insert({
      user_id: profile.user_id, vehicle_type: vehicleType, license_plate: licensePlate,
    } as any).select('id').single());
    if (error) { toast.error(error.message); return; }
    await supabase.from('user_roles').insert({ user_id: profile.user_id, role: 'rider' as any });
    if (selectedMerchant && newRider) {
      await supabase.from('merchant_riders').insert({ merchant_id: selectedMerchant, rider_id: newRider.id });
    }
    toast.success('Rider created');
    setOpen(false);
    setEmail(''); setLicensePlate(''); setSelectedMerchant('');
    load();
  };

  const assignMerchant = async (riderId: string, merchantId: string) => {
    const { error } = await supabase.from('merchant_riders').insert({ merchant_id: merchantId, rider_id: riderId });
    if (error) {
      if (error.code === '23505') toast.error('Already assigned');
      else toast.error(error.message);
      return;
    }
    toast.success('Merchant assigned');
    load();
  };

  const unassignMerchant = async (riderId: string, merchantId: string) => {
    await supabase.from('merchant_riders').delete().eq('rider_id', riderId).eq('merchant_id', merchantId);
    toast.success('Merchant removed');
    load();
  };

  const vehicleIcon = (type: string) => {
    if (type === 'car') return <Car className="h-4 w-4" />;
    return <Bike className="h-4 w-4" />;
  };

  const filtered = riders.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.profile?.full_name?.toLowerCase().includes(q) ||
      r.profile?.email?.toLowerCase().includes(q) ||
      r.license_plate?.toLowerCase().includes(q) ||
      r.rider_code?.toLowerCase().includes(q));
  });

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Riders</h1>
          <p className="text-muted-foreground">{riders.length} registered • {riders.filter(r => r.is_online).length} online</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search riders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-48" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><UserPlus className="h-4 w-4 mr-2" />Add Rider</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Rider</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>User Email</Label><Input placeholder="rider@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Vehicle Type</Label>
                  <Select value={vehicleType} onValueChange={setVehicleType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="motorcycle">Motorcycle</SelectItem>
                      <SelectItem value="bicycle">Bicycle</SelectItem>
                      <SelectItem value="car">Car</SelectItem>
                      <SelectItem value="scooter">Scooter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assign to Merchant</Label>
                  <Select value={selectedMerchant} onValueChange={setSelectedMerchant}>
                    <SelectTrigger><SelectValue placeholder="Select merchant" /></SelectTrigger>
                    <SelectContent>
                      {merchants.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>License Plate</Label><Input value={licensePlate} onChange={e => setLicensePlate(e.target.value)} /></div>
                <Button onClick={createRider} className="w-full">Create Rider</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(r => {
          const unassignedMerchants = merchants.filter(rest => !r.assignedMerchantIds.includes(rest.id));
          return (
            <Card key={r.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${r.is_online ? 'bg-accent/10' : 'bg-muted'}`}>
                      {vehicleIcon(r.vehicle_type)}
                    </div>
                    <div>
                      <span className="font-medium">{r.profile?.full_name || 'Unknown'}</span>
                      <p className="text-xs text-muted-foreground">{r.profile?.email}</p>
                      <p className="text-xs font-mono text-primary">{r.rider_code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
                      {r.is_online && <Badge className="bg-accent/10 text-accent border-accent/20 text-xs">Online</Badge>}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground capitalize">
                  {r.vehicle_type} {r.license_plate && `• ${r.license_plate}`}
                </div>
                {r.merchantNames?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.assignedMerchantIds.map((restId: string, i: number) => {
                      const restName = merchants.find(x => x.id === restId)?.name;
                      if (!restName) return null;
                      return (
                        <Badge key={i} variant="outline" className="text-xs gap-1 pr-1">
                          {restName}
                          <button onClick={() => unassignMerchant(r.id, restId)} className="ml-0.5 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                {unassignedMerchants.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs gap-1">
                        <Plus className="h-3 w-3" /> Assign Merchant
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {unassignedMerchants.map(rest => (
                        <DropdownMenuItem key={rest.id} onClick={() => assignMerchant(r.id, rest.id)}>
                          {rest.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {r.last_location_update && (
                  <p className="text-xs text-muted-foreground mt-1">Last seen: {new Date(r.last_location_update).toLocaleString()}</p>
                )}
                {fuelVariants.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground shrink-0">Fuel</Label>
                    <Select
                      value={r.fuel_variant_id || 'none'}
                      onValueChange={async (v) => {
                        const newVal = v === 'none' ? null : v;
                        const { error } = await supabase.from('riders').update({ fuel_variant_id: newVal }).eq('id', r.id);
                        if (error) { toast.error(error.message); return; }
                        setRiders(prev => prev.map(x => x.id === r.id ? { ...x, fuel_variant_id: newVal } : x));
                        toast.success('Fuel variant updated');
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Use default" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Use default</SelectItem>
                        {fuelVariants.map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.fuel_type}{v.is_default ? ' (default)' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="mt-3">
                  <Button size="sm" variant={r.is_active ? 'destructive' : 'default'} onClick={async () => {
                    await supabase.from('riders').update({ is_active: !r.is_active }).eq('id', r.id);
                    setRiders(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !r.is_active } : x));
                    toast.success(r.is_active ? 'Rider deactivated' : 'Rider activated');
                  }}>
                    {r.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-10 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>{search ? 'No riders match your search' : 'No riders yet'}</p>
          </div>
        )}
      </div>
    </div>
  );
}