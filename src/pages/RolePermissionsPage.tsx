import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Shield, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const BUILT_IN_RESOURCES = ['deliveries', 'create_delivery', 'tariffs', 'riders', 'merchants', 'settlements', 'analytics', 'revenue_sharing', 'rider_expenses'];
const BUILT_IN_ROLES = ['admin', 'rider', 'accountant', 'company_manager', 'business_owner', 'app_developer'];
const PERMISSIONS = ['can_view', 'can_edit', 'can_delete', 'can_add'] as const;
const PERM_LABELS: Record<string, string> = { can_view: 'View', can_edit: 'Edit', can_delete: 'Delete', can_add: 'Add' };
const ROLE_LABELS: Record<string, string> = { company_manager: 'Merchant Manager' };
const formatRole = (role: string) => ROLE_LABELS[role] || role.replace(/_/g, ' ');

export default function RolePermissionsPage() {
  const { user, hasRole } = useAuth();
  const [perms, setPerms] = useState<any[]>([]);
  const [customRoles, setCustomRoles] = useState<any[]>([]);
  const [customResources, setCustomResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoleName, setNewRoleName] = useState('');
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [newResourceName, setNewResourceName] = useState('');
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);

  const canManageRoles = hasRole('admin') || hasRole('app_developer');

  const allRoles = [...BUILT_IN_ROLES, ...customRoles.map(r => r.name)];
  const RESOURCES = [...BUILT_IN_RESOURCES, ...customResources.map(r => r.name)];

  const load = async () => {
    const [permRes, rolesRes, resRes] = await Promise.all([
      supabase.from('role_permissions').select('*'),
      supabase.from('custom_roles').select('*').order('created_at'),
      supabase.from('custom_resources').select('*').order('created_at'),
    ]);
    setPerms(permRes.data || []);
    setCustomRoles(rolesRes.data || []);
    setCustomResources(resRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-populate permissions for new roles/resources that don't have entries yet
  useEffect(() => {
    if (loading) return;
    const missing: { role: string; resource: string }[] = [];
    allRoles.forEach(role => {
      RESOURCES.forEach(resource => {
        if (!perms.find(p => p.role === role && p.resource === resource)) {
          missing.push({ role, resource });
        }
      });
    });
    if (missing.length > 0) {
      const rows = missing.map(m => ({
        role: m.role,
        resource: m.resource,
        can_view: false,
        can_edit: false,
        can_delete: false,
        can_add: false,
      }));
      supabase.from('role_permissions').insert(rows).select().then(({ data }) => {
        if (data) setPerms(prev => [...prev, ...data]);
      });
    }
  }, [loading, customRoles.length, customResources.length]);

  const togglePerm = async (role: string, resource: string, perm: string, value: boolean) => {
    const existing = perms.find(p => p.role === role && p.resource === resource);
    if (existing) {
      const updateObj: Record<string, boolean> = { can_view: existing.can_view, can_edit: existing.can_edit, can_delete: existing.can_delete, can_add: existing.can_add };
      updateObj[perm] = value;
      await supabase.from('role_permissions').update({ can_view: updateObj.can_view, can_edit: updateObj.can_edit, can_delete: updateObj.can_delete, can_add: updateObj.can_add }).eq('id', existing.id);
      setPerms(prev => prev.map(p => p.id === existing.id ? { ...p, [perm]: value } : p));
    } else {
      const newRow = { role, resource, can_view: perm === 'can_view' ? value : false, can_edit: perm === 'can_edit' ? value : false, can_delete: perm === 'can_delete' ? value : false, can_add: perm === 'can_add' ? value : false };
      const { data } = await supabase.from('role_permissions').insert(newRow).select().single();
      if (data) setPerms(prev => [...prev, data]);
    }
    toast.success(`Updated ${PERM_LABELS[perm]} permission for ${role} on ${resource}`);
  };

  const getPerm = (role: string, resource: string, perm: string) => {
    const row = perms.find(p => p.role === role && p.resource === resource);
    return row ? row[perm] : false;
  };

  const addCustomRole = async () => {
    const name = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name) { toast.error('Enter a role name'); return; }
    if (allRoles.includes(name)) { toast.error('Role already exists'); return; }
    const { data, error } = await supabase.from('custom_roles').insert({ name, created_by: user!.id }).select().single();
    if (error) { toast.error(error.message); return; }
    if (data) setCustomRoles(prev => [...prev, data]);
    setNewRoleName('');
    setRoleDialogOpen(false);
    toast.success(`Role "${name}" added`);
  };

  const deleteCustomRole = async (id: string, name: string) => {
    await supabase.from('custom_roles').delete().eq('id', id);
    // Also remove its permissions
    await supabase.from('role_permissions').delete().eq('role', name);
    setCustomRoles(prev => prev.filter(r => r.id !== id));
    setPerms(prev => prev.filter(p => p.role !== name));
    toast.success(`Role "${name}" removed`);
  };

  const addCustomResource = async () => {
    const name = newResourceName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name) { toast.error('Enter a resource name'); return; }
    if (RESOURCES.includes(name)) { toast.error('Resource already exists'); return; }
    const { data, error } = await supabase.from('custom_resources').insert({ name, created_by: user!.id }).select().single();
    if (error) { toast.error(error.message); return; }
    if (data) setCustomResources(prev => [...prev, data]);
    setNewResourceName('');
    setResourceDialogOpen(false);
    toast.success(`Resource "${name}" added`);
  };

  const deleteCustomResource = async (id: string, name: string) => {
    await supabase.from('custom_resources').delete().eq('id', id);
    await supabase.from('role_permissions').delete().eq('resource', name);
    setCustomResources(prev => prev.filter(r => r.id !== id));
    setPerms(prev => prev.filter(p => p.resource !== name));
    toast.success(`Resource "${name}" removed`);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Role Permissions</h1>
          <p className="text-muted-foreground">Assign view, edit, delete, and add rights per role</p>
        </div>
        {canManageRoles && (
          <div className="flex gap-2">
            <Dialog open={resourceDialogOpen} onOpenChange={setResourceDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Plus className="h-4 w-4 mr-2" />Add Resource</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Custom Resource</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Resource Name</Label>
                    <Input value={newResourceName} onChange={e => setNewResourceName(e.target.value)} placeholder="e.g. payouts, reports" />
                    <p className="text-xs text-muted-foreground">Spaces will be replaced with underscores</p>
                  </div>
                  <Button onClick={addCustomResource} className="w-full">Add Resource</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Role</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Custom Role</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Role Name</Label>
                    <Input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="e.g. dispatcher, supervisor" />
                    <p className="text-xs text-muted-foreground">Spaces will be replaced with underscores</p>
                  </div>
                  <Button onClick={addCustomRole} className="w-full">Add Role</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {allRoles.map(role => {
        const isCustom = customRoles.find(r => r.name === role);
        return (
          <Card key={role}>
            <CardHeader>
              <CardTitle className="text-base capitalize flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {formatRole(role)}
                {isCustom && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Badge variant="secondary" className="text-xs">Custom</Badge>
                    {canManageRoles && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteCustomRole(isCustom.id, isCustom.name)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Resource</th>
                      {PERMISSIONS.map(p => (
                        <th key={p} className="text-center py-2 px-3 font-medium text-muted-foreground">{PERM_LABELS[p]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RESOURCES.map(resource => {
                      const customRes = customResources.find(r => r.name === resource);
                      return (
                      <tr key={resource} className="border-b last:border-0">
                        <td className="py-3 pr-4 capitalize font-medium">
                          <div className="flex items-center gap-2">
                            <span>{resource.replace(/_/g, ' ')}</span>
                            {customRes && <Badge variant="secondary" className="text-xs">Custom</Badge>}
                            {customRes && canManageRoles && role === allRoles[0] && (
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteCustomResource(customRes.id, customRes.name)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                        {PERMISSIONS.map(perm => (
                          <td key={perm} className="text-center py-3 px-3">
                            <Switch
                              checked={getPerm(role, resource, perm)}
                              onCheckedChange={v => togglePerm(role, resource, perm, v)}
                            />
                          </td>
                        ))}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
