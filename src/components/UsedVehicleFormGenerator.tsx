import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileUp, CheckCircle2, Download, FileArchive, Database } from 'lucide-react';
import { toast } from 'sonner';
import { ExtractedVehicleDocumentInfo } from '@/types/inventory';
import { apiUrl } from '@/lib/api';

interface UsedVehicleFormGeneratorProps {
  token: string | null;
  onScanComplete: (data: { info: ExtractedVehicleDocumentInfo; pdfBase64: string; fileName: string }) => void;
}

interface GenerateUsedVehicleResponse {
  success: boolean;
  info: ExtractedVehicleDocumentInfo;
  fileName: string;
  pdfBase64: string;
}

export default function UsedVehicleFormGenerator({
  token,
  onScanComplete,
}: UsedVehicleFormGeneratorProps) {
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const sourceInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async (pushToInventory: boolean) => {
    if (sourceFiles.length === 0) {
      toast.error('Choose the source file(s) first.');
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: sourceFiles.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < sourceFiles.length; i++) {
      const file = sourceFiles[i];
      setProgress({ current: i + 1, total: sourceFiles.length });

      const formData = new FormData();
      formData.append('sourceFile', file);
      formData.append('pushToInventory', String(pushToInventory));

      try {
        const response = await fetch(apiUrl('/generate-used-vehicle-form'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to generate form');
        }

        const data = (await response.json()) as GenerateUsedVehicleResponse & { inventoryAdded?: boolean };
        
        onScanComplete({ 
          info: data.info, 
          pdfBase64: data.pdfBase64, 
          fileName: data.fileName 
        });

        // For bulk, maybe we don't want to trigger 20 downloads automatically, 
        // but for now we'll keep it consistent.
        if (sourceFiles.length === 1) {
          downloadPdf(data.pdfBase64, data.fileName);
        }

        successCount++;
      } catch (error: any) {
        console.error(error);
        failCount++;
        toast.error(`Failed ${file.name}: ${error.message}`);
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully processed ${successCount} files.`, {
        icon: <CheckCircle2 className="w-4 h-4 text-profit" />,
      });
    }
    
    setLoading(false);
    setSourceFiles([]);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-profit">
          Used Vehicle Record (Bulk)
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Upload documents and we&apos;ll fill them into the blank Record sheets.
          You can select multiple files at once.
        </p>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => sourceInputRef.current?.click()}
        className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-profit/15 text-profit">
            <FileUp className="h-5 w-5" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-white">Record Source(s)</p>
            <p className="text-xs text-zinc-500 truncate">
              {sourceFiles.length > 0 
                ? `${sourceFiles.length} files selected (${sourceFiles.map(f => f.name).join(', ')})` 
                : 'Choose one or more documents'}
            </p>
          </div>
        </div>
      </button>

      {loading && (
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            <span>Processing...</span>
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

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          disabled={loading || sourceFiles.length === 0}
          onClick={() => handleGenerate(false)}
          className="flex-1 border-profit text-profit hover:bg-profit/10 hover:text-profit"
        >
          <FileArchive className="mr-2 h-4 w-4" />
          {loading ? 'Processing...' : 'Save to Logs'}
        </Button>

        <Button
          type="button"
          disabled={loading || sourceFiles.length === 0}
          onClick={() => handleGenerate(true)}
          className="flex-1 bg-profit hover:bg-profit/90 text-black font-semibold"
        >
          <Database className="mr-2 h-4 w-4" />
          {loading ? 'Processing...' : 'Add to Inventory'}
        </Button>
      </div>

      <input
        ref={sourceInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.pdf,.doc,.docx"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          setSourceFiles(files);
        }}
      />
    </div>
  );
}

function downloadPdf(base64: string, fileName: string) {
  try {
    let cleanBase64 = base64;
    // Strip prefixes if present
    if (cleanBase64.includes('base64,')) {
      cleanBase64 = cleanBase64.split('base64,')[1];
    }
    // Remove all whitespace and non-base64 chars
    cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');

    // Chunked decoding for robustness with large strings
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
    
    // Explicitly add to body for cross-browser stability
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Use a very long timeout (60s) to give the PDF viewer ample time to load the blob
    // before it is revoked from memory. 
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch (err) {
    console.error('PDF processing failed:', err);
    toast.error('Failed to process the PDF. Please try again.');
  }
}
