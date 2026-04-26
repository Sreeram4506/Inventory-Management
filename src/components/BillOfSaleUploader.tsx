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
  const [files, setFiles] = useState<File[]>([]);
  const [vin, setVin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const urlVin = searchParams.get('vin');
    if (urlVin) setVin(urlVin.toUpperCase());
  }, [searchParams]);

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Choose the Bill of Sale file(s) first.');
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: files.length });

    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const currentFile = files[i];
      setProgress({ current: i + 1, total: files.length });

      const formData = new FormData();
      formData.append('file', currentFile);
      
      // Only apply manual fallback if processing a single file
      if (files.length === 1) {
        if (vin) formData.append('vin', vin.trim().toUpperCase());
        if (customerName) formData.append('customerName', customerName.trim());
      }

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

          if (data.pdfBase64 && files.length === 1) {
            downloadPdf(data.pdfBase64, data.fileName || `UsedVehicleRecord_${data.vin}.pdf`);
          }
          successCount++;
        }
      } catch (error: any) {
        console.error(error);
        toast.error(`Failed ${currentFile.name}: ${error.message}`);
      }
    }

    if (successCount > 0) {
      // Refresh all relevant tables
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['registry'] });

      toast.success(`Successfully processed ${successCount} sales documents.`, {
        icon: <CheckCircle2 className="w-4 h-4 text-profit" />,
      });
    }

    setFiles([]);
    setVin('');
    setCustomerName('');
    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-profit">
          Mark as Sold (Bulk)
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Upload Bills of Sale. VINs will be matched against your inventory.
          Matched vehicles will be moved to <span className="text-profit font-medium">SOLD</span>.
        </p>
      </div>

      <div className="space-y-3">
        {files.length <= 1 && (
          <div className="grid gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="relative">
              <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="VIN Fallback (Single file only)"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                className="pl-10 bg-zinc-900/50 border-zinc-800 focus:border-profit/50 h-11"
              />
            </div>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Customer Fallback (Single file only)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="pl-10 bg-zinc-900/50 border-zinc-800 focus:border-profit/50 h-11"
              />
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-profit/15 text-profit">
              <FileUp className="h-5 w-5" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-white">Bill of Sale Document(s)</p>
              <p className="text-xs text-zinc-500 truncate">
                {files.length > 0 
                  ? `${files.length} files selected (${files.map(f => f.name).join(', ')})` 
                  : 'Click to select or drag multiple files'}
              </p>
            </div>
          </div>
        </button>
      </div>

      {loading && (
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            <span>Marking Sold...</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-profit transition-all duration-500" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <Button
        type="button"
        disabled={loading || files.length === 0}
        onClick={handleUpload}
        className="w-full bg-profit hover:bg-profit/90 text-black font-semibold h-11"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing Batch...
          </>
        ) : (
          <>
            <FileText className="mr-2 h-4 w-4" />
            Process Documents
          </>
        )}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.pdf"
        onChange={(event) => {
          const selectedFiles = Array.from(event.target.files || []);
          setFiles(selectedFiles);
        }}
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
