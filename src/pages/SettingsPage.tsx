import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('rider');
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; label: string } | null>(null);

  const loadRoles = async () => {
    const { data: rolesData } = await supabase.from('user_roles').select('*');
    const { data: profilesData } = await supabase.from('profiles').select('user_id, full_name, email');
    const profileMap = Object.fromEntries((profilesData || []).map(p => [p.user_id, p]));
    setAllRoles((rolesData || []).map(r => ({ ...r, profiles: profileMap[r.user_id] || null })));
    setLoading(false);
  };

  useEffect(() => { loadRoles(); }, []);

  const assignRole = async () => {
    if (!email.trim() || !email.includes('@')) {
      toast.error('Enter the user\'s email first.');
      setStatusMessage('Enter a valid email to assign a role.');
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('user_id').eq('email', email).single();
    if (!profile) {
      toast.error('User not found');
      setStatusMessage('User not found.');
      return;
    }
    const { error } = await supabase.from('user_roles').insert({ user_id: profile.user_id, role: role as any });
    if (error) {
      toast.error(error.message);
      setStatusMessage(error.message);
      return;
    }
    toast.success('Role assigned');
    setStatusMessage(`Role ${role} assigned to ${email}.`);
    setEmail('');
    loadRoles();
  };

  const confirmRemoveRole = async () => {
    if (!pendingRemove) return;
    await supabase.from('user_roles').delete().eq('id', pendingRemove.id);
    setAllRoles(prev => prev.filter(r => r.id !== pendingRemove.id));
    toast.success('Role removed');
    setStatusMessage(`Role removed: ${pendingRemove.label}.`);
    setPendingRemove(null);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div role="status" aria-label="Loading settings" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage user roles and system settings</p>
      </div>

      <div aria-live="polite" role="status" className="sr-only">
        {statusMessage ?? ''}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Assign Role</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="settings-email">User Email</Label>
              <Input
                id="settings-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="w-full sm:w-48 space-y-2">
              <Label htmlFor="settings-role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="settings-role"><SelectValue /></SelectTrigger>
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
            <Button onClick={assignRole}><UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />Assign</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Current Role Assignments</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {allRoles.map(r => {
              const name = (r.profiles as any)?.full_name || 'Unknown';
              const em = (r.profiles as any)?.email || 'unknown';
              const roleLabel = r.role === 'company_manager' ? 'Merchant Manager' : r.role;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" title={name}>{name}</p>
                    <p className="text-xs text-muted-foreground truncate" title={`${em} – ${roleLabel}`}>
                      {em} – <span className="font-medium">{roleLabel}</span>
                    </p>
                  </div>
                  <AlertDialog
                    open={pendingRemove?.id === r.id}
                    onOpenChange={(open) => {
                      if (!open) setPendingRemove(null);
                    }}
                  >
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        aria-label={`Remove ${roleLabel} role from ${name}`}
                        onClick={() => setPendingRemove({ id: r.id, label: `${roleLabel} from ${name}` })}
                      >
                        Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove role?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove {roleLabel} access from {name} ({em}). They will lose
                          permissions immediately. This action can be re-assigned later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmRemoveRole}>Remove role</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })}
            {allRoles.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No roles assigned yet</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
