import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { validateBusinessTypeForm, type Errors } from './merchantGroup.helpers';

interface BusinessType {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export default function BusinessTypesPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessType | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [deleteTarget, setDeleteTarget] = useState<BusinessType | null>(null);

  const load = async () => {
    const [{ data: t }, { data: merchants }] = await Promise.all([
      supabase.from('business_types' as any).select('*').order('name'),
      supabase.from('merchants').select('business_type_id' as any),
    ]);
    setTypes((t as any) || []);
    const c: Record<string, number> = {};
    ((merchants as any) || []).forEach((row: any) => {
      if (row.business_type_id) c[row.business_type_id] = (c[row.business_type_id] || 0) + 1;
    });
    setCounts(c);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('business-types')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_types' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '' });
    setErrors({});
    setOpen(true);
  };

  const openEdit = (t: BusinessType) => {
    setEditing(t);
    setForm({ name: t.name, description: t.description || '' });
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const errs = validateBusinessTypeForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (editing) {
      const { error } = await (supabase.from('business_types' as any).update({
        name: form.name.trim(), description: form.description.trim() || null,
      }) as any).eq('id', editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Business type updated');
    } else {
      const { error } = await supabase.from('business_types' as any).insert({
        name: form.name.trim(), description: form.description.trim() || null, created_by: user?.id,
      } as any);
      if (error) { toast.error(error.message); return; }
      toast.success('Business type added');
    }
    setOpen(false);
    load();
  };

  const toggleActive = async (t: BusinessType) => {
    const { error } = await (supabase.from('business_types' as any).update({ is_active: !t.is_active }) as any).eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const remove = async (t: BusinessType) => {
    const { error } = await (supabase.from('business_types' as any).delete() as any).eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Business type deleted');
    setDeleteTarget(null);
    load();
  };

  if (!isAdmin) {
    return <div className="py-20 text-center text-muted-foreground">Admin access required.</div>;
  }
  if (loading) return (
    <div className="flex items-center justify-center py-20" role="status">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
      <span className="sr-only">Loading business types…</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Business Types</h1>
          <p className="text-muted-foreground">Categories used to classify merchants</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Add Business Type</Button>
      </div>

      {types.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground" role="status">
          <p>No business types yet.</p>
          <p className="text-sm mt-1">Add the first category to start classifying merchants.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">Description</TableHead>
              <TableHead scope="col" className="text-right">Merchants</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-muted-foreground">{t.description || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{counts[t.id] || 0}</TableCell>
                <TableCell>
                  <Badge className="text-xs" variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2 flex-wrap justify-end">
                    <Button size="sm" variant="outline" aria-label={`Edit ${t.name}`} onClick={() => openEdit(t)}><Edit2 className="h-3 w-3 mr-1" aria-hidden="true" />Edit</Button>
                    <Button size="sm" variant="outline" aria-label={`${t.is_active ? 'Deactivate' : 'Activate'} ${t.name}`} onClick={() => toggleActive(t)}>{t.is_active ? 'Deactivate' : 'Activate'}</Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => setDeleteTarget(t)}><Trash2 className="h-3 w-3" aria-hidden="true" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Business Type' : 'Add Business Type'}</DialogTitle>
            <DialogDescription>Categories group merchants on the admin list.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="biz-name">Name *</Label>
              <Input id="biz-name" required aria-required="true" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'biz-name-error' : undefined} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Pharmacy" />
              {errors.name && <p id="biz-name-error" className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-description">Description</Label>
              <Input id="biz-description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
            </div>
            <Button onClick={save} className="w-full">{editing ? 'Save Changes' : 'Add Business Type'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Merchants using this category will become uncategorized. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove(deleteTarget)}>
              Delete category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
