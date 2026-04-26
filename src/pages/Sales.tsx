import AppLayout from '@/components/AppLayout';
import { useSales } from '@/hooks/useSales';
import { useInventory } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';
import QueryErrorState from '@/components/QueryErrorState';
import { useState } from 'react';
import { useAuth } from '@/context/auth-hooks';
import VehicleDetailDialog from '@/components/VehicleDetailDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';
import { Vehicle } from '@/types/inventory';
import { FileText } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { toast } from '@/components/ui/toast-utils';

export default function Sales() {
  const { sales, isLoading: salesLoading, isError: salesError } = useSales();
  const { vehicles, isLoading: vehiclesLoading, isError: vehiclesError } = useInventory();
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const { user, token } = useAuth();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ base64: string; name: string; type: string } | null>(null);
  const isStaff = user?.role === 'STAFF';

  if (salesLoading || vehiclesLoading) return <div className="p-8 text-center text-muted-foreground">Loading sales...</div>;
  if (salesError || vehiclesError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load sales"
          description="At least one sales-related API request failed."
        />
      </AppLayout>
    );
  }

  const totalRevenue = sales.reduce((s, sale) => s + sale.salePrice, 0);
  const totalProfit = sales.reduce((s, sale) => s + sale.profit, 0);
  const avgProfit = sales.length > 0 ? Math.round(totalProfit / sales.length) : 0;

  const handleVehicleClick = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (vehicle) setSelectedVehicle(vehicle);
  };

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
          type: 'Final Vehicle Record'
        });
        setViewerOpen(true);
      } else {
        toast.error('No document available.');
      }
    } catch (e) {
      toast.error('Error loading document.');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5 page-enter">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Sales</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{sales.length} units finalized</p>
        </div>

        {/* Stats */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 md:mx-0 md:px-0 scrollbar-hide">
          <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
            <p className="text-[11px] text-muted-foreground font-medium">Total Revenue</p>
            <p className="text-lg font-semibold text-foreground mt-0.5 tabular-nums">${totalRevenue.toLocaleString()}</p>
          </div>
          {!isStaff && (
            <>
              <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
                <p className="text-[11px] text-muted-foreground font-medium">Total Profit</p>
                <p className="text-lg font-semibold text-profit mt-0.5 tabular-nums">${totalProfit.toLocaleString()}</p>
              </div>
              <div className="stat-card min-w-[160px] md:min-w-0 flex-shrink-0 py-3 px-4">
                <p className="text-[11px] text-info font-medium">Avg Profit / Unit</p>
                <p className="text-lg font-semibold text-info mt-0.5 tabular-nums">${avgProfit.toLocaleString()}</p>
              </div>
            </>
          )}
        </div>

        {/* Mobile View: Cards - Premium Design */}
        <div className="grid grid-cols-1 gap-4 md:hidden pb-6">
          {sales.length > 0 ? (
            sales.map((sale) => {
              const vehicle = vehicles.find(v => v.id === sale.vehicleId);
              return (
                <div 
                  key={sale.id} 
                  onClick={() => handleVehicleClick(sale.vehicleId)}
                  className="relative p-4 rounded-2xl bg-card/60 backdrop-blur-md border border-border shadow-lg shadow-black/5 active:scale-[0.98] transition-all duration-300 cursor-pointer overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="relative z-10 flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-foreground leading-tight tracking-tight">
                        {vehicle ? `${vehicle.make} ${vehicle.model}` : `ID: ${sale.vehicleId.slice(-8)}`}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Sold to <span className="font-medium text-foreground">{sale.customerName}</span></p>
                    </div>
                    <div className="flex items-center gap-2">
                      {vehicle?.hasDocument && (
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
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border shadow-sm",
                        sale.paymentMethod === 'Cash' ? 'bg-profit/10 text-profit border-profit/20' :
                        sale.paymentMethod === 'Loan' ? 'bg-info/10 text-info border-info/20' :
                        'bg-muted text-muted-foreground border-border'
                      )}>
                        {sale.paymentMethod}
                      </span>
                    </div>
                  </div>
                  
                  <div className="relative z-10 flex items-center justify-between py-3 border-y border-border/50 my-3 bg-muted/10 rounded-xl px-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Sale Date</p>
                      <p className="text-sm font-bold text-foreground">{new Date(sale.saleDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Sale Price</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">${sale.salePrice.toLocaleString()}</p>
                    </div>
                  </div>

                  {!isStaff && (
                    <div className="relative z-10 flex justify-between items-center mt-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-profit animate-pulse" />
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Completed</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Net Profit</p>
                        <p className={cn("text-xl font-bold tabular-nums", sale.profit >= 0 ? "text-profit" : "text-loss")}>
                          ${sale.profit.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center bg-card/40 rounded-2xl border border-dashed border-border">
              <p className="text-muted-foreground text-sm font-medium">No sales recorded yet.</p>
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
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Price</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Payment</th>
                  {!isStaff && <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Profit</th>}
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const vehicle = vehicles.find(v => v.id === sale.vehicleId);
                  return (
                    <tr 
                      key={sale.id} 
                      onClick={() => handleVehicleClick(sale.vehicleId)}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground text-sm">{vehicle ? `${vehicle.make} ${vehicle.model}` : sale.vehicleId}</p>
                        <p className="text-[11px] text-muted-foreground">{vehicle?.year} · {vehicle?.color}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{sale.customerName}</p>
                        <p className="text-[11px] text-muted-foreground">{sale.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{new Date(sale.saleDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground tabular-nums">${sale.salePrice.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-semibold border",
                            sale.paymentMethod === 'Cash' ? 'bg-profit/10 text-profit border-profit/20' :
                            sale.paymentMethod === 'Loan' ? 'bg-info/10 text-info border-info/20' :
                            'bg-muted text-muted-foreground border-border'
                          )}>
                            {sale.paymentMethod}
                          </span>
                          {vehicle?.hasDocument && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickPreview(vehicle);
                              }}
                              className="p-1 rounded-md text-profit/60 hover:text-profit hover:bg-profit/10 transition-colors"
                              title="Preview Bill of Sale"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      {!isStaff && (
                        <td className="px-4 py-3">
                          <span className={cn("font-semibold text-sm tabular-nums", sale.profit >= 0 ? "text-profit" : "text-loss")}>
                            ${sale.profit.toLocaleString()}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
        documentBase64={viewerDoc?.base64 || null}
        vehicleName={viewerDoc?.name || ''}
        documentType={viewerDoc?.type || ''}
      />
    </AppLayout>
  );
}
