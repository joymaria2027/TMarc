import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  merchantId: string;
  merchantName: string;
}

export default function StoreQrDialog({ open, onOpenChange, merchantId, merchantName }: Props) {
  const [dataUrl, setDataUrl] = useState<string>('');
  const storeUrl = `${window.location.origin}/s/${merchantId}`;
  const printRef = useRef<HTMLDivElement>(null);

  const logEvent = async (event_type: string) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from('merchant_audit_log' as any).insert({
      merchant_id: merchantId,
      event_type,
      actor_user_id: data.user.id,
      detail: { url: storeUrl },
    } as any);
  };

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(storeUrl, { width: 720, margin: 2, errorCorrectionLevel: 'M' })
      .then(url => { setDataUrl(url); logEvent('qr_viewed'); })
      .catch(() => toast.error('Could not generate the QR code'));
  }, [open, storeUrl]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${merchantName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-store-qr.png`;
    a.click();
    logEvent('qr_downloaded');
  };

  const printPoster = () => {
    if (!dataUrl) return;
    const w = window.open('', '_blank', 'width=800,height=1000');
    if (!w) { toast.error('Allow pop-ups to print the poster'); return; }
    w.document.write(`<!doctype html><html><head><title>${merchantName} – Scan to order</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; text-align: center; color: #111; }
        h1 { font-size: 40px; margin: 0 0 8px; }
        p.sub { font-size: 20px; color: #555; margin: 0 0 32px; }
        img { width: 380px; height: 380px; }
        p.cta { font-size: 28px; font-weight: 700; margin-top: 28px; }
        p.url { font-size: 14px; color: #666; word-break: break-all; margin-top: 10px; }
      </style></head><body>
      <h1>${merchantName}</h1>
      <p class="sub">Order online for pickup or delivery</p>
      <img src="${dataUrl}" alt="QR code for ${merchantName} store" />
      <p class="cta">Scan to order</p>
      <p class="url">${storeUrl}</p>
      <script>window.onload = () => { window.focus(); window.print(); };<\/script>
      </body></html>`);
    w.document.close();
    logEvent('qr_printed');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Store QR – {merchantName}</DialogTitle></DialogHeader>
        <div ref={printRef} className="flex flex-col items-center gap-3">
          {dataUrl ? (
            <img src={dataUrl} alt={`QR code linking to ${merchantName} store`} className="w-56 h-56 rounded-md border bg-white p-2" />
          ) : (
            <div className="w-56 h-56 rounded-md border animate-pulse bg-muted" />
          )}
          <p className="text-xs text-muted-foreground break-all text-center">{storeUrl}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4 mr-1" />PNG</Button>
          <Button variant="outline" size="sm" onClick={printPoster}><Printer className="h-4 w-4 mr-1" />Poster</Button>
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(storeUrl); toast.success('Link copied'); logEvent('qr_link_copied'); }}>
            <Copy className="h-4 w-4 mr-1" />Link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
