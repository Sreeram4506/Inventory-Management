import AppLayout from '@/components/AppLayout';
import StatCard from '@/components/StatCard';
import { useInventory } from '@/hooks/useInventory';
import { useSales } from '@/hooks/useSales';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useExpenses } from '@/hooks/useExpenses';
import { useTeam } from '@/hooks/useTeam';
import { useAuth } from '@/context/auth-hooks';
import { Car, ShoppingCart, DollarSign, TrendingUp, Package, Megaphone, Users } from 'lucide-react';
import QueryErrorState from '@/components/QueryErrorState';
import { lazy, Suspense, useState } from 'react';
import RevenueReportDialog from '@/components/RevenueReportDialog';

// Lazy load charts
const ChartsSection = lazy(() => import('./ChartsSection'));

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

export default function Dashboard() {
  const { vehicles, isLoading: invLoading, isError: invError } = useInventory();
  const { sales, isLoading: salesLoading, isError: salesError } = useSales();
  const { ads, isLoading: adsLoading, isError: adsError } = useAdvertising();
  const { expenses, isLoading: expLoading, isError: expError } = useExpenses();
  const { team, isLoading: teamLoading } = useTeam();
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'STAFF';

  const isLoading = invLoading || salesLoading || (isAdmin && (adsLoading || expLoading));
  const anyError = invError || salesError || (isAdmin && (adsError || expError));
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
      <div className="space-y-6 page-enter">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Overview of your dealership performance</p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1.5 bg-profit/8 px-3 py-1.5 rounded-md border border-profit/15">
              <div className="w-1.5 h-1.5 rounded-full bg-profit" />
              <span className="text-[11px] text-profit font-medium">Live Sync</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Inventory" value={invLoading ? "..." : String(vehicles.length)} icon={Car} />
          <StatCard label="Units Sold" value={salesLoading ? "..." : String(sales.length)} icon={ShoppingCart} />
          {!isStaff && (
            <>
              <StatCard label="Inventory Value" value={invLoading ? "..." : `$${inventoryValue.toLocaleString()}`} icon={Package} />
              <StatCard 
                label="Total Revenue" 
                value={salesLoading ? "..." : `$${totalRevenue.toLocaleString()}`} 
                icon={DollarSign} 
                iconClassName="bg-info/15 text-info" 
                onClick={() => setReportModalOpen(true)}
              />
            </>
          )}
          {isAdmin && (
            <>
              <StatCard label="Ad Spend" value={adsLoading ? "..." : `$${totalAdSpend.toLocaleString()}`} icon={Megaphone} iconClassName="bg-warning/15 text-warning" />
              <StatCard label="Net Profit" value={salesLoading ? "..." : `$${totalProfit.toLocaleString()}`} icon={TrendingUp} iconClassName="bg-profit/15 text-profit" />
            </>
          )}
        </div>

        {/* Charts */}
        {!isStaff && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Suspense fallback={
              <div className="lg:col-span-3 flex items-center justify-center h-72 bg-card rounded-xl border border-border/60">
                <div className="text-muted-foreground text-sm">Loading charts...</div>
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
        )}

        {/* Admin sections: Expenses + Team */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Expenses */}
            <div className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Recent Expenses</h3>
                <span className="text-[11px] text-muted-foreground">Last 30 Days</span>
              </div>
              <div className="space-y-2">
                {expLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 w-full animate-pulse bg-muted/50 rounded-lg" />
                  ))
                ) : expenses.length > 0 ? expenses.slice(0, 5).map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                        <DollarSign className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{exp.category}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(exp.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-foreground tabular-nums">${exp.amount.toLocaleString()}</span>
                  </div>
                )) : (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No recent expenses.</div>
                )}
              </div>
            </div>

            {/* Team Performance */}
            <div className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Team Performance</h3>
                <span className="text-[11px] text-muted-foreground">Staff & Managers</span>
              </div>
              <div className="space-y-2">
                {teamLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 w-full animate-pulse bg-muted/50 rounded-lg" />
                  ))
                ) : team.length > 0 ? team.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.name}</p>
                        <p className="text-[11px] text-muted-foreground">{member.role}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground tabular-nums">{member._count?.salesMade || 0} sales</p>
                      <p className="text-[11px] text-muted-foreground">{member._count?.vehiclesAdded || 0} added</p>
                    </div>
                  </div>
                )) : (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No team members found.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <RevenueReportDialog 
        open={reportModalOpen} 
        onOpenChange={setReportModalOpen} 
        sales={sales} 
      />
    </AppLayout>
  );
}
