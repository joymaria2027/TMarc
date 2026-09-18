import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  riderId: string;
  deliveryId: string;
  phase: 'start' | 'end';
  minMiles?: number | null;
  onConfirmed: (miles: number, photoUrl: string) => Promise<void> | void;
}

export default function OdometerCaptureDialog({ open, onOpenChange, title, description, riderId, deliveryId, phase, minMiles, onConfirmed }: Props) {
  const [miles, setMiles] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setMiles(''); setFile(null); };

  const handleSubmit = async () => {
    const n = parseFloat(miles);
    if (!isFinite(n) || n < 0) { toast.error('Enter a valid mileage'); return; }
    if (minMiles != null && n < minMiles) { toast.error(`End mileage must be ≥ start (${minMiles})`); return; }
    if (!file) { toast.error('A photo of the odometer is required'); return; }
    setBusy(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${riderId}/${deliveryId}/${phase}.${ext}`;
      const { error: upErr } = await supabase.storage.from('odometer-photos').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from('odometer-photos').createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl || path;
      await onConfirmed(n, url);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save odometer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { if (!o) reset(); onOpenChange(o); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="odometer-miles">Current mileage (miles)</Label>
            <Input id="odometer-miles" type="number" step="0.1" min="0" value={miles} onChange={e => setMiles(e.target.value)} placeholder="e.g. 12345.6" />
            {minMiles != null && <p className="text-xs text-muted-foreground">Start reading was {minMiles} mi</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="odometer-photo">Odometer photo</Label>
            <Input id="odometer-photo" ref={fileRef} type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && <p className="text-xs text-muted-foreground flex items-center gap-1"><Camera className="h-3 w-3" />{file.name}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save & continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
