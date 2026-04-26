import AppLayout from '@/components/AppLayout';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/context/auth-hooks';
import { Vehicle } from '@/types/inventory';
import { cn } from '@/lib/utils';
import { Search, Plus, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddVehicleDialog from '@/components/AddVehicleDialog';
import QueryErrorState from '@/components/QueryErrorState';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
import { Pencil, Trash2, AlertTriangle, FileText, Eye } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { toast } from '@/components/ui/toast-utils';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';

const statusStyles: Record<string, string> = {
  Available: 'bg-profit/10 text-profit border-profit/20',
  Reserved: 'bg-warning/10 text-warning border-warning/20',
  Sold: 'bg-info/10 text-info border-info/20',
  Returned: 'bg-destructive/10 text-destructive border-destructive/20',
};

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const { vehicles, isLoading, isError, deleteVehicle } = useInventory();
  const { token, user } = useAuth();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ base64: string; name: string; type: string } | null>(null);
  const isStaff = user?.role === 'STAFF';

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading inventory...</div>;
  if (isError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load inventory"
          description="The inventory API request failed, so the page is not showing fallback zero values."
        />
      </AppLayout>
    );
  }

  const filtered = vehicles.filter(v =>
    `${v.make} ${v.model} ${v.vin} ${v.year}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleQuickPreview = async (vehicle: Vehicle) => {
    if (!token) return;
    try {
      const resp = await fetch(apiUrl(`/vehicles/${vehicle.id}/data`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to fetch document');
      const data = await resp.json();
      
      const base64 = data.documentBase64 || data.sourceDocumentBase64;
      if (base64) {
        setViewerDoc({ 
          base64, 
          name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          type: data.documentBase64 ? 'Generated Record' : 'Source Document'
        });
        setViewerOpen(true);
      } else {
        toast.error('No document available for this vehicle.');
      }
    } catch (e) {
      toast.error('Error loading document.');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5 page-enter">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Inventory</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {vehicles.length} vehicles · {vehicles.filter(v => v.status === 'Available').length} available
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2 h-9 text-sm font-medium">
            <Plus className="w-4 h-4" /> Add Vehicle
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search make, model, VIN..."
            className="pl-9 h-9 bg-muted/30 border-border/60 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Quick Stats */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 md:mx-0 md:px-0 scrollbar-hide">
          {!isStaff && (
            <>
              <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
                <p className="text-[11px] text-muted-foreground font-medium">Total Investment</p>
                <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">${vehicles.filter(v => v.status !== 'Sold').reduce((s, v) => s + (v.totalPurchaseCost || 0) + (v.repairCost || 0), 0).toLocaleString()}</p>
              </div>
              <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
                <p className="text-[11px] text-muted-foreground font-medium">Avg Purchase</p>
                <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">${vehicles.length > 0 ? Math.round(vehicles.reduce((s, v) => s + (v.purchasePrice || 0), 0) / vehicles.length).toLocaleString() : 0}</p>
              </div>
            </>
          )}
          <div className="stat-card min-w-[120px] md:min-w-0 flex-shrink-0 py-3 px-4">
            <p className="text-[11px] text-muted-foreground font-medium">Available</p>
            <p className="text-lg font-semibold text-profit mt-0.5">{vehicles.filter(v => v.status === 'Available').length}</p>
          </div>
          <div className="stat-card min-w-[120px] md:min-w-0 flex-shrink-0 py-3 px-4">
            <p className="text-[11px] text-warning font-medium">Aging (60+)</p>
            <p className="text-lg font-semibold text-warning mt-0.5">{vehicles.filter(v => (v.daysInInventory ?? 0) >= 60 && v.status !== 'Sold').length}</p>
          </div>
        </div>

        {/* Mobile View: Cards - Premium Design */}
        <div className="grid grid-cols-1 gap-4 md:hidden pb-6">
          {filtered.length > 0 ? (
            filtered.map((vehicle) => (
              <div 
                key={vehicle.id} 
                onClick={() => setSelectedVehicle(vehicle)}
                className="relative p-4 rounded-2xl bg-card/60 backdrop-blur-md border border-border shadow-lg shadow-black/5 active:scale-[0.98] transition-all duration-300 cursor-pointer overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="relative z-10 flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-tight tracking-tight">{vehicle.make} {vehicle.model}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{vehicle.vin}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(vehicle.hasDocument || vehicle.hasSourceDocument) && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickPreview(vehicle);
                        }}
                        className="p-1.5 rounded-lg bg-profit/20 text-profit border border-profit/30 shadow-sm active:scale-95 transition-transform"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    )}
                    <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border shadow-sm", statusStyles[vehicle.status])}>
                      {vehicle.status}
                    </span>
                  </div>
                </div>
                
                <div className="relative z-10 grid grid-cols-2 gap-4 py-3 border-y border-border/50 my-3 bg-muted/10 rounded-xl px-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Year / Miles</p>
                    <p className="text-sm font-bold text-foreground">{vehicle.year} <span className="text-muted-foreground font-normal mx-1">•</span> {vehicle.mileage.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Days</p>
                    <p className={cn("text-sm font-bold", vehicle.daysInInventory >= 60 ? "text-warning" : "text-foreground")}>
                      {vehicle.daysInInventory}
                    </p>
                  </div>
                </div>

                {!isStaff && (
                  <div className="relative z-10 flex justify-between items-center mt-1">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Total Investment</p>
                      <p className="text-xl font-bold text-profit tabular-nums">${((vehicle.totalPurchaseCost || 0) + (vehicle.repairCost || 0)).toLocaleString()}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <ChevronRight className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-16 text-center bg-card/40 rounded-2xl border border-dashed border-border">
              <p className="text-muted-foreground text-sm font-medium">No vehicles match your search.</p>
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block bg-card rounded-xl border border-border/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Vehicle</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">VIN</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Year</th>
                  {!isStaff && (
                    <>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Purchase</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Cost</th>
                    </>
                  )}
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Days</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vehicle) => (
                  <tr 
                    key={vehicle.id} 
                    onClick={() => setSelectedVehicle(vehicle)}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground text-sm">{vehicle.make} {vehicle.model}</p>
                      <p className="text-[11px] text-muted-foreground">{vehicle.color} · {vehicle.mileage.toLocaleString()} mi</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{vehicle.vin.slice(-8)}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{vehicle.year}</td>
                    {!isStaff && (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-foreground tabular-nums">${vehicle.purchasePrice.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-profit tabular-nums">${((vehicle.totalPurchaseCost || 0) + (vehicle.repairCost || 0)).toLocaleString()}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <span className={cn("text-sm font-medium", vehicle.daysInInventory >= 60 ? "text-warning" : "text-foreground")}>
                        {vehicle.daysInInventory}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold border", statusStyles[vehicle.status])}>
                          {vehicle.status}
                        </span>
                        {(vehicle.hasDocument || vehicle.hasSourceDocument) && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-7 p-0 text-profit/60 hover:text-profit hover:bg-profit/10"
                            title="Quick Preview Document"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickPreview(vehicle);
                            }}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedVehicle(vehicle)}>
                           <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setVehicleToDelete(vehicle)}
                        >
                           <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AlertDialog open={!!vehicleToDelete} onOpenChange={(open) => !open && setVehicleToDelete(null)}>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  </div>
                  <AlertDialogTitle className="text-lg font-bold text-foreground">Delete Vehicle</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-muted-foreground text-sm">
                  Are you sure you want to delete <span className="text-foreground font-medium">{vehicleToDelete?.year} {vehicleToDelete?.make} {vehicleToDelete?.model}</span>? 
                  This will permanently remove all associated records. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4 gap-2">
                <AlertDialogCancel className="h-9 text-sm">Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  className="bg-destructive text-white hover:bg-destructive/90 h-9 text-sm"
                  onClick={async () => {
                    if (vehicleToDelete) {
                      await deleteVehicle(vehicleToDelete.id);
                      setVehicleToDelete(null);
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <AddVehicleDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
        onViewExisting={(id) => {
          setDialogOpen(false);
          const existing = vehicles.find(v => v.id === id);
          if (existing) {
            setSelectedVehicle(existing);
          }
        }}
      />
      <VehicleDetailDialog 
        vehicle={selectedVehicle} 
        open={!!selectedVehicle} 
        onOpenChange={(open) => !open && setSelectedVehicle(null)} 
      />
      <DocumentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        documentBase64={viewerDoc?.base64 || null}
        vehicleName={viewerDoc?.name || ''}
        documentType={viewerDoc?.type || ''}
      />
    </AppLayout>
  );
}
