import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone, Receipt, TrendingUp, BarChart3, Loader2 } from 'lucide-react';
import { useInventory } from '@/hooks/useInventory';
import { useSales } from '@/hooks/useSales';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useExpenses } from '@/hooks/useExpenses';
import Advertising from './Advertising';
import Expenses from './Expenses';
import CashFlowPage from './CashFlow';
import AddExpenseDialog from '@/components/AddExpenseDialog';
import AddAdvertisingDialog from '@/components/AddAdvertisingDialog';
import { Button } from '@/components/ui/button';

export default function Reports() {
  // Pre-fetch all data at once to make switcher instant
  const { isLoading: invLoading } = useInventory();
  const { isLoading: salesLoading } = useSales();
  const { isLoading: adsLoading } = useAdvertising();
  const { isLoading: expLoading } = useExpenses();
  
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [advertisingDialogOpen, setAdvertisingDialogOpen] = useState(false);
  
  const isGlobalLoading = invLoading || salesLoading || adsLoading || expLoading;

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold font-display text-foreground tracking-tighter">Business Reports</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 font-medium">
              <BarChart3 className="w-5 h-5 text-profit" />
              Comprehensive financial and marketing insights
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setExpenseDialogOpen(true)}
              variant="outline" 
              className="border-profit/30 text-profit hover:bg-profit/10 h-11 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-profit/5"
            >
              <Receipt className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
            <Button 
              onClick={() => setAdvertisingDialogOpen(true)}
              className="bg-profit text-zinc-950 hover:bg-profit/90 h-11 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-profit/20 transition-all hover:scale-105 active:scale-95"
            >
              <Megaphone className="w-4 h-4 mr-2" />
              Add Advertising
            </Button>
          </div>
        </div>

        {isGlobalLoading ? (
          <div className="h-[60vh] flex flex-col items-center justify-center gap-4 bg-muted/20 border border-border rounded-2xl animate-pulse">
            <Loader2 className="w-10 h-10 text-profit animate-spin" />
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">Compiling Analytics Data...</p>
          </div>
        ) : (
          <Tabs defaultValue="cash-flow" className="w-full">
            <TabsList className="bg-secondary/50 border border-border p-1.5 h-16 w-full md:w-auto grid grid-cols-3 md:flex gap-2">
            <TabsTrigger 
              value="cash-flow" 
              className="data-[state=active]:bg-profit data-[state=active]:text-zinc-950 flex items-center gap-2 px-8 rounded-lg text-sm font-black uppercase tracking-widest transition-all duration-300 shadow-sm"
            >
              <TrendingUp className="w-5 h-5" />
              <span className="hidden md:inline">Cash Flow</span>
              <span className="md:hidden">Cash</span>
            </TabsTrigger>
            <TabsTrigger 
              value="expenses" 
              className="data-[state=active]:bg-profit data-[state=active]:text-zinc-950 flex items-center gap-2 px-8 rounded-lg text-sm font-black uppercase tracking-widest transition-all duration-300 shadow-sm"
            >
              <Receipt className="w-5 h-5" />
              <span className="hidden md:inline">Expenses</span>
              <span className="md:hidden">Exp</span>
            </TabsTrigger>
            <TabsTrigger 
              value="advertising" 
              className="data-[state=active]:bg-profit data-[state=active]:text-zinc-950 flex items-center gap-2 px-8 rounded-lg text-sm font-black uppercase tracking-widest transition-all duration-300 shadow-sm"
            >
              <Megaphone className="w-5 h-5" />
              <span className="hidden md:inline">Advertising</span>
              <span className="md:hidden">Ads</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-8 bg-zinc-900/20 rounded-2xl border border-zinc-800/50 p-1 min-h-[600px]">
             {/* Sub-pages need to be stripped of their AppLayout to avoid nesting */}
             <TabsContent value="cash-flow" className="m-0 focus-visible:ring-0">
                <CashFlowContent />
             </TabsContent>
             <TabsContent value="expenses" className="m-0 focus-visible:ring-0">
                <ExpensesContent />
             </TabsContent>
             <TabsContent value="advertising" className="m-0 focus-visible:ring-0">
                <AdvertisingContent />
             </TabsContent>
          </div>
        </Tabs>
      )}
      
      <AddExpenseDialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen} />
      <AddAdvertisingDialog open={advertisingDialogOpen} onOpenChange={setAdvertisingDialogOpen} />
    </div>
  </AppLayout>
);
}

// We wrap the existing logic into Content components
function AdvertisingContent() {
  return <Advertising isSubpage />;
}

function ExpensesContent() {
  return <Expenses isSubpage />;
}

function CashFlowContent() {
  return <CashFlowPage isSubpage />;
}
