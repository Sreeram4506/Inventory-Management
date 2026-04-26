import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FileUp, CheckCircle2, FileText, Loader2, Fingerprint, User } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiUrl } from '@/lib/api';
import { Input } from '@/components/ui/input';

interface BillOfSaleUploaderProps {
  token: string | null;
  onUploadComplete: (data: { info: any; pdfBase64?: string; fileName?: string }) => void;
}

export default function BillOfSaleUploader({
  token,
  onUploadComplete,
}: BillOfSaleUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [vin, setVin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const urlVin = searchParams.get('vin');
    if (urlVin) setVin(urlVin.toUpperCase());
  }, [searchParams]);

  const handleUpload = async () => {
    if (!file) {
      toast.error('Choose the Bill of Sale file first.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (vin) formData.append('vin', vin.trim().toUpperCase());
    if (customerName) formData.append('customerName', customerName.trim());

    try {
      const response = await fetch(apiUrl('/upload-bill-of-sale'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to process Bill of Sale');
      }

      const data = await response.json();

      if (data.status === 'success') {
        onUploadComplete({
          info: data.info,
          pdfBase64: data.pdfBase64,
          fileName: data.fileName
        });

        // Download the regenerated PDF
        if (data.pdfBase64) {
          downloadPdf(data.pdfBase64, data.fileName || `UsedVehicleRecord_${data.vin}.pdf`);
        }

        // Refresh all relevant tables
        queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['registry'] });

        toast.success(`VIN ${data.vin} matched! Vehicle marked as SOLD.`, {
          icon: <CheckCircle2 className="w-4 h-4 text-profit" />,
        });
      }

      setFile(null);
      setVin('');
      setCustomerName('');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Could not process the Bill of Sale.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-profit">
          Bill of Sale → Mark as Sold
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Upload a Bill of Sale. The VIN will be matched exactly against your inventory.
          If found, the vehicle status changes to <span className="text-profit font-medium">SOLD</span> and a sales record is created.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="VIN (fallback if AI can't extract)"
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            className="pl-10 bg-zinc-900/50 border-zinc-800 focus:border-profit/50 h-11"
          />
        </div>

        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Customer name (fallback if AI can't extract)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="pl-10 bg-zinc-900/50 border-zinc-800 focus:border-profit/50 h-11"
          />
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-profit/15 text-profit">
              <FileUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Bill of Sale Document</p>
              <p className="text-xs text-zinc-500">
                {file ? file.name : 'Click to select or drag and drop'}
              </p>
            </div>
          </div>
        </button>
      </div>

      <Button
        type="button"
        disabled={loading || !file}
        onClick={handleUpload}
        className="w-full bg-profit hover:bg-profit/90 text-black font-semibold h-11"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Matching VIN & Processing...
          </>
        ) : (
          <>
            <FileText className="mr-2 h-4 w-4" />
            Process Bill of Sale
          </>
        )}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        onChange={(event) => setFile(event.target.files?.[0] || null)}
      />
    </div>
  );
}

function downloadPdf(base64: string, fileName: string) {
  try {
    let cleanBase64 = base64;
    if (cleanBase64.includes('base64,')) {
      cleanBase64 = cleanBase64.split('base64,')[1];
    }
    cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');

    const byteCharacters = atob(cleanBase64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    const blob = new Blob(byteArrays, { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch (err) {
    console.error('PDF processing failed:', err);
  }
}
