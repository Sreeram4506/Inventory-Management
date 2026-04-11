import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';
import { FileArchive, Download, Search, FileText } from 'lucide-react';
import { openBinaryDocument } from '@/lib/document-service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DocumentLog {
  id: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  documentType: string;
  sourceFileName: string | null;
  createdAt: string;
}

export default function Registry() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<DocumentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [token]);

  const fetchLogs = async () => {
    try {
      const response = await fetch(apiUrl('/registry'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch registry logs', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id: string, customName: string) => {
    toast.promise(
      openBinaryDocument(`/registry/${id}/download`, token, `${customName}.pdf`),
      {
        loading: 'Preparing document for download...',
        success: 'Document downloaded successfully!',
        error: 'Failed to download the document.',
      }
    );
  };

  const filteredLogs = logs.filter(log => {
    const searchStr = `${log.vin} ${log.make} ${log.model} ${log.year} ${log.sourceFileName}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-white">
              <FileArchive className="h-8 w-8 text-profit" />
              Document Registry
            </h1>
            <p className="mt-2 text-zinc-400">
              A permanent historical log of all generated documents and forms.
            </p>
          </div>
          
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              placeholder="Search VIN, Make, Model..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border-zinc-800 bg-zinc-900/50 pl-10 text-white focus-visible:ring-profit/50"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-400">
              <thead className="bg-zinc-900/50 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Date Generated</th>
                  <th className="px-6 py-4 font-medium">Vehicle</th>
                  <th className="px-6 py-4 font-medium">Document Type</th>
                  <th className="px-6 py-4 font-medium">Source File</th>
                  <th className="px-6 py-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">Loading logs...</td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">
                      {searchTerm ? 'No matching documents found.' : 'Your registry is empty. Generate a document to start logging.'}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const vehicleName = [log.year, log.make, log.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
                    const downloadName = `auto-profit-hub-${log.vin ? log.vin.slice(-6) : log.id.slice(-6)}-${log.documentType.replace(/\s+/g, '-')}`;
                    
                    return (
                      <tr key={log.id} className="transition-colors hover:bg-zinc-900/30">
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-white">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">{vehicleName}</div>
                          <div className="text-xs text-zinc-500 font-mono mt-0.5">{log.vin || 'No VIN Extracted'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
                            <FileText className="h-3.5 w-3.5" />
                            {log.documentType}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-zinc-500 truncate max-w-[200px]">
                          {log.sourceFileName || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-profit hover:bg-profit/10 hover:text-profit"
                            onClick={() => handleDownload(log.id, downloadName)}
                          >
                            <Download className="mr-2 h-4 w-4" /> Download
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}


