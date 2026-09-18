export const PERM_LABELS: Record<string, string> = {
  can_view: 'View',
  can_edit: 'Edit',
  can_delete: 'Delete',
  can_add: 'Add',
};

const ROLE_LABELS: Record<string, string> = { company_manager: 'Merchant Manager' };

export function formatRole(role: string): string {
  return ROLE_LABELS[role] || role.replace(/_/g, ' ');
}

export function buildSwitchAriaLabel(role: string, resource: string, perm: string): string {
  const permLabel = PERM_LABELS[perm] ?? perm;
  return `${formatRole(role)} ${resource.replace(/_/g, ' ')} ${permLabel}`;
}
