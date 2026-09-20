import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Loader2, KeyRound } from "lucide-react";
import { rpcVerifyHandoverCode } from "@/lib/rpcTypes";

// Ticket: handover-code/02 — the rider asks the CUSTOMER for the handover code
// and types it in. The code is never visible to the rider anywhere in the app;
// verification happens server-side (see 20260920000004 migration) with
// brute-force lockout. On success the parent performs the delivered update,
// which the database gate only accepts with a verified code.

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deliveryId: string;
  orderReference: string | null;
  onVerified: () => Promise<void> | void;
}

export default function CompletionCodeDialog({ open, onOpenChange, deliveryId, orderReference, onVerified }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setValue(""); setError(null); };

  const handleVerify = async () => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await rpcVerifyHandoverCode(deliveryId, Number(value));
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (data !== true) {
      setError("Incorrect code — ask the customer again.");
      return;
    }
    await onVerified();
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { if (!o) reset(); onOpenChange(o); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" aria-hidden="true" />Customer handover code
          </DialogTitle>
          <DialogDescription>
            Ask the customer for the 6-digit code shown in their Orders page
            {orderReference ? ` for ${orderReference}` : ""} and enter it to complete this delivery.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <InputOTP maxLength={6} value={value} onChange={setValue} disabled={busy}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          {error && (
            <p role="alert" className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleVerify} disabled={busy || value.length !== 6}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
