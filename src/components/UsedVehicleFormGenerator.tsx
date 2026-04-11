import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileUp, CheckCircle2, Download, FileArchive, Database } from 'lucide-react';
import { toast } from 'sonner';
import { ExtractedVehicleDocumentInfo } from '@/types/inventory';
import { apiUrl } from '@/lib/api';

interface UsedVehicleFormGeneratorProps {
  token: string | null;
  onScanComplete: (data: ExtractedVehicleDocumentInfo) => void;
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
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async (pushToInventory: boolean) => {
    if (!sourceFile) {
      toast.error('Choose the CamScanner file first.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('sourceFile', sourceFile);
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
        throw new Error(errorData.message || 'Failed to generate used vehicle form');
      }

      const data = (await response.json()) as GenerateUsedVehicleResponse & { inventoryAdded?: boolean };
      onScanComplete(data.info);
      downloadPdf(data.pdfBase64, data.fileName);

      const message = data.inventoryAdded 
        ? 'Form generated and vehicle added to inventory.' 
        : 'Used vehicle form generated.';

      toast.success(message, {
        icon: <CheckCircle2 className="w-4 h-4 text-profit" />,
      });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Could not generate the used vehicle form.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-profit">
          Used Vehicle Record
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          Upload the CamScanner document and we&apos;ll fill it into the built-in blank
          Used Vehicle Record sheet automatically, then download the completed PDF.
        </p>
      </div>

      <button
        type="button"
        onClick={() => sourceInputRef.current?.click()}
        className="w-full rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-profit/15 text-profit">
            <FileUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">CamScanner Source</p>
            <p className="text-xs text-zinc-500">
              {sourceFile ? sourceFile.name : 'Choose the bill of sale or scan'}
            </p>
          </div>
        </div>
      </button>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          disabled={loading || !sourceFile}
          onClick={() => handleGenerate(false)}
          className="flex-1 border-profit text-profit hover:bg-profit/10 hover:text-profit"
        >
          <FileArchive className="mr-2 h-4 w-4" />
          {loading ? 'Processing...' : 'Save to Logs Only'}
        </Button>

        <Button
          type="button"
          disabled={loading || !sourceFile}
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
        accept="image/*,.pdf,.doc,.docx"
        onChange={(event) => setSourceFile(event.target.files?.[0] || null)}
      />
    </div>
  );
}

function downloadPdf(base64: string, fileName: string) {
  let cleanBase64 = base64;
  if (cleanBase64.includes('base64,')) {
    cleanBase64 = cleanBase64.split('base64,')[1];
  }
  cleanBase64 = cleanBase64.replace(/\s/g, ''); // strip any potential whitespace

  const binary = window.atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
}
