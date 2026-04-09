import AppLayout from '@/components/AppLayout';
import { useSales } from '@/hooks/useSales';
import { useInventory } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';
import QueryErrorState from '@/components/QueryErrorState';

export default function Sales() {
  const { sales, isLoading: salesLoading, isError: salesError } = useSales();
  const { vehicles, isLoading: vehiclesLoading, isError: vehiclesError } = useInventory();

  if (salesLoading || vehiclesLoading) return <div className="p-8 text-center text-muted-foreground">Loading sales...</div>;
  if (salesError || vehiclesError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load sales"
          description="At least one sales-related API request failed, so this page is not pretending the totals are zero."
        />
      </AppLayout>
    );
  }

  const totalRevenue = sales.reduce((s, sale) => s + sale.salePrice, 0);
  const totalProfit = sales.reduce((s, sale) => s + sale.profit, 0);
  const avgProfit = sales.length > 0 ? Math.round(totalProfit / sales.length) : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-display text-foreground tracking-tight">Sales History</h1>
            <p className="text-muted-foreground mt-1 text-sm md:text-base">{sales.length} units finalized</p>
          </div>
        </div>

        {/* Sales Stats - Scroll on Mobile */}
        <div className="flex md:grid md:grid-cols-3 gap-4 overflow-x-auto pb-4 md:pb-0 -mx-5 px-5 md:mx-0 md:px-0 scrollbar-hide">
          <div className="stat-card min-w-[200px] md:min-w-0 flex-shrink-0 bg-zinc-900/40 border-zinc-800/50">
            <p className="stat-label uppercase text-[10px] tracking-widest font-bold text-zinc-500">Total Revenue</p>
            <p className="stat-value text-xl md:text-2xl mt-1 text-white">${totalRevenue.toLocaleString()}</p>
          </div>
          <div className="stat-card min-w-[200px] md:min-w-0 flex-shrink-0 bg-zinc-900/40 border-zinc-800/50">
            <p className="stat-label uppercase text-[10px] tracking-widest font-bold text-zinc-500">Total Profit</p>
            <p className="stat-value text-xl md:text-2xl mt-1 text-profit font-display">${totalProfit.toLocaleString()}</p>
          </div>
          <div className="stat-card min-w-[200px] md:min-w-0 flex-shrink-0 bg-zinc-900/40 border-zinc-800/50">
            <p className="stat-label uppercase text-[10px] tracking-widest font-bold text-zinc-500 text-info">Avg Profit/Unit</p>
            <p className="stat-value text-xl md:text-2xl mt-1 text-info font-display">${avgProfit.toLocaleString()}</p>
          </div>
        </div>

        {/* Mobile View: Cards */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {sales.length > 0 ? (
            sales.map((sale) => {
              const vehicle = vehicles.find(v => v.id === sale.vehicleId);
              return (
                <div key={sale.id} className="stat-card bg-zinc-900/40 border-zinc-800/50 p-4 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-white">
                        {vehicle ? `${vehicle.make} ${vehicle.model}` : `ID: ${sale.vehicleId.slice(-8)}`}
                      </h3>
                      <p className="text-xs text-zinc-500 font-medium">Sold to {sale.customerName}</p>
                    </div>
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border tracking-widest",
                      sale.paymentMethod === 'Cash' ? 'bg-profit/10 text-profit border-profit/20' :
                      sale.paymentMethod === 'Loan' ? 'bg-info/10 text-info border-info/20' :
                      'bg-muted text-muted-foreground border-border'
                    )}>
                      {sale.paymentMethod}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between py-3 border-y border-zinc-800/50 my-2">
                    <div>
                      <p className="text-[10px] uppercase text-zinc-500 font-bold mb-0.5">Sale Date</p>
                      <p className="text-sm font-medium text-zinc-200">{new Date(sale.saleDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-zinc-500 font-bold mb-0.5">Sale Price</p>
                      <p className="text-sm font-bold text-white">${sale.salePrice.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-end mt-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-profit animate-pulse" />
                      <span className="text-xs text-zinc-400 font-medium">Recorded Success</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-zinc-500 font-bold mb-0.5">Net Profit</p>
                      <p className={cn("text-xl font-display font-bold", sale.profit >= 0 ? "text-profit" : "text-loss")}>
                        ${sale.profit.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-zinc-500 font-medium italic underline decoration-zinc-800 underline-offset-4">No sales recorded yet.</div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden shadow-xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Vehicle</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Customer</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Sale Date</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Sale Price</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Payment</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Profit</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const vehicle = vehicles.find(v => v.id === sale.vehicleId);
                  return (
                    <tr key={sale.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-foreground">{vehicle ? `${vehicle.make} ${vehicle.model}` : sale.vehicleId}</p>
                        <p className="text-xs text-muted-foreground">{vehicle?.year} · {vehicle?.color}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-foreground">{sale.customerName}</p>
                        <p className="text-xs text-muted-foreground">{sale.phone}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground font-medium">{new Date(sale.saleDate).toLocaleDateString()}</td>
                      <td className="px-4 py-4 text-sm font-bold text-foreground font-display text-lg">${sale.salePrice.toLocaleString()}</td>
                      <td className="px-4 py-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border tracking-widest",
                          sale.paymentMethod === 'Cash' ? 'bg-profit/10 text-profit border-profit/20' :
                          sale.paymentMethod === 'Loan' ? 'bg-info/10 text-info border-info/20' :
                          'bg-muted text-muted-foreground border-border'
                        )}>
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn("font-display font-bold text-lg", sale.profit >= 0 ? "text-profit" : "text-loss")}>
                          ${sale.profit.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
