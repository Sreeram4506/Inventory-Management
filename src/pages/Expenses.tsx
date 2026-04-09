import AppLayout from '@/components/AppLayout';
import { useExpenses } from '@/hooks/useExpenses';
import QueryErrorState from '@/components/QueryErrorState';

interface ExpensesProps {
  isSubpage?: boolean;
}

export default function Expenses({ isSubpage = false }: ExpensesProps) {
  const { expenses, isLoading, isError } = useExpenses();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading expenses...</div>;
  
  if (isError) {
    const errorState = (
      <QueryErrorState
        title="Could not load expenses"
        description="The expenses API request failed, so the page is not showing an empty table as if that were valid data."
      />
    );
    return isSubpage ? errorState : <AppLayout>{errorState}</AppLayout>;
  }

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const categories = [...new Set(expenses.map(e => e.category))];

  const content = (
    <div className="space-y-6">
      {!isSubpage && (
        <div className="animate-in slide-in-from-top-4 duration-500">
          <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Business Expenses</h1>
          <p className="text-muted-foreground mt-1">Operational cost tracking</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card bg-secondary/30 border-border/50 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80 lowercase">Total Expenses</p>
          <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">${totalExpenses.toLocaleString()}</p>
        </div>
        <div className="stat-card bg-secondary/30 border-border/50 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Categories</p>
          <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">{categories.length}</p>
        </div>
        <div className="stat-card bg-secondary/30 border-border/50 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Avg Expense</p>
          <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">${expenses.length > 0 ? Math.round(totalExpenses / expenses.length).toLocaleString() : 0}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Category</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Amount</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Date</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Notes</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-bold text-foreground text-sm tracking-tight">{exp.category}</td>
                  <td className="px-6 py-4 font-display font-black text-foreground text-base">${exp.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-xs text-muted-foreground font-black tracking-tight">{new Date(exp.date).toLocaleDateString()}</td>
                  <td className="px-4 py-4 text-xs text-muted-foreground italic">{exp.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return isSubpage ? content : <AppLayout>{content}</AppLayout>;
}
