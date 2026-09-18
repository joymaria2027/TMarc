import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';
import { guardedWrite } from '@/lib/guardedWrite';
import { validateDeliveryForm } from './merchantGroup.helpers';
import { formatMoney } from '@/lib/finance';

interface Merchant {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}
interface Tariff { id: string; location_name: string; tariff_amount: number }
interface RiderOption { rider_id: string; rider_code: string | null; full_name: string | null }

type Errors = Record<string, string | undefined>;

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return <p id={id} role="alert" className="text-xs text-destructive">{msg}</p>;
}

/**
 * Dedicated create-delivery page (replaces the 7-field modal CRUD banned by
 * PRODUCT.md). Riders are scoped to the selected merchant's assignments —
 * the old dialogs offered every rider on the platform.
 */
export default function NewDeliveryPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const merchantId = params.get('merchant');

  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    pickup_address: '', dropoff_address: '', order_reference: '',
    rider_id: '', tariff_id: '', customer_name: '', customer_phone: '',
  });
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!merchantId) { setNotFound(true); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [mRes, tRes, rRes] = await Promise.all([
        supabase.from('merchants').select('id, name, address, latitude, longitude').eq('id', merchantId).maybeSingle(),
        supabase.from('tariffs').select('id, location_name, tariff_amount').eq('merchant_id', merchantId),
        // Riders assigned to THIS merchant only (was: all riders platform-wide)
        supabase
          .from('merchant_riders')
          .select('rider_id, is_active, riders(rider_code, profiles(full_name))')
          .eq('merchant_id', merchantId),
      ]);
      if (cancelled) return;
      if (mRes.error || !mRes.data) { setNotFound(true); setLoading(false); return; }
      setMerchant(mRes.data as Merchant);
      setTariffs((tRes.data as Tariff[]) || []);
      const riderRows = ((rRes.data as unknown as Array<{
        rider_id: string; is_active: boolean | null;
        riders: { rider_code: string | null; profiles: { full_name: string | null } | null } | null;
      }>) || [])
        .filter(row => row.is_active !== false && row.riders)
        .map(row => ({
          rider_id: row.rider_id,
          rider_code: row.riders?.rider_code ?? null,
          full_name: row.riders?.profiles?.full_name ?? null,
        }));
      setRiders(riderRows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [merchantId]);

  const set = (patch: Partial<typeof form>) => setForm(p => ({ ...p, ...patch }));

  const submit = async () => {
    if (!merchant) return;
    const errs: Errors = validateDeliveryForm(form);
    if (!form.dropoff_address.trim()) errs.dropoff_address = 'Drop-off address is required';
    if (!form.tariff_id) errs.tariff_id = 'Choose a tariff zone';
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please fix the highlighted fields.');
      return;
    }
    setSubmitting(true);
    const selectedTariff = tariffs.find(t => t.id === form.tariff_id);
    const { error } = await guardedWrite(
      supabase.from('deliveries').insert({
        merchant_id: merchant.id,
        pickup_address: form.pickup_address || merchant.address,
        dropoff_address: form.dropoff_address,
        order_reference: form.order_reference || null,
        rider_id: form.rider_id,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        status: 'dispatched',
        dispatched_at: new Date().toISOString(),
        estimated_tariff: selectedTariff ? selectedTariff.tariff_amount : null,
        pickup_latitude: merchant.latitude,
        pickup_longitude: merchant.longitude,
      }),
      { context: 'Create delivery failed' },
    );
    setSubmitting(false);
    if (error) return;
    toast.success('Delivery created & dispatched to rider');
    navigate('/deliveries');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-xl space-y-4" role="status" aria-label="Loading delivery form">
        <Skeleton className="shimmer h-9 w-64" />
        <Skeleton className="shimmer h-96 w-full rounded-lg" />
        <span className="sr-only">Loading delivery form…</span>
      </div>
    );
  }

  if (notFound || !merchant) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <Truck className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Merchant not found</h1>
        <p className="text-muted-foreground">Open this page from a merchant on the Merchants page.</p>
        <Button variant="outline" onClick={() => navigate('/merchants')}>Go to Merchants</Button>
      </div>
    );
  }

  const riderLabel = (r: RiderOption) =>
    [r.full_name, r.rider_code ? `#${r.rider_code}` : null].filter(Boolean).join(' · ') || r.rider_id.slice(0, 8);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">New delivery</h1>
        <p className="text-muted-foreground">Dispatching for <span className="font-medium text-foreground">{merchant.name}</span></p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Delivery details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nd-customer">Customer name *</Label>
              <Input
                id="nd-customer" value={form.customer_name} autoComplete="name"
                aria-required="true" aria-invalid={!!errors.customer_name}
                aria-describedby={errors.customer_name ? 'nd-customer-error' : undefined}
                onChange={e => set({ customer_name: e.target.value })}
              />
              <FieldError id="nd-customer-error" msg={errors.customer_name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nd-phone">Customer phone *</Label>
              <Input
                id="nd-phone" type="tel" inputMode="tel" maxLength={20} placeholder="+220…"
                value={form.customer_phone} autoComplete="tel"
                aria-required="true" aria-invalid={!!errors.customer_phone}
                aria-describedby={errors.customer_phone ? 'nd-phone-error' : undefined}
                onChange={e => set({ customer_phone: e.target.value })}
              />
              <FieldError id="nd-phone-error" msg={errors.customer_phone} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nd-dropoff">Drop-off address *</Label>
            <Input
              id="nd-dropoff" value={form.dropoff_address}
              aria-required="true" aria-invalid={!!errors.dropoff_address}
              aria-describedby={errors.dropoff_address ? 'nd-dropoff-error' : undefined}
              onChange={e => set({ dropoff_address: e.target.value })}
            />
            <FieldError id="nd-dropoff-error" msg={errors.dropoff_address} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nd-pickup">Pickup address</Label>
            <Input
              id="nd-pickup" placeholder={merchant.address || 'Defaults to the store address'}
              value={form.pickup_address} onChange={e => set({ pickup_address: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nd-tariff">Tariff zone *</Label>
              <Select value={form.tariff_id} onValueChange={v => { set({ tariff_id: v }); setErrors(p => ({ ...p, tariff_id: undefined })); }}>
                <SelectTrigger id="nd-tariff" className="h-11" aria-invalid={!!errors.tariff_id} aria-describedby={errors.tariff_id ? 'nd-tariff-error' : undefined}>
                  <SelectValue placeholder="Choose zone" />
                </SelectTrigger>
                <SelectContent>
                  {tariffs.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.location_name} — {formatMoney(t.tariff_amount)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="nd-tariff-error" msg={errors.tariff_id} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nd-rider">Rider *</Label>
              <Select value={form.rider_id} onValueChange={v => { set({ rider_id: v }); setErrors(p => ({ ...p, rider_id: undefined })); }}>
                <SelectTrigger id="nd-rider" className="h-11" aria-invalid={!!errors.rider_id} aria-describedby={errors.rider_id ? 'nd-rider-error' : undefined}>
                  <SelectValue placeholder={riders.length ? 'Choose rider' : 'No riders assigned'} />
                </SelectTrigger>
                <SelectContent>
                  {riders.map(r => <SelectItem key={r.rider_id} value={r.rider_id}>{riderLabel(r)}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError id="nd-rider-error" msg={errors.rider_id} />
              {riders.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No riders are assigned to this store yet — assign one on the Merchants page first.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nd-ref">Order reference</Label>
            <Input id="nd-ref" value={form.order_reference} onChange={e => set({ order_reference: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={submitting}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={submitting || riders.length === 0}>
              {submitting ? 'Creating…' : 'Create delivery'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
