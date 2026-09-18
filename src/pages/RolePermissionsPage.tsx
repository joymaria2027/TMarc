import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { Shield, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { buildSwitchAriaLabel, formatRole, PERM_LABELS } from './rolePermissions.helpers';

const BUILT_IN_RESOURCES = ['deliveries', 'create_delivery', 'tariffs', 'riders', 'merchants', 'settlements', 'analytics', 'revenue_sharing', 'rider_expenses'];
const BUILT_IN_ROLES = ['admin', 'rider', 'accountant', 'company_manager', 'business_owner', 'app_developer'];
const PERMISSIONS = ['can_view', 'can_edit', 'can_delete', 'can_add'] as const;

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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canManageRoles = hasRole('admin') || hasRole('app_developer');

  const allRoles = useMemo(
    () => [...BUILT_IN_ROLES, ...customRoles.map(r => r.name)],
    [customRoles],
  );
  const RESOURCES = useMemo(
    () => [...BUILT_IN_RESOURCES, ...customResources.map(r => r.name)],
    [customResources],
  );

  const load = async () => {
    const [permRes, rolesRes, resRes] = await Promise.all([
      supabase.from('role_permissions').select('*').limit(500),
      supabase.from('custom_roles').select('*').order('created_at').limit(100),
      supabase.from('custom_resources').select('*').order('created_at').limit(100),
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
    const msg = `Updated ${PERM_LABELS[perm]} permission for ${role} on ${resource}`;
    toast.success(msg);
    setStatusMessage(msg);
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
    setStatusMessage(`Custom role ${name} removed.`);
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
    setStatusMessage(`Custom resource ${name} removed.`);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div role="status" aria-label="Loading role permissions" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Role Permissions</h1>
          <p className="text-muted-foreground">Assign view, edit, delete, and add rights per role</p>
        </div>
        {canManageRoles && (
          <div className="flex gap-2">
            <Dialog open={resourceDialogOpen} onOpenChange={setResourceDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Add Resource</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Custom Resource</DialogTitle>
                  <DialogDescription>Resources group permissions. Spaces become underscores.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom-resource-name">Resource Name</Label>
                    <Input
                      id="custom-resource-name"
                      value={newResourceName}
                      onChange={e => setNewResourceName(e.target.value)}
                      placeholder="e.g. payouts, reports"
                    />
                    <p className="text-xs text-muted-foreground">Spaces will be replaced with underscores</p>
                  </div>
                  <Button onClick={addCustomResource} className="w-full">Add Resource</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Add Role</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Custom Role</DialogTitle>
                  <DialogDescription>Custom roles start with no permissions. Spaces become underscores.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom-role-name">Role Name</Label>
                    <Input
                      id="custom-role-name"
                      value={newRoleName}
                      onChange={e => setNewRoleName(e.target.value)}
                      placeholder="e.g. dispatcher, supervisor"
                    />
                    <p className="text-xs text-muted-foreground">Spaces will be replaced with underscores</p>
                  </div>
                  <Button onClick={addCustomRole} className="w-full">Add Role</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div aria-live="polite" role="status" className="sr-only">
        {statusMessage ?? ''}
      </div>

      {allRoles.map(role => {
        const isCustom = customRoles.find(r => r.name === role);
        return (
          <Card key={role}>
            <CardHeader>
              <CardTitle className="text-base capitalize flex items-center gap-2">
                <Shield className="h-4 w-4" aria-hidden="true" />
                {formatRole(role)}
                {isCustom && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Badge variant="secondary" className="text-xs">Custom</Badge>
                    {canManageRoles && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            aria-label={`Remove custom role ${isCustom.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove custom role?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes the “{isCustom.name}” role and all of its
                              permissions. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteCustomRole(isCustom.id, isCustom.name)}>
                              Remove role
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
                      <th scope="col" className="text-left py-2 pr-4 font-medium text-muted-foreground">Resource</th>
                      {PERMISSIONS.map(p => (
                        <th key={p} scope="col" className="text-center py-2 px-3 font-medium text-muted-foreground">{PERM_LABELS[p]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RESOURCES.map(resource => {
                      const customRes = customResources.find(r => r.name === resource);
                      return (
                      <tr key={resource} className="border-b last:border-0">
                        <th scope="row" className="py-3 pr-4 capitalize font-medium text-left">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[160px]" title={resource.replace(/_/g, ' ')}>{resource.replace(/_/g, ' ')}</span>
                            {customRes && <Badge variant="secondary" className="text-xs">Custom</Badge>}
                            {customRes && canManageRoles && role === allRoles[0] && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-destructive"
                                    aria-label={`Remove custom resource ${customRes.name}`}
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove custom resource?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This permanently removes the “{customRes.name}” resource and all
                                      permissions tied to it.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteCustomResource(customRes.id, customRes.name)}>
                                      Remove resource
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </th>
                        {PERMISSIONS.map(perm => (
                          <td key={perm} className="text-center py-3 px-3">
                            <Switch
                              checked={getPerm(role, resource, perm)}
                              onCheckedChange={v => togglePerm(role, resource, perm, v)}
                              aria-label={buildSwitchAriaLabel(role, resource, perm)}
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
