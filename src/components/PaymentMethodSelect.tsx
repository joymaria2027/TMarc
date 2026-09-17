import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CreditCard, CheckCircle2 } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'wave', label: 'Wave' },
  { value: 'qmoney', label: 'QMoney' },
  { value: 'afrimoney', label: 'Afrimoney' },
  { value: 'aps_wallet', label: 'APS Wallet' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const;

interface PaymentMethodSelectProps {
  deliveryId: string;
  currentMethod?: string | null;
  currentBankName?: string | null;
  onSaved?: (method: string, bankName?: string) => void;
}

export default function PaymentMethodSelect({ deliveryId, currentMethod, currentBankName, onSaved }: PaymentMethodSelectProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(currentMethod || '');
  const [bankName, setBankName] = useState(currentBankName || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selected) {
      toast.error('Please select a payment method');
      return;
    }
    if (selected === 'bank_transfer' && !bankName.trim()) {
      toast.error('Please enter the bank name');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('deliveries').update({
        payment_method: selected,
        payment_bank_name: selected === 'bank_transfer' ? bankName.trim().slice(0, 100) : null,
      } as any).eq('id', deliveryId);
      if (error) throw error;

      toast.success('Payment method saved');
      onSaved?.(selected, selected === 'bank_transfer' ? bankName.trim() : undefined);
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const displayLabel = currentMethod
    ? PAYMENT_METHODS.find(m => m.value === currentMethod)?.label + (currentMethod === 'bank_transfer' && currentBankName ? ` (${currentBankName})` : '')
    : null;

  return (
    <>
      {displayLabel ? (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <CreditCard className="h-3 w-3" />{displayLabel}
        </button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <CreditCard className="h-4 w-4 mr-2" />Set Payment Method
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Payment Method Received</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setSelected(m.value)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                    selected === m.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {selected === 'bank_transfer' && (
              <Input
                placeholder="Enter bank name..."
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                maxLength={100}
              />
            )}

            <Button onClick={handleSave} className="w-full" disabled={saving || !selected}>
              {saving ? 'Saving...' : 'Save Payment Method'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
