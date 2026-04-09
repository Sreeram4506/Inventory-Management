import AppLayout from '@/components/AppLayout';
import { useSales } from '@/hooks/useSales';
import { useInventory } from '@/hooks/useInventory';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useExpenses } from '@/hooks/useExpenses';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import QueryErrorState from '@/components/QueryErrorState';

interface CashFlowProps {
  isSubpage?: boolean;
}

export default function CashFlow({ isSubpage = false }: CashFlowProps) {
  const { sales, isLoading: salesLoading, isError: salesError } = useSales();
  const { vehicles, isLoading: invLoading, isError: inventoryError } = useInventory();
  const { ads, isLoading: adsLoading, isError: adsError } = useAdvertising();
  const { expenses, isLoading: expLoading, isError: expensesError } = useExpenses();

  if (salesLoading || invLoading || adsLoading || expLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading cash flow...</div>;
  }
  
  if (salesError || inventoryError || adsError || expensesError) {
    const errorState = (
      <QueryErrorState
        title="Could not load cash flow"
        description="One or more financial data requests failed, so the page is stopping with an explicit error instead of calculating from partial empty data."
      />
    );
    return isSubpage ? errorState : <AppLayout>{errorState}</AppLayout>;
  }

  const totalIncome = sales.reduce((s, sale) => s + (sale.salePrice || 0), 0);
  const totalCarPurchases = vehicles.reduce((s, v) => s + (v.totalPurchaseCost || 0), 0);
  const totalAdSpend = ads.reduce((s, a) => s + (a.amountSpent || 0), 0);
  const totalOpExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalOutgoing = totalCarPurchases + totalAdSpend + totalOpExpenses;
  const cashFlowValue = totalIncome - totalOutgoing;

  const transactions = [
    ...sales.map(s => ({ 
      type: 'income' as const, 
      label: `Sale: ${vehicles.find(v => v.id === s.vehicleId)?.make || 'Unknown'} ${vehicles.find(v => v.id === s.vehicleId)?.model || ''}`, 
      amount: s.salePrice, 
      date: s.saleDate 
    })),
    ...vehicles.map(v => ({ type: 'expense' as const, label: `Purchase: ${v.make} ${v.model}`, amount: v.totalPurchaseCost, date: v.purchaseDate })),
    ...expenses.map(e => ({ type: 'expense' as const, label: e.category, amount: e.amount, date: e.date })),
    ...ads.map(a => ({ type: 'expense' as const, label: `Ad: ${a.campaignName}`, amount: a.amountSpent, date: a.startDate })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const content = (
    <div className="space-y-6">
      {!isSubpage && (
        <div className="animate-in slide-in-from-top-4 duration-500">
          <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Financial Cash Flow</h1>
          <p className="text-muted-foreground mt-1">Movement of capital</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card border-l-4 border-l-profit bg-secondary/30 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Total Income</p>
          <p className="stat-value text-3xl mt-1 text-profit font-display font-black leading-none">${totalIncome.toLocaleString()}</p>
        </div>
        <div className="stat-card border-l-4 border-l-loss bg-secondary/30 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Total Outgoing</p>
          <p className="stat-value text-3xl mt-1 text-loss font-display font-black leading-none">${totalOutgoing.toLocaleString()}</p>
        </div>
        <div className="stat-card border-l-4 border-l-info bg-secondary/30 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Net Cash Flow</p>
          <p className={cn("stat-value text-3xl mt-1 font-display font-black leading-none", cashFlowValue >= 0 ? "text-profit" : "text-loss")}>
            ${cashFlowValue.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30">
          <h3 className="font-display font-bold text-foreground uppercase tracking-widest text-xs">Transaction Registry</h3>
        </div>
        <div className="divide-y divide-border">
          {transactions.map((tx, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors group">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
                  tx.type === 'income' ? 'bg-profit/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-loss/10 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                )}>
                  {tx.type === 'income' ? (
                    <ArrowDownLeft className="w-5 h-5 text-profit" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5 text-loss" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{tx.label}</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{new Date(tx.date).toLocaleDateString()}</p>
                </div>
              </div>
              <span className={cn("font-display font-bold text-lg", tx.type === 'income' ? 'text-profit' : 'text-loss')}>
                {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return isSubpage ? content : <AppLayout>{content}</AppLayout>;
}
