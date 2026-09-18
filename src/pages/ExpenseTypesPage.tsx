import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Fuel, Plus, Pencil, CheckCircle2, XCircle, Clock, Trash2, Star } from 'lucide-react';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableCaption, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ExpenseType {
  id: string;
  name: string;
  applies_to: string;
  is_fuel: boolean;
  fuel_type: string | null;
  price_per_litre: number | null;
  cost_per_mile: number;
  is_active: boolean;
  amortize_over: number | null;
  is_maintenance: boolean;
}

interface FuelVariant {
  id: string;
  expense_type_id: string;
  fuel_type: string;
  price_per_litre: number | null;
  cost_per_mile: number;
  is_active: boolean;
  is_default: boolean;
}

interface TypeRowProps {
  type: ExpenseType;
  variants: FuelVariant[];
  isAdmin: boolean;
  isAccountant: boolean;
  onEdit: (t: ExpenseType) => void;
  onDelete: (t: ExpenseType) => void;
  onVariantEdit: (v: FuelVariant) => void;
  onVariantDelete: (v: FuelVariant) => void;
  onVariantCreate: (t: ExpenseType) => void;
}

function TypeRow({
  type,
  variants,
  isAdmin,
  isAccountant,
  onEdit,
  onDelete,
  onVariantEdit,
  onVariantDelete,
  onVariantCreate,
}: TypeRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasVariants = variants.length > 0;

  return (
    <>
      <TableRow key={type.id}>
        <TableCell className="font-medium flex items-center gap-2">
          {type.is_fuel && <Fuel className="h-4 w-4 text-primary" aria-hidden="true" />}
          {type.name}
        </TableCell>
        <TableCell>
          <span className="flex items-center gap-1">
            {type.is_fuel ? (
              <Badge variant="outline" className="gap-1"><Fuel className="h-3 w-3" aria-hidden="true" />Fuel</Badge>
            ) : type.is_maintenance ? (
              <Badge variant="outline" className="text-xs">Maintenance</Badge>
            ) : (
              <Badge variant="secondary">General</Badge>
            )}
          </span>
        </TableCell>
        <TableCell>{type.applies_to}</TableCell>
        <TableCell className="text-center">
          {type.is_fuel ? '—' : type.amortize_over ? (
            <Badge variant="outline" className="text-xs">over {type.amortize_over} deliveries</Badge>
          ) : (
            <Badge variant="secondary">immediate</Badge>
          )}
        </TableCell>
        <TableCell>
          {type.is_active ? (
            <Badge className="bg-success/10 text-success border-success/30 gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Active</Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {hasVariants && (
              <Button size="sm" variant="ghost" className="min-h-[44px] gap-1" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} variants for ${type.name}`}>
                <Star className="h-3.5 w-3.5" aria-hidden="true" /> {expanded ? 'Hide' : 'Show'} variants
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => onEdit(type)} className="min-h-[44px] gap-1"><Pencil className="h-3 w-3 mr-1" aria-hidden="true" />Edit</Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" className="text-destructive min-h-[44px] gap-1" onClick={() => onDelete(type)}><Trash2 className="h-3 w-3 mr-1" aria-hidden="true" />Delete</Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {type.is_fuel && hasVariants && expanded && (
        <TableRow>
          <TableCell colSpan={6} className="py-0">
            <div className="space-y-1 px-4 py-2 border-t bg-muted/20">
              {variants.map(v => (
                <div key={v.id} className="flex items-center justify-between gap-3 p-2 rounded border bg-background">
                  <div className="grid grid-cols-5 gap-3 flex-1 text-sm">
                    <div className="flex items-center gap-1 font-medium">
                      {v.is_default && <Star className="h-3 w-3 fill-primary text-primary" aria-hidden="true" />}
                      {v.fuel_type}
                      {!v.is_active && <Badge variant="secondary" className="text-[11px] px-1">off</Badge>}
                    </div>
                    <div className="text-right tabular-nums"><span className="text-xs text-muted-foreground">D</span>{v.price_per_litre ?? '—'}<span className="text-xs text-muted-foreground">/L</span></div>
                    <div className="text-right tabular-nums"><span className="text-xs text-muted-foreground">D</span>{v.cost_per_mile}<span className="text-xs text-muted-foreground">/mi</span></div>
                    <div className="text-center text-xs text-muted-foreground">{v.is_default ? 'default' : '—'}</div>
                    <div className="text-right">
                      {(isAdmin || isAccountant) && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 min-h-[44px]" onClick={() => onVariantEdit(v)} aria-label={`Edit ${v.fuel_type} variant`}>
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                          </Button>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive min-h-[44px]" onClick={() => onVariantDelete(v)} aria-label={`Delete ${v.fuel_type} variant`}>
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isAdmin && (
                <Button size="sm" variant="ghost" className="mt-2 text-xs" onClick={() => onVariantCreate(type)}>
                  <Plus className="h-3 w-3 mr-1" aria-hidden="true" />Add variant
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

interface FuelVariant {
  id: string;
  expense_type_id: string;
  fuel_type: string;
  price_per_litre: number | null;
  cost_per_mile: number;
  is_active: boolean;
  is_default: boolean;
}

interface FuelChange {
  id: string;
  expense_type_id: string;
  fuel_variant_id: string | null;
  old_price_per_litre: number | null;
  new_price_per_litre: number | null;
  old_fuel_type: string | null;
  new_fuel_type: string | null;
  old_cost_per_mile: number | null;
  new_cost_per_mile: number | null;
  requested_by: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}

export default function ExpenseTypesPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const isAccountant = hasRole('accountant');
  const [types, setTypes] = useState<ExpenseType[]>([]);
  const [variants, setVariants] = useState<FuelVariant[]>([]);
  const [changes, setChanges] = useState<FuelChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ExpenseType | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingType, setDeletingType] = useState<ExpenseType | null>(null);
  const [deletingChange, setDeletingChange] = useState<FuelChange | null>(null);
  const [form, setForm] = useState({ name: '', applies_to: 'rider', is_fuel: false, is_active: true, is_maintenance: false, amortize_over: '' as string });

  // Variant dialog state
  const [variantEditing, setVariantEditing] = useState<FuelVariant | null>(null);
  const [variantCreatingForType, setVariantCreatingForType] = useState<ExpenseType | null>(null);
  const [variantDeleting, setVariantDeleting] = useState<FuelVariant | null>(null);
  const [vForm, setVForm] = useState({ fuel_type: '', price_per_litre: '', cost_per_mile: '5', is_active: true, is_default: false });

  const load = async () => {
    const [tRes, vRes, cRes] = await Promise.all([
      supabase.from('expense_types').select('*').order('is_fuel', { ascending: false }).order('name'),
      supabase.from('fuel_variants').select('*').order('is_default', { ascending: false }).order('fuel_type'),
      supabase.from('fuel_price_changes').select('*').order('created_at', { ascending: false }),
    ]);
    setTypes((tRes.data as ExpenseType[]) || []);
    setVariants((vRes.data as FuelVariant[]) || []);
    setChanges((cRes.data as FuelChange[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (t: ExpenseType) => {
    setEditing(t);
    setForm({ name: t.name, applies_to: t.applies_to, is_fuel: t.is_fuel, is_active: t.is_active, is_maintenance: t.is_maintenance, amortize_over: t.amortize_over?.toString() || '' });
  };
  const openCreate = () => {
    setCreating(true);
    setForm({ name: '', applies_to: 'rider', is_fuel: false, is_active: true, is_maintenance: false, amortize_over: '50' });
  };
  const closeDialog = () => { setEditing(null); setCreating(false); };

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    const payload: Partial<ExpenseType> = {
      name: form.name.trim(), applies_to: form.applies_to,
      is_fuel: form.is_fuel, is_active: form.is_active,
      is_maintenance: form.is_maintenance,
      amortize_over: form.is_fuel ? null : (form.amortize_over ? parseInt(form.amortize_over) : null),
    };

    if (creating) {
      if (!isAdmin) { toast.error('Only admin can create types'); return; }
      const { error } = await supabase.from('expense_types').insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success('Expense type created');
      closeDialog(); load();
      return;
    }
    if (!editing) return;
    const { error } = await supabase.from('expense_types').update(payload).eq('id', editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Updated');
    closeDialog(); load();
  };

  // Variants
  const openVariantCreate = (parent: ExpenseType) => {
    setVariantCreatingForType(parent);
    setVForm({ fuel_type: '', price_per_litre: '', cost_per_mile: '5', is_active: true, is_default: false });
  };
  const openVariantEdit = (v: FuelVariant) => {
    setVariantEditing(v);
    setVForm({
      fuel_type: v.fuel_type,
      price_per_litre: v.price_per_litre?.toString() || '',
      cost_per_mile: v.cost_per_mile?.toString() || '5',
      is_active: v.is_active,
      is_default: v.is_default,
    });
  };
  const closeVariantDialog = () => { setVariantEditing(null); setVariantCreatingForType(null); };

  const submitVariant = async () => {
    if (!vForm.fuel_type.trim()) { toast.error('Fuel type name required'); return; }
    const payload: Partial<FuelVariant> = {
      fuel_type: vForm.fuel_type.trim(),
      price_per_litre: vForm.price_per_litre ? parseFloat(vForm.price_per_litre) : null,
      cost_per_mile: parseFloat(vForm.cost_per_mile || '0'),
      is_active: vForm.is_active,
      is_default: vForm.is_default,
    };

    if (variantCreatingForType) {
      if (!isAdmin) { toast.error('Only admin can add variants'); return; }
      // Unset previous default if marking new one
      if (payload.is_default) {
        await supabase.from('fuel_variants').update({ is_default: false }).eq('expense_type_id', variantCreatingForType.id);
      }
      const { error } = await supabase.from('fuel_variants').insert({ ...payload, expense_type_id: variantCreatingForType.id });
      if (error) { toast.error(error.message); return; }
      toast.success('Fuel variant added');
      closeVariantDialog(); load();
      return;
    }

    if (!variantEditing) return;

    // Accountant edits → maker-checker
    if (isAccountant && !isAdmin) {
      const { error } = await supabase.from('fuel_price_changes').insert({
        expense_type_id: variantEditing.expense_type_id,
        fuel_variant_id: variantEditing.id,
        old_price_per_litre: variantEditing.price_per_litre,
        new_price_per_litre: payload.price_per_litre,
        old_fuel_type: variantEditing.fuel_type,
        new_fuel_type: payload.fuel_type,
        old_cost_per_mile: variantEditing.cost_per_mile,
        new_cost_per_mile: payload.cost_per_mile,
        requested_by: user!.id,
        status: 'pending',
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Change submitted for admin approval');
      closeVariantDialog(); load();
      return;
    }

    // Admin: apply immediately
    if (payload.is_default && !variantEditing.is_default) {
      await supabase.from('fuel_variants').update({ is_default: false }).eq('expense_type_id', variantEditing.expense_type_id);
    }
    const { error } = await supabase.from('fuel_variants').update(payload).eq('id', variantEditing.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Variant updated');
    closeVariantDialog(); load();
  };

  const confirmDeleteVariant = async () => {
    if (!variantDeleting) return;
    const { error } = await supabase.from('fuel_variants').delete().eq('id', variantDeleting.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Variant deleted');
    setVariantDeleting(null); load();
  };

  const approve = async (c: FuelChange) => {
    if (c.fuel_variant_id) {
      const { error: upErr } = await supabase.from('fuel_variants').update({
        price_per_litre: c.new_price_per_litre,
        fuel_type: c.new_fuel_type ?? undefined,
        cost_per_mile: c.new_cost_per_mile ?? 5,
      }).eq('id', c.fuel_variant_id);
      if (upErr) { toast.error(upErr.message); return; }
    } else {
      // Legacy: applied against expense_types row
      const { error: upErr } = await supabase.from('expense_types').update({
        price_per_litre: c.new_price_per_litre,
        fuel_type: c.new_fuel_type,
        cost_per_mile: c.new_cost_per_mile ?? 5,
      }).eq('id', c.expense_type_id);
      if (upErr) { toast.error(upErr.message); return; }
    }
    await supabase.from('fuel_price_changes').update({
      status: 'approved', reviewed_by: user!.id, reviewed_at: new Date().toISOString(),
    }).eq('id', c.id);
    toast.success('Approved & applied');
    load();
  };
  const reject = async (c: FuelChange) => {
    await supabase.from('fuel_price_changes').update({
      status: 'rejected', reviewed_by: user!.id, reviewed_at: new Date().toISOString(),
    }).eq('id', c.id);
    toast.success('Rejected');
    load();
  };

  const confirmDeleteType = async () => {
    if (!deletingType) return;
    const { error } = await supabase.from('expense_types').delete().eq('id', deletingType.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Expense type deleted');
    setDeletingType(null); load();
  };
  const confirmDeleteChange = async () => {
    if (!deletingChange) return;
    const { error } = await supabase.from('fuel_price_changes').delete().eq('id', deletingChange.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Request deleted');
    setDeletingChange(null); load();
  };

  const pendingChanges = changes.filter(c => c.status === 'pending');
  const variantsByType = (typeId: string) => variants.filter(v => v.expense_type_id === typeId);
  const variantLabel = (c: FuelChange) => {
    if (!c.fuel_variant_id) return null;
    const v = variants.find(x => x.id === c.fuel_variant_id);
    return v?.fuel_type || c.new_fuel_type || c.old_fuel_type || '—';
  };

  if (loading) return (
    <div className="space-y-4" role="status" aria-label="Loading expense types" aria-busy="true">
      <div className="shimmer h-16 rounded-md" aria-hidden="true" />
      <div className="shimmer h-32 rounded-md" aria-hidden="true" />
      <span className="sr-only">Loading expense types…</span>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expense Types</h1>
          <p className="text-muted-foreground">Manage rider & operational expense categories. The Fuel category supports multiple fuel variants; accountant price edits require admin approval.</p>
        </div>
        {isAdmin && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />New type</Button>}
      </div>

      <Tabs defaultValue="types">
        <TabsList>
          <TabsTrigger value="types">Types</TabsTrigger>
          <TabsTrigger value="approvals" className="gap-1">
            Fuel approvals {pendingChanges.length > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-xs tabular-nums">{pendingChanges.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="types" className="space-y-3 mt-4">
          {types.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="Expense types">
                <TableCaption className="sr-only">Expense type categories with fuel variants and management actions</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Amortization</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.map(t => (
                    <TypeRow
                      key={t.id}
                      type={t}
                      variants={variantsByType(t.id)}
                      isAdmin={isAdmin}
                      isAccountant={isAccountant}
                      onEdit={openEdit}
                      onDelete={setDeletingType}
                      onVariantEdit={openVariantEdit}
                      onVariantDelete={setVariantDeleting}
                      onVariantCreate={openVariantCreate}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground" role="status">
              <p className="font-medium">No expense types yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Create expense categories for riders and operations. The Fuel category supports multiple fuel variants.
              </p>
              {isAdmin && (
                <Button className="mt-4" onClick={openCreate}><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Create your first type</Button>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approvals" className="space-y-3 mt-4">
          {changes.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="Fuel price change approvals">
                <TableCaption className="sr-only">Fuel price change requests with approval actions and change details</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Fuel Type Change</TableHead>
                    <TableHead className="text-right">Price / Litre Change</TableHead>
                    <TableHead className="text-right">Cost / Mile Change</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changes.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {c.status === 'pending' && (
                          <Badge className="gap-1 bg-warning/10 text-warning"><Clock className="h-3 w-3" aria-hidden="true" />Pending</Badge>
                        )}
                        {c.status === 'approved' && (
                          <Badge className="gap-1 bg-success/10 text-success"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Approved</Badge>
                        )}
                        {c.status === 'rejected' && (
                          <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" aria-hidden="true" />Rejected</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {variantLabel(c) && <Badge variant="outline" className="gap-1"><Fuel className="h-3 w-3" aria-hidden="true" />{variantLabel(c)}</Badge>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums"><time dateTime={c.created_at}>{format(new Date(c.created_at), 'MMM d, yyyy HH:mm')}</time></TableCell>
                      <TableCell>{c.old_fuel_type || '—'} → <strong>{c.new_fuel_type || '—'}</strong></TableCell>
                      <TableCell className="text-right tabular-nums">{c.old_price_per_litre ?? '—'} → <strong>{c.new_price_per_litre ?? '—'}</strong></TableCell>
                      <TableCell className="text-right tabular-nums">{c.old_cost_per_mile ?? '—'} → <strong>{c.new_cost_per_mile ?? '—'}</strong></TableCell>
                      <TableCell className="text-right">
                        {isAdmin && (
                          <div className="flex justify-end gap-1">
                            {c.status === 'pending' && (
                              <>
                                <Button size="sm" variant="outline" className="text-success min-h-[44px] gap-1" onClick={() => approve(c)}><CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />Approve</Button>
                                <Button size="sm" variant="outline" className="text-destructive min-h-[44px] gap-1" onClick={() => reject(c)}><XCircle className="h-3 w-3 mr-1" aria-hidden="true" />Reject</Button>
                              </>
                            )}
                            <Button size="sm" variant="outline" className="text-destructive min-h-[44px] gap-1" onClick={() => setDeletingChange(c)}><Trash2 className="h-3 w-3 mr-1" aria-hidden="true" />Delete</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10" role="status">No fuel price changes yet.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Type create/edit */}
      <Dialog open={!!editing || creating} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{creating ? 'New expense type' : `Edit ${editing?.name}`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="exp-type-name">Name</Label>
              <Input id="exp-type-name" value={form.name} onChange={e => {
                const name = e.target.value;
                setForm(p => {
                  const lower = name.toLowerCase();
                  const isKnownDefault = ['', '20', '50', '100'].includes(p.amortize_over);
                  let amortize_over = p.amortize_over;
                  if (isKnownDefault && !p.is_fuel) {
                    if (p.is_maintenance) amortize_over = '100';
                    else if (/mobile data|data bundle|internet|telephone|phone credit|airtime|phone/.test(lower)) amortize_over = '20';
                    else amortize_over = '50';
                  }
                  return { ...p, name, amortize_over };
                });
              }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-type-applies">Applies to</Label>
              <Select value={form.applies_to} onValueChange={v => setForm(p => ({ ...p, applies_to: v }))}>
                <SelectTrigger id="exp-type-applies"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rider">Rider</SelectItem>
                  <SelectItem value="merchant_manager">Merchant manager</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="any">Any</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {creating && (
              <div className="flex items-center gap-2">
                <input id="isfuel" type="checkbox" checked={form.is_fuel} onChange={e => setForm(p => ({ ...p, is_fuel: e.target.checked }))} />
                <Label htmlFor="isfuel">This is a Fuel category (will have variants)</Label>
              </div>
            )}
            {!creating && (
              <div className="flex items-center gap-2">
                <input id="active" type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
                <Label htmlFor="active">Active</Label>
              </div>
            )}
            {!form.is_fuel && (() => {
              const lower = form.name.toLowerCase();
              const recommended = form.is_maintenance
                ? 100
                : /mobile data|data bundle|internet|telephone|phone credit|airtime|phone/.test(lower)
                  ? 20
                  : 50;
              return (
              <>
                <div className="flex items-center gap-2">
                  <input id="ismaint" type="checkbox" checked={form.is_maintenance} onChange={e => setForm(p => ({ ...p, is_maintenance: e.target.checked, amortize_over: e.target.checked ? '100' : (['', '100'].includes(p.amortize_over) ? '50' : p.amortize_over) }))} />
                  <Label htmlFor="ismaint">Maintenance expense (defaults to spread over 100 deliveries)</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exp-type-amortize">Amortize over (deliveries)</Label>
                  <Input id="exp-type-amortize" type="number" min="1" value={form.amortize_over} onChange={e => setForm(p => ({ ...p, amortize_over: e.target.value }))} placeholder={String(recommended)} />
                  <p className="text-xs text-muted-foreground">
                    Recommended: <strong>{recommended}</strong> deliveries
                    {recommended === 100 && ' (maintenance)'}
                    {recommended === 20 && ' (mobile data / telephone credit)'}
                    {recommended === 50 && ' (general)'}
                    . Leave blank to deduct fully in the next settlement.
                  </p>
                </div>
              </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={submit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variant create/edit */}
      <Dialog open={!!variantEditing || !!variantCreatingForType} onOpenChange={(o) => !o && closeVariantDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{variantCreatingForType ? 'Add fuel variant' : `Edit ${variantEditing?.fuel_type}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="fuel-type">Fuel type</Label>
              <Input id="fuel-type" value={vForm.fuel_type} onChange={e => setVForm(p => ({ ...p, fuel_type: e.target.value }))} placeholder="Petrol, Diesel, Electric…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fuel-price">Price / litre (D)</Label>
                <Input id="fuel-price" type="number" step="0.01" value={vForm.price_per_litre} onChange={e => setVForm(p => ({ ...p, price_per_litre: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fuel-cost">Cost / mile (D)</Label>
                <Input id="fuel-cost" type="number" step="0.01" value={vForm.cost_per_mile} onChange={e => setVForm(p => ({ ...p, cost_per_mile: e.target.value }))} />
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input id="vactive" type="checkbox" checked={vForm.is_active} onChange={e => setVForm(p => ({ ...p, is_active: e.target.checked }))} />
                  <Label htmlFor="vactive">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input id="vdefault" type="checkbox" checked={vForm.is_default} onChange={e => setVForm(p => ({ ...p, is_default: e.target.checked }))} />
                  <Label htmlFor="vdefault">Default for riders without an assigned fuel</Label>
                </div>
              </div>
            )}
            {variantEditing && isAccountant && !isAdmin && (
              <p className="text-xs text-warning bg-warning/10 p-2 rounded">Your edit will be sent to an admin for approval before taking effect.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeVariantDialog}>Cancel</Button>
            <Button onClick={submitVariant}>{variantEditing && isAccountant && !isAdmin ? 'Submit for approval' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingType} onOpenChange={(o) => !o && setDeletingType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingType?.name}". Existing expenses referencing it will keep their record but lose the type link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteType} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!variantDeleting} onOpenChange={(o) => !o && setVariantDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete fuel variant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{variantDeleting?.fuel_type}" variant. Riders assigned to it will fall back to the default variant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteVariant} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingChange} onOpenChange={(o) => !o && setDeletingChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete fuel price change request?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {deletingChange?.status} request from {deletingChange && format(new Date(deletingChange.created_at), 'MMM d, yyyy HH:mm')}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteChange} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
