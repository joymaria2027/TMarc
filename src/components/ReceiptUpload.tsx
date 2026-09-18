import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Camera, Upload, CheckCircle2, Loader2, Image } from 'lucide-react';

interface ReceiptUploadProps {
  deliveryId: string;
  orderReference: string | null;
  userId: string;
  onUploaded?: () => void;
}

export default function ReceiptUpload({ deliveryId, orderReference, userId, onUploaded }: ReceiptUploadProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/${deliveryId}_${Date.now()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from('receipts')
        .upload(path, file);

      if (storageError) throw storageError;

      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(path);

      const { error: dbError } = await supabase.from('delivery_receipts').insert({
        delivery_id: deliveryId,
        receipt_url: path,
        uploaded_by: userId,
      });


      if (dbError) throw dbError;

      // Mark delivery as having receipt attached
      await supabase.from('deliveries').update({ receipt_attached: true }).eq('id', deliveryId);

      setUploaded(true);
      toast.success('Receipt uploaded.');
      onUploaded?.();
      setTimeout(() => setOpen(false), 1000);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Camera className="h-4 w-4 mr-2" />Attach Receipt
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload Delivery Receipt</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {orderReference && (
              <div className="text-sm bg-muted p-3 rounded-lg">
                <span className="text-muted-foreground">Order Reference:</span>{' '}
                <span className="font-semibold">{orderReference}</span>
              </div>
            )}

            {uploaded ? (
              <div className="flex flex-col items-center py-6 text-accent">
                <CheckCircle2 className="h-12 w-12 mb-2" />
                <p className="font-medium">Receipt Uploaded!</p>
              </div>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />

                {preview ? (
                  <div className="relative">
                    <img src={preview} alt="Receipt preview" loading="lazy" decoding="async" className="w-full rounded-lg max-h-64 object-contain bg-muted" />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 flex flex-col items-center gap-2 hover:border-primary/50 transition-colors"
                  >
                    <Image className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Tap to take photo or select image</p>
                  </button>
                )}

                <div className="flex gap-2">
                  <Button onClick={() => fileRef.current?.click()} variant="outline" className="flex-1" disabled={uploading}>
                    <Upload className="h-4 w-4 mr-2" />Select Photo
                  </Button>
                  <Button onClick={handleUpload} className="flex-1" disabled={!preview || uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                    Upload
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
