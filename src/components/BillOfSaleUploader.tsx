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

    const processFile = async (currentFile: File) => {
      const formData = new FormData();
      formData.append('file', currentFile);
      
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
      } finally {
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }
    };

    const batchSize = 2;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(file => processFile(file)));
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
    <div className="rounded-[24px] border border-border bg-white p-6 space-y-6 shadow-sm">
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-profit mb-2">
          Mark as Sold (Bulk)
        </h3>
        <p className="text-sm text-muted-foreground font-medium leading-relaxed">
          Upload Bills of Sale. VINs will be matched against your inventory automatically.
        </p>
      </div>

      <div className="space-y-4">
        {files.length <= 1 && (
          <div className="grid gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="relative">
              <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="VIN Fallback (Optional)"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                className="pl-11 bg-muted/30 border-border rounded-xl h-11 text-sm font-medium focus-visible:ring-primary/20"
              />
            </div>

            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Customer Name Fallback"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="pl-11 bg-muted/30 border-border rounded-xl h-11 text-sm font-medium focus-visible:ring-primary/20"
              />
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-[20px] border border-border bg-muted/30 p-5 text-left transition-all hover:border-primary/40 hover:bg-white hover:shadow-md disabled:opacity-50 group"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-profit/10 text-profit shadow-inner group-hover:scale-110 transition-transform">
              <FileUp className="h-6 w-6" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold text-foreground">Bill of Sale Document(s)</p>
              <p className="text-xs text-muted-foreground font-medium truncate mt-0.5">
                {files.length > 0 
                  ? `${files.length} files selected` 
                  : 'Click to select or drag files'}
              </p>
            </div>
          </div>
        </button>
      </div>

      {loading && (
        <div className="space-y-2 py-2">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-black">
            <span>Marking Sold...</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-profit to-info transition-all duration-500 rounded-full" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <Button
        type="button"
        disabled={loading || files.length === 0}
        onClick={handleUpload}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-12 text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
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
