import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';
import { FileArchive, Download, Search, FileText, Pencil, Trash2, Eye, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useRegistry, DocumentLog } from '@/hooks/useRegistry';
import EditRegistryDialog from '@/components/EditRegistryDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

const DOCUMENT_TYPES = ['All', 'Used Vehicle Record', 'Title', 'Sales Agreement', 'Bill of Sale', 'Repair Invoice', 'Inspection', 'Other'];

export default function Registry() {
  const { token } = useAuth();
  const { logs, isLoading, isError, deleteLog } = useRegistry();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [selectedLog, setSelectedLog] = useState<DocumentLog | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ base64: string; name: string; type: string } | null>(null);

  if (isError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
           <FileArchive className="h-12 w-12 text-loss/50" />
           <h2 className="text-xl font-bold text-white">Could not load registry</h2>
           <p className="text-zinc-500 max-w-xs">There was an error fetching the document logs.</p>
           <Button onClick={() => window.location.reload()} variant="outline" className="border-zinc-800 text-zinc-400">Retry</Button>
        </div>
      </AppLayout>
    );
  }

  const handleDownload = (id: string, customName: string, isSource = false) => {
    if (!token) return;
    const downloadUrl = apiUrl(`/registry/${id}/download?token=${encodeURIComponent(token)}${isSource ? '&type=source' : ''}`);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 60000);
    toast.success(`Downloading ${customName}...`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this log entry?')) return;
    try {
      await deleteLog(id);
      toast.success('Log entry deleted.');
    } catch (err) {
      toast.error('Failed to delete log entry.');
    }
  };

  const handleEdit = (log: DocumentLog) => {
    setSelectedLog(log);
    setEditDialogOpen(true);
  };

  const handleView = async (log: DocumentLog, isSource = false) => {
    if (!token) return;
    try {
      const resp = await fetch(apiUrl(`/registry/${log.id}/data`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to fetch document data');
      const data = await resp.json();
      
      const targetBase64 = isSource ? data.sourceDocumentBase64 : data.documentBase64;
      
      if (targetBase64) {
        let vehicleName = [log.year, log.make, log.model].filter(Boolean).join(' ') || 'Document';
        if (isSource) vehicleName += ' (Source)';
        setViewerDoc({ base64: targetBase64, name: vehicleName, type: isSource ? 'Source Document' : log.documentType });
        setViewerOpen(true);
      } else {
        toast.error(isSource ? 'No original source document available to preview.' : 'No generated document available to preview.');
      }
    } catch (e) {
      toast.error('Error loading document preview.');
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const searchStr = `${log.vin} ${log.make} ${log.model} ${log.year} ${log.sourceFileName}`.toLowerCase();
      const matchesSearch = searchStr.includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'All' || log.documentType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [logs, searchTerm, typeFilter]);

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
              A permanent historical log of all generated and scanned documents.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                placeholder="Search VIN, Make, Model..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border-zinc-800 bg-zinc-900/50 pl-10 text-white focus-visible:ring-profit/50"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] bg-zinc-900/50 border-zinc-800 h-10 text-xs">
                <Filter className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                <SelectValue placeholder="Filter type" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                {DOCUMENT_TYPES.map(dt => (
                  <SelectItem key={dt} value={dt}>{dt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">Loading logs...</td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500">
                      {searchTerm || typeFilter !== 'All' ? 'No matching documents found.' : 'Your registry is empty. Generate a document to start logging.'}
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
                          <div className="flex justify-end gap-2 text-zinc-400">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400"
                                  title="View Document"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-white">
                                <DropdownMenuItem 
                                  className="hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer"
                                  onClick={() => handleView(log)}
                                >
                                  Preview Generated Record
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer"
                                  onClick={() => handleView(log, true)}
                                >
                                  Preview Original Source
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-zinc-800 hover:text-white"
                              onClick={() => handleEdit(log)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-red-500/10 hover:text-red-500"
                              onClick={() => handleDelete(log.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-profit hover:bg-profit/10 hover:text-profit h-8 border border-profit/20 rounded-lg ml-1"
                                >
                                  <Download className="mr-2 h-3.5 w-3.5" /> Download
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-white">
                                <DropdownMenuItem 
                                  className="hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer"
                                  onClick={() => handleDownload(log.id, downloadName)}
                                >
                                  Generated PDF Record
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer"
                                  onClick={() => handleDownload(log.id, downloadName, true)}
                                >
                                  Original Source File
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <EditRegistryDialog 
          log={selectedLog} 
          open={editDialogOpen} 
          onOpenChange={setEditDialogOpen} 
        />
        
        <DocumentViewerDialog
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          documentBase64={viewerDoc?.base64 || null}
          vehicleName={viewerDoc?.name || ''}
          documentType={viewerDoc?.type || ''}
        />
      </div>
    </AppLayout>
  );
}
