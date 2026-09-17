import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('rider');
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async () => {
    const { data: rolesData } = await supabase.from('user_roles').select('*');
    const { data: profilesData } = await supabase.from('profiles').select('user_id, full_name, email');
    const profileMap = Object.fromEntries((profilesData || []).map(p => [p.user_id, p]));
    setAllRoles((rolesData || []).map(r => ({ ...r, profiles: profileMap[r.user_id] || null })));
    setLoading(false);
  };

  useEffect(() => { loadRoles(); }, []);

  const assignRole = async () => {
    const { data: profile } = await supabase.from('profiles').select('user_id').eq('email', email).single();
    if (!profile) { toast.error('User not found'); return; }
    const { error } = await supabase.from('user_roles').insert({ user_id: profile.user_id, role: role as any });
    if (error) { toast.error(error.message); return; }
    toast.success('Role assigned');
    setEmail('');
    loadRoles();
  };

  const removeRole = async (id: string) => {
    await supabase.from('user_roles').delete().eq('id', id);
    setAllRoles(prev => prev.filter(r => r.id !== id));
    toast.success('Role removed');
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage user roles and system settings</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Assign Role</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-2">
              <Label>User Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="w-48 space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="rider">Rider</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="company_manager">Merchant Manager</SelectItem>
                  <SelectItem value="business_owner">Business Owner</SelectItem>
                  <SelectItem value="app_developer">App Developer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={assignRole}><UserPlus className="h-4 w-4 mr-2" />Assign</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Current Role Assignments</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {allRoles.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{(r.profiles as any)?.full_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{(r.profiles as any)?.email} – <span className="font-medium">{r.role === 'company_manager' ? 'Merchant Manager' : r.role}</span></p>
                </div>
                <Button size="sm" variant="destructive" onClick={() => removeRole(r.id)}>Remove</Button>
              </div>
            ))}
            {allRoles.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No roles assigned yet</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
