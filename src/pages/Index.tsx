import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import { useInventory } from '@/hooks/useInventory';
import { useSales } from '@/hooks/useSales';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useExpenses } from '@/hooks/useExpenses';
import { Car, ShoppingCart, DollarSign, TrendingUp, Package, Megaphone, Activity } from 'lucide-react';
import QueryErrorState from '@/components/QueryErrorState';
import { lazy, Suspense, useState, useEffect } from 'react';

// Lazy load charts
const ChartsSection = lazy(() => import('./ChartsSection'));

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

export default function Dashboard() {
  const { vehicles, isLoading: invLoading, isError: invError } = useInventory();
  const { sales, isLoading: salesLoading, isError: salesError } = useSales();
  const { ads, isLoading: adsLoading, isError: adsError } = useAdvertising();
  const { expenses, isLoading: expLoading, isError: expError } = useExpenses();

  const isLoading = invLoading || salesLoading || adsLoading || expLoading;
  const anyError = invError || salesError || adsError || expError;
  if (anyError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load dashboard data"
          description="One or more dashboard queries failed, so the overview is showing an error instead of misleading zero-value cards."
        />
      </AppLayout>
    );
  }

  const inventoryStatusData = [
    { name: 'Available', value: vehicles.filter(v => v.status === 'Available').length },
    { name: 'Reserved', value: vehicles.filter(v => v.status === 'Reserved').length },
    { name: 'Sold', value: vehicles.filter(v => v.status === 'Sold').length },
  ];

  const profitData = sales.slice(0, 5).map(s => ({
    vehicle: s.vehicle ? `${s.vehicle.make} ${s.vehicle.model}` : 'Unknown',
    profit: s.profit,
  }));

  const totalRevenue = sales.reduce((sum, s) => sum + s.salePrice, 0);
  const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);
  const totalAdSpend = ads.reduce((sum, a) => sum + a.amountSpent, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const inventoryValue = vehicles.filter(v => v.status !== 'Sold').reduce((sum, v) => sum + (v.totalPurchaseCost || 0) + (v.repairCost || 0), 0);
  
  // Recent sales for AreaChart
  const salesHistory = sales.slice(0, 7).reverse().map(s => ({
    date: new Date(s.saleDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    revenue: s.salePrice,
    profit: s.profit
  }));

  return (
    <AppLayout>
      <div className="space-y-8 pb-12 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold font-display text-white tracking-tight">Performance Overview</h1>
            <p className="text-zinc-400 mt-1 flex items-center gap-2">
              <Activity className="w-4 h-4 text-profit" />
              Real-time analytics for your dealership
            </p>
          </div>
          <div className="flex items-center gap-2 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
            <span className="px-3 py-1.5 rounded-lg bg-profit/10 text-profit text-xs font-semibold uppercase tracking-wider">Live</span>
            <span className="pr-3 text-[11px] text-zinc-500 uppercase font-medium">Auto-Sync Enabled</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Total Inventory" value={invLoading ? "..." : String(vehicles.length)} icon={Car} />
          <StatCard label="Units Sold" value={salesLoading ? "..." : String(sales.length)} icon={ShoppingCart} />
          <StatCard label="Inventory Value" value={invLoading ? "..." : `$${inventoryValue.toLocaleString()}`} icon={Package} />
          <StatCard label="Total Revenue" value={salesLoading ? "..." : `$${totalRevenue.toLocaleString()}`} icon={DollarSign} iconClassName="bg-blue-500 text-white" />
          <StatCard label="Ad Spend" value={adsLoading ? "..." : `$${totalAdSpend.toLocaleString()}`} icon={Megaphone} iconClassName="bg-warning text-black" />
          <StatCard label="Net Profit" value={salesLoading ? "..." : `$${totalProfit.toLocaleString()}`} icon={TrendingUp} iconClassName="bg-profit text-black" />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Suspense fallback={
            <div className="lg:col-span-3 flex items-center justify-center h-80 bg-zinc-900/50 rounded-xl">
              <div className="text-zinc-500">Loading charts...</div>
            </div>
          }>
            <ChartsSection
              salesHistory={salesHistory}
              inventoryStatusData={inventoryStatusData}
              profitData={profitData}
              COLORS={COLORS}
            />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Expenses List */}
          <div className="stat-card bg-zinc-900/40 border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display font-semibold text-xl text-white">Recent Expenses</h3>
              <span className="text-xs text-zinc-500 font-medium tracking-tight">Last 30 Days</span>
            </div>
            <div className="space-y-3">
              {expLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 w-full animate-pulse bg-zinc-900 shadow-lg rounded-xl border border-zinc-800" />
                ))
              ) : expenses.length > 0 ? expenses.slice(0, 5).map((exp) => (
                <div key={exp.id} className="group flex items-center justify-between p-3 rounded-xl border border-zinc-800/50 bg-zinc-950/30 hover:bg-zinc-900/50 transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-400 group-hover:text-profit transition-colors">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{exp.category}</p>
                      <p className="text-[11px] text-zinc-500 uppercase font-bold tracking-wider">{new Date(exp.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className="font-display font-bold text-white text-lg">${exp.amount.toLocaleString()}</span>
                </div>
              )) : (
                <div className="h-48 flex items-center justify-center text-zinc-500 italic text-sm">No recent expenses found.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
