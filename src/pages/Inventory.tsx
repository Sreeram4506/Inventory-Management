import AppLayout from '@/components/AppLayout';
import { useInventory } from '@/hooks/useInventory';
import { Vehicle } from '@/types/inventory';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Search, Plus, Filter } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddVehicleDialog from '@/components/AddVehicleDialog';
import QueryErrorState from '@/components/QueryErrorState';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import { Pencil, MoreVertical } from 'lucide-react';

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
  const { vehicles, isLoading, isError } = useInventory();

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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-display text-foreground">Vehicle Inventory</h1>
            <p className="text-muted-foreground mt-1 text-sm md:text-base">
              {vehicles.length} vehicles total · {vehicles.filter(v => v.status === 'Available').length} available
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2 w-full md:w-auto h-12 md:h-10 text-base md:text-sm font-semibold">
            <Plus className="w-5 h-5 md:w-4 md:h-4" /> Add Vehicle
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by make, model, VIN..."
            className="pl-10 h-12 md:h-10 bg-muted/20 border-border/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Stats Grid - Horizontal Scroll on Mobile */}
        <div className="flex md:grid md:grid-cols-4 gap-4 overflow-x-auto pb-4 md:pb-0 -mx-5 px-5 md:mx-0 md:px-0 scrollbar-hide">
          <div className="stat-card min-w-[200px] md:min-w-0 flex-shrink-0 bg-secondary/30 border-border/50">
            <p className="stat-label uppercase text-[10px] tracking-widest font-bold text-muted-foreground/80">Inventory Value</p>
            <p className="stat-value text-xl md:text-2xl mt-1 text-foreground">${vehicles.filter(v => v.status !== 'Sold').reduce((s, v) => s + (v.totalPurchaseCost || 0), 0).toLocaleString()}</p>
          </div>
          <div className="stat-card min-w-[200px] md:min-w-0 flex-shrink-0 bg-secondary/30 border-border/50">
            <p className="stat-label uppercase text-[10px] tracking-widest font-bold text-muted-foreground/80">Avg Purchase</p>
            <p className="stat-value text-xl md:text-2xl mt-1 text-foreground">${vehicles.length > 0 ? Math.round(vehicles.reduce((s, v) => s + (v.purchasePrice || 0), 0) / vehicles.length).toLocaleString() : 0}</p>
          </div>
          <div className="stat-card min-w-[200px] md:min-w-0 flex-shrink-0 bg-secondary/30 border-border/50">
            <p className="stat-label uppercase text-[10px] tracking-widest font-bold text-muted-foreground/80">Available</p>
            <p className="stat-value text-xl md:text-2xl mt-1 text-profit">{vehicles.filter(v => v.status === 'Available').length}</p>
          </div>
          <div className="stat-card min-w-[200px] md:min-w-0 flex-shrink-0 bg-secondary/30 border-border/50">
            <p className="stat-label uppercase text-[10px] tracking-widest font-bold text-warning-foreground bg-warning/20 px-2 py-0.5 rounded-sm inline-block">Aging (60+)</p>
            <p className="stat-value text-xl md:text-2xl mt-1 text-warning">{vehicles.filter(v => (v.daysInInventory ?? 0) >= 60 && v.status !== 'Sold').length}</p>
          </div>
        </div>

        {/* Mobile View: Cards */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {filtered.length > 0 ? (
            filtered.map((vehicle) => (
              <div 
                key={vehicle.id} 
                onClick={() => setSelectedVehicle(vehicle)}
                className="stat-card bg-card border-border/50 p-4 relative overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg text-foreground">{vehicle.make} {vehicle.model}</h3>
                    <p className="text-xs text-muted-foreground font-mono tracking-wider">{vehicle.vin}</p>
                  </div>
                  <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border tracking-widest", statusStyles[vehicle.status])}>
                    {vehicle.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 py-3 border-y border-border/50 my-2">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-bold mb-0.5 tracking-wider">Year/Miles</p>
                    <p className="text-sm font-medium text-foreground">{vehicle.year} · {vehicle.mileage.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-bold mb-0.5 tracking-wider">Aging</p>
                    <p className={cn("text-sm font-medium", vehicle.daysInInventory >= 60 ? "text-warning" : "text-foreground")}>
                      {vehicle.daysInInventory} Days
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-2">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-bold mb-0.5 tracking-wider">Total Cost</p>
                    <p className="text-xl font-display font-bold text-profit">${vehicle.totalPurchaseCost.toLocaleString()}</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2 h-10 border-border/50 text-xs font-bold uppercase tracking-widest">
                    Manage Cost
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-muted-foreground font-medium italic">No vehicles match your search.</div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block bg-card rounded-xl border border-border shadow-lg shadow-black/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Vehicle</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">VIN</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Year</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Purchase</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Total Cost</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Days</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Manage</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vehicle) => (
                  <tr 
                    key={vehicle.id} 
                    onClick={() => setSelectedVehicle(vehicle)}
                    className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-foreground tracking-tight">{vehicle.make} {vehicle.model}</p>
                        <p className="text-xs text-muted-foreground font-medium">{vehicle.color} · {vehicle.mileage.toLocaleString()} mi</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground font-mono tracking-tight">{vehicle.vin.slice(-8)}</td>
                    <td className="px-6 py-4 text-sm text-foreground font-medium">{vehicle.year}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-foreground">${vehicle.purchasePrice.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-bold text-profit">${vehicle.totalPurchaseCost.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={cn("text-sm font-bold", vehicle.daysInInventory >= 60 ? "text-warning" : "text-foreground")}>
                        {vehicle.daysInInventory}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                         <Pencil className="w-4 h-4 text-muted-foreground hover:text-profit" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <AddVehicleDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <VehicleDetailDialog 
        vehicle={selectedVehicle} 
        open={!!selectedVehicle} 
        onOpenChange={(open) => !open && setSelectedVehicle(null)} 
      />
    </AppLayout>
  );
}
