import { FileBadge2, FileCheck, FileText, MapPin, CalendarDays, Gauge, UserCheck, DollarSign, Eye } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import UsedVehicleFormGenerator from '@/components/UsedVehicleFormGenerator';
import BillOfSaleUploader from '@/components/BillOfSaleUploader';
import { useAuth } from '@/context/auth-hooks';
import { useState } from 'react';
import { ExtractedVehicleDocumentInfo, Vehicle } from '@/types/inventory';
import { useInventory } from '@/hooks/useInventory';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const fieldRows = [
  { key: 'vin', label: 'VIN', icon: FileBadge2 },
  { key: 'purchaseDate', label: 'Purchase Date', icon: CalendarDays },
  { key: 'mileage', label: 'Mileage', icon: Gauge },
  { key: 'purchasedFrom', label: 'Obtained From', icon: FileText },
  { key: 'usedVehicleSourceAddress', label: 'Address', icon: MapPin },
];

export default function UsedVehicleForms() {
  const { token } = useAuth();
  const [extractedInfo, setExtractedInfo] = useState<ExtractedVehicleDocumentInfo | null>(null);
  const [lastGeneratedPdf, setLastGeneratedPdf] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const { vehicles } = useInventory();

  const handleScanComplete = (data: { info: ExtractedVehicleDocumentInfo; pdfBase64: string }) => {
    setExtractedInfo(data.info);
    setLastGeneratedPdf(data.pdfBase64);
  };

  const handleSidebarClick = (e: React.MouseEvent) => {
    // Don't open vehicle dialog if clicking an action button (like Preview)
    if ((e.target as HTMLElement).closest('button')) return;

    if (!extractedInfo?.vin) return;
    const vehicle = vehicles.find(v => v.vin === extractedInfo.vin);
    if (vehicle) {
      setSelectedVehicle(vehicle);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <section className="rounded-[28px] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_32%),linear-gradient(135deg,_rgba(24,24,27,0.98),_rgba(9,9,11,1))] p-8 text-white shadow-2xl shadow-black/20">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex items-center rounded-full border border-profit/30 bg-profit/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-profit">
              PDF Workflow
            </span>
            <h1 className="font-display text-4xl font-bold tracking-tight">
              Manage Used Vehicle Records
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zinc-300">
              Generate or update Used Vehicle forms automatically. Upload a purchase document to log a new vehicle, 
              or a Bill of Sale to fill in the disposition details for an existing vehicle.
            </p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <UsedVehicleFormGenerator
                token={token}
                onScanComplete={handleScanComplete}
              />
              <BillOfSaleUploader
                token={token}
                onUploadComplete={handleScanComplete}
              />
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <h2 className="text-lg font-semibold text-white">How it works</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <StepCard
                  number="01"
                  title="Upload source"
                  description="Choose the CamScanner bill of sale or purchase PDF."
                />
                <StepCard
                  number="02"
                  title="AI VIN Match"
                  description="If updating a record, we'll match it via VIN automatically."
                />
                <StepCard
                  number="03"
                  title="PDF Regeneration"
                  description="The completed PDF downloads with all fields filled accurately."
                />
              </div>
            </div>
          </div>

          <aside 
            onClick={handleSidebarClick}
            className={cn(
              "rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 overflow-y-auto max-h-[80vh] transition-all relative group/sidebar",
              extractedInfo?.vin && "cursor-pointer hover:bg-zinc-900/80 hover:border-zinc-700 active:scale-[0.99]"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-profit/15 text-profit">
                  <FileCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Extracted Details</h2>
                  <p className="text-sm text-zinc-500">Preview of the values going into the PDF.</p>
                </div>
              </div>
              
              {lastGeneratedPdf && (
                <Button 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewerOpen(true);
                  }}
                  className="bg-profit/10 hover:bg-profit/20 text-profit border-profit/20 gap-2 h-9"
                >
                  <Eye className="w-4 h-4" />
                  Preview PDF
                </Button>
              )}
            </div>

            {extractedInfo ? (
                <div className="space-y-6 mt-6">
                  {/* Vehicle Section */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2 font-semibold">Vehicle Identification</p>
                    <p className="font-display text-xl font-bold text-white leading-tight">
                      {[extractedInfo.year, extractedInfo.make, extractedInfo.model].filter(Boolean).join(' ')}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/50 p-2">
                        <p className="text-[10px] uppercase text-zinc-500">VIN</p>
                        <p className="text-xs font-medium text-zinc-200 mt-1 truncate" title={extractedInfo.vin}>{extractedInfo.vin || '—'}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/50 p-2">
                        <p className="text-[10px] uppercase text-zinc-500">Color</p>
                        <p className="text-xs font-medium text-zinc-200 mt-1">{extractedInfo.color || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Seller/Acquisition Section */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="flex items-center gap-2 mb-2">
                       <MapPin className="w-3.5 h-3.5 text-profit" />
                       <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-semibold">Acquisition</p>
                    </div>
                    <p className="font-semibold text-sm text-white">{extractedInfo.purchasedFrom || 'Auction / Dealer'}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {[
                        extractedInfo.usedVehicleSourceAddress, 
                        extractedInfo.usedVehicleSourceCity, 
                        extractedInfo.usedVehicleSourceState
                      ].filter(Boolean).join(', ') || 'No address provided'}
                    </p>
                    <div className="mt-3 flex gap-4 section-meta">
                       <div>
                         <p className="text-[10px] uppercase text-zinc-500">Date</p>
                         <p className="text-xs font-medium text-zinc-200">
                           {extractedInfo.purchaseDate ? new Date(extractedInfo.purchaseDate).toLocaleDateString() : '—'}
                         </p>
                       </div>
                       <div>
                         <p className="text-[10px] uppercase text-zinc-500">In Odometer</p>
                         <p className="text-xs font-medium text-zinc-200">{extractedInfo.mileage?.toLocaleString() || '—'}</p>
                       </div>
                    </div>
                  </div>

                  {/* Disposition Section - ONLY SHOW IF DISPOSED INFO EXISTS */}
                  {(extractedInfo.disposedTo || extractedInfo.disposedPrice) && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 ring-1 ring-profit/20">
                      <div className="flex items-center gap-2 mb-2">
                         <UserCheck className="w-3.5 h-3.5 text-profit" />
                         <p className="text-xs uppercase tracking-[0.2em] text-profit font-semibold">Disposition (Sale)</p>
                      </div>
                      <p className="font-semibold text-sm text-white">{extractedInfo.disposedTo || 'Cash Customer'}</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {[
                          extractedInfo.disposedAddress, 
                          extractedInfo.disposedCity, 
                          extractedInfo.disposedState
                        ].filter(Boolean).join(', ') || 'No address provided'}
                      </p>
                      
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/60">
                           <DollarSign className="w-3.5 h-3.5 text-profit" />
                           <div>
                             <p className="text-[9px] uppercase text-zinc-500 leading-none">Price</p>
                             <p className="text-sm font-bold text-white mt-0.5">
                               {extractedInfo.disposedPrice ? `$${extractedInfo.disposedPrice.toLocaleString()}` : '—'}
                             </p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/60">
                           <Gauge className="w-3.5 h-3.5 text-profit" />
                           <div>
                             <p className="text-[9px] uppercase text-zinc-500 leading-none">Out Miles</p>
                             <p className="text-sm font-bold text-white mt-0.5">
                               {extractedInfo.disposedOdometer?.toLocaleString() || '—'}
                             </p>
                           </div>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-between items-center text-[10px] text-zinc-500 bg-zinc-950/30 p-2 rounded-md">
                         <span>Date: {extractedInfo.disposedDate ? new Date(extractedInfo.disposedDate).toLocaleDateString() : '—'}</span>
                         <span>DL: {extractedInfo.disposedDlNumber || '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 text-sm leading-6 text-zinc-500">
                Generate or update a form once and the extracted vehicle information will appear here so
                you can quickly verify the filled values.
              </div>
            )}
          </aside>
        </div>
      </div>
      <VehicleDetailDialog 
        vehicle={selectedVehicle} 
        open={!!selectedVehicle} 
        onOpenChange={(open) => !open && setSelectedVehicle(null)} 
      />

      <DocumentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        documentBase64={lastGeneratedPdf}
        vehicleName={extractedInfo ? `${extractedInfo.year} ${extractedInfo.make} ${extractedInfo.model}` : "Vehicle"}
        documentType="Used Vehicle Record (Generated)"
      />
    </AppLayout>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-profit">{number}</p>
      <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
    </div>
  );
}

function formatFieldValue(
  key: string,
  info: ExtractedVehicleDocumentInfo
) {
  const value = info[key as keyof ExtractedVehicleDocumentInfo];

  if (!value && value !== 0) {
    return '';
  }

  if (key === 'purchaseDate' && typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  if (key === 'mileage' && typeof value === 'number') {
    return `${value.toLocaleString()} mi`;
  }

  return String(value);
}
