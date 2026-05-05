import AppLayout from '@/components/AppLayout';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/context/auth-hooks';
import { Vehicle } from '@/types/inventory';
import { cn } from '@/lib/utils';
// Consolidated icon imports — avoids duplicate module references
import { Search, Plus, ChevronRight, Pencil, Trash2, AlertTriangle, FileText, ShoppingCart, LayoutGrid, List, Receipt } from 'lucide-react';
import { useState, useMemo, useDeferredValue } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddVehicleDialog from '@/components/AddVehicleDialog';
import QueryErrorState from '@/components/QueryErrorState';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
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
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

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
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const isStaff = user?.role === 'STAFF';

  // useDeferredValue keeps the search input responsive while filtering is deferred
  const deferredSearch = useDeferredValue(search);

  // useMemo prevents recalculating the filter on unrelated state changes
  // (e.g., opening a dialog, changing view mode)
  const filtered = useMemo(() => {
    if (!deferredSearch) return vehicles;
    const term = deferredSearch.toLowerCase();
    return vehicles.filter(v =>
      `${v.make} ${v.model} ${v.vin} ${v.year}`.toLowerCase().includes(term)
    );
  }, [vehicles, deferredSearch]);

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

  const handleViewDocument = async (vehicle: Vehicle, type: 'report' | 'source') => {
    if (!token) return;
    try {
      const resp = await fetch(apiUrl(`/vehicles/${vehicle.id}/data`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to fetch document');
      const data = await resp.json();
      
      const base64 = type === 'report' ? data.documentBase64 : data.sourceDocumentBase64;
      if (base64) {
        setViewerDoc({ 
          base64, 
          name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          type: type === 'report' ? 'Used Vehicle Record' : 'Original Source'
        });
        setViewerOpen(true);
      } else {
        toast.error(`No ${type === 'report' ? 'Used Vehicle Record' : 'Original Source'} available for this vehicle.`);
      }
    } catch (e) {
      toast.error('Error loading document.');
    }
  };



  return (
    <AppLayout>
      <div className="space-y-5 page-enter">
        {/* Header & Search */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">Inventory</h1>
              <p className="text-muted-foreground text-sm font-medium mt-1">
                <span className="text-primary font-bold">{vehicles.length}</span> total vehicles <span className="text-border mx-2">|</span> <span className="text-profit font-bold">{vehicles.filter(v => v.status === 'Available').length}</span> ready for sale
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex bg-muted p-1 rounded-xl border border-border/50 mr-2">
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  <List className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setViewMode('grid')}
                  className={cn("p-2 rounded-lg transition-all", viewMode === 'grid' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
              <Button 
                onClick={() => setDialogOpen(true)} 
                className="gap-2 h-11 px-6 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Plus className="w-5 h-5" /> Add New Vehicle
              </Button>
            </div>
          </div>

          <div className="relative w-full max-w-xl group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search by make, model, VIN or status..."
              className="pl-12 h-12 bg-card border-border shadow-sm rounded-2xl text-base focus-visible:ring-primary/20 focus-visible:border-primary transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button 
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg bg-profit/20 text-profit border border-profit/30 shadow-sm active:scale-95 transition-transform"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-border min-w-[160px]">
                          {vehicle.hasDocument && (
                            <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2">
                              <FileText className="w-3.5 h-3.5 mr-2" /> Used Vehicle Record
                            </DropdownMenuItem>
                          )}
                          {vehicle.hasSourceDocument && (
                            <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2">
                              <Receipt className="w-3.5 h-3.5 mr-2" /> Original Source
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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

        {/* Desktop View: Table or Grid */}
        <div className="hidden md:block">
          {viewMode === 'list' ? (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" role="table" aria-label="Vehicle inventory">
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
                        className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer group"
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
                            {(vehicle.hasDocument || vehicle.hasSourceDocument || vehicle.hasBillOfSale) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 text-profit/60 hover:text-profit hover:bg-profit/10"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-white border-border min-w-[160px]">
                                  {vehicle.hasDocument && (
                                    <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'report')} className="text-[10px] font-black uppercase py-2">
                                      <FileText className="w-3.5 h-3.5 mr-2" /> Used Vehicle Record
                                    </DropdownMenuItem>
                                  )}
                                  {vehicle.hasSourceDocument && (
                                    <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'source')} className="text-[10px] font-black uppercase py-2">
                                      <Receipt className="w-3.5 h-3.5 mr-2" /> Original Source
                                    </DropdownMenuItem>
                                  )}
                                  {vehicle.hasBillOfSale && (
                                    <DropdownMenuItem onClick={() => handleViewDocument(vehicle, 'bill_of_sale')} className="text-[10px] font-black uppercase py-2 text-info">
                                      <ShoppingCart className="w-3.5 h-3.5 mr-2" /> Bill of Sale
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
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
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((vehicle) => (
                <div 
                  key={vehicle.id}
                  onClick={() => setSelectedVehicle(vehicle)}
                  className="group relative flex flex-col bg-card/60 backdrop-blur-xl border border-border/50 rounded-3xl overflow-hidden cursor-pointer hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-2"
                >
                  {/* Vehicle "Cover" Image/Gradient */}
                  <div className="relative h-32 overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-card">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent)]" />
                    <div className="absolute bottom-3 left-4">
                       <span className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border backdrop-blur-md shadow-sm", statusStyles[vehicle.status])}>
                         {vehicle.status}
                       </span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-display font-black text-lg text-foreground tracking-tight group-hover:text-primary transition-colors leading-tight">
                          {vehicle.year} {vehicle.make}
                        </h3>
                        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">{vehicle.model}</p>
                      </div>
                      <div className="p-2 bg-muted/50 rounded-xl group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-5 py-3 border-y border-border/30">
                      <div>
                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mb-1">Mileage</p>
                        <p className="text-xs font-bold text-foreground tabular-nums">{vehicle.mileage.toLocaleString()} mi</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mb-1">Aging</p>
                        <p className={cn("text-xs font-bold tabular-nums", vehicle.daysInInventory >= 60 ? "text-warning" : "text-foreground")}>
                          {vehicle.daysInInventory} Days
                        </p>
                      </div>
                    </div>

                    {!isStaff && (
                      <div className="mt-auto">
                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mb-1">Total Investment</p>
                        <p className="text-2xl font-black text-profit tabular-nums tracking-tighter">
                          ${((vehicle.totalPurchaseCost || 0) + (vehicle.repairCost || 0)).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

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
                  className="bg-destructive text-foreground hover:bg-destructive/90 h-9 text-sm"
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
