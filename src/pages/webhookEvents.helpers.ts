export function getWebhookStatusToken(status: string): string {
  const map: Record<string, string> = {
    processed: 'bg-success/15 text-success border-success/30',
    duplicate: 'bg-info/15 text-info border-info/30',
    ignored: 'bg-secondary text-secondary-foreground border-transparent',
    failed: 'bg-destructive/15 text-destructive border-destructive/30',
    invalid_signature: 'bg-destructive/15 text-destructive border-destructive/30',
    pending: 'bg-warning/15 text-warning border-warning/30',
  };
  return map[status] ?? 'bg-secondary text-secondary-foreground border-transparent';
}

export function getSignatureToken(valid: boolean | null | undefined): string {
  if (valid === null || valid === undefined) return 'variant-outline bg-secondary text-secondary-foreground';
  return valid
    ? 'bg-success/15 text-success border-success/30'
    : 'bg-destructive/15 text-destructive border-destructive/30';
}

export interface WebhookEventLike {
  event_type?: string | null;
  payment_reference?: string | null;
  order_id?: string | null;
}

export function filterWebhookEvents<T extends WebhookEventLike>(events: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return events;
  return events.filter(
    (e) =>
      (e.event_type ?? '').toLowerCase().includes(needle) ||
      (e.payment_reference ?? '').toLowerCase().includes(needle) ||
      (e.order_id ?? '').toLowerCase().includes(needle),
  );
}
