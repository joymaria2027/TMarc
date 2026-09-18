import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';

export interface ExpenseFormState {
  rider_id: string;
  merchant_id: string;
  expense_type_id: string;
  description: string;
  amount: string;
  expense_date: string;
}

export interface ExpenseFormMerchant {
  id: string;
  name: string;
}

export interface ExpenseFormRider {
  id: string;
  license_plate?: string | null;
  profile?: { full_name?: string | null } | null;
}

export interface ExpenseFormType {
  id: string;
  name: string;
  is_fuel?: boolean | null;
}

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ExpenseFormState;
  onFormChange: (patch: Partial<ExpenseFormState>) => void;
  merchants: ExpenseFormMerchant[];
  riders: ExpenseFormRider[];
  expenseTypes: ExpenseFormType[];
  receiptFileName: string | null;
  onReceiptFile: (file: File | null) => void;
  onSubmit: () => void;
  uploading: boolean;
}

export default function ExpenseFormDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  merchants,
  riders,
  expenseTypes,
  receiptFileName,
  onReceiptFile,
  onSubmit,
  uploading,
}: ExpenseFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Add Expense</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Rider Expense</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expense-merchant">Merchant <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Select value={form.merchant_id || 'none'} onValueChange={v => onFormChange({ merchant_id: v === 'none' ? '' : v })}>
              <SelectTrigger id="expense-merchant"><SelectValue placeholder="Select merchant (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {merchants.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-rider">Rider <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Select value={form.rider_id} onValueChange={v => onFormChange({ rider_id: v })}>
              <SelectTrigger id="expense-rider"><SelectValue placeholder="Select rider" /></SelectTrigger>
              <SelectContent>
                {riders.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.profile?.full_name || r.license_plate || r.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-type">Expense type <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Select value={form.expense_type_id} onValueChange={v => onFormChange({ expense_type_id: v })}>
              <SelectTrigger id="expense-type"><SelectValue placeholder="Select expense type" /></SelectTrigger>
              <SelectContent>
                {expenseTypes.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}{t.is_fuel ? ' (Fuel)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-description">Description</Label>
            <Input id="expense-description" value={form.description} onChange={e => onFormChange({ description: e.target.value })} placeholder="Fuel, maintenance, etc." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expense-amount">Amount</Label>
              <Input id="expense-amount" type="number" step="0.01" value={form.amount} onChange={e => onFormChange({ amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-date">Date</Label>
              <Input id="expense-date" type="date" value={form.expense_date} onChange={e => onFormChange({ expense_date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-receipt">Receipt (optional)</Label>
            <Input id="expense-receipt" type="file" accept="image/*,.pdf" onChange={e => onReceiptFile(e.target.files?.[0] || null)} />
            {receiptFileName && <p className="text-xs text-muted-foreground">{receiptFileName}</p>}
          </div>
          <Button onClick={onSubmit} className="w-full" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Save Expense'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
