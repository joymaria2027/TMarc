import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}

/**
 * Slice 01: shared first-run empty state. Every empty panel states what
 * belongs there + how it gets populated + at most one CTA that starts the
 * populating task in place. Inbound-only panels omit the action.
 */
export default function EmptyState({ title, body, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="text-center py-8">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{body}</p>
      {actionLabel && actionHref && (
        <Button asChild variant="outline" size="sm" className="mt-3 min-h-[44px]">
          <Link to={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
