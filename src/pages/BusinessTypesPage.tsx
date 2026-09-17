import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Tag } from 'lucide-react';

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
    setOpen(true);
  };

  const openEdit = (t: BusinessType) => {
    setEditing(t);
    setForm({ name: t.name, description: t.description || '' });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
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
    if (!confirm(`Delete "${t.name}"? Merchants using it will become uncategorized.`)) return;
    const { error } = await (supabase.from('business_types' as any).delete() as any).eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Business type deleted');
    load();
  };

  if (!isAdmin) {
    return <div className="py-20 text-center text-muted-foreground">Admin access required.</div>;
  }
  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Business Types</h1>
          <p className="text-muted-foreground">Categories used to classify merchants</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Business Type</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {types.map(t => (
          <Card key={t.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{t.name}</span>
                </div>
                <Badge variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
              <p className="text-xs text-muted-foreground">{counts[t.id] || 0} merchants</p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => openEdit(t)}><Edit2 className="h-3 w-3 mr-1" />Edit</Button>
                <Button size="sm" variant="outline" onClick={() => toggleActive(t)}>{t.is_active ? 'Deactivate' : 'Activate'}</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(t)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {types.length === 0 && (
          <div className="col-span-full text-center py-10 text-muted-foreground">No business types yet.</div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Business Type' : 'Add Business Type'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Pharmacy" /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" /></div>
            <Button onClick={save} className="w-full">{editing ? 'Save Changes' : 'Add Business Type'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
