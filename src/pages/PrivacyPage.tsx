import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import StorefrontLayout from "@/components/StorefrontLayout";

export default function PrivacyPage() {
  return (
    <StorefrontLayout>
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <h1 className="font-display text-3xl tracking-tight">Privacy policy</h1>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            DeliveryAce collects only what it needs to run delivery operations: your name and
            email for your account, order and delivery details to move and settle each order,
            and location data for riders while a delivery is in progress.
          </p>
          <p>
            We use your data to operate the platform — dispatch, tracking, settlements, and
            support. We do not sell personal data, and we do not share it with third parties
            beyond the processors required to run the service.
          </p>
          <p>
            You can request a copy of your data or ask us to delete your account at any time by
            contacting support. Account deletion removes your personal data; records required
            for financial reconciliation are retained as the law requires.
          </p>
          <p>
            Emails are used for account notices and order updates only. Unsubscribe links are
            included in every non-essential email.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Last updated: September 2026</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/auth"><ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />Back</Link>
        </Button>
      </div>
    </StorefrontLayout>
  );
}
