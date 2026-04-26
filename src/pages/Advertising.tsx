import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useInventory } from '@/hooks/useInventory';
import QueryErrorState from '@/components/QueryErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Megaphone, Trash2, Edit2, Search } from 'lucide-react';
import AddAdvertisingDialog from '@/components/AddAdvertisingDialog';
import { toast } from 'sonner';
import { AdvertisingExpense } from '@/types/inventory';

interface AdvertisingProps {
  isSubpage?: boolean;
}

export default function Advertising({ isSubpage = false }: AdvertisingProps) {
  const { ads, isLoading: adsLoading, isError: adsError, deleteAd } = useAdvertising();
  const { vehicles, isLoading: vehiclesLoading, isError: vehiclesError } = useInventory();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAd, setSelectedAd] = useState<AdvertisingExpense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAds = useMemo(() => {
    return ads.filter(ad => 
      ad.campaignName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ad.platform.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [ads, searchTerm]);

  const totalSpend = useMemo(() => {
    return filteredAds.reduce((s, a) => s + a.amountSpent, 0);
  }, [filteredAds]);

  if (adsLoading || vehiclesLoading) return <div className="p-8 text-center text-muted-foreground">Loading advertising data...</div>;

  if (adsError || vehiclesError) {
    const errorState = (
      <QueryErrorState
        title="Could not load advertising data"
        description="The marketing data request failed, so the page is showing an explicit error instead of empty campaign totals."
      />
    );
    return isSubpage ? errorState : <AppLayout>{errorState}</AppLayout>;
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    try {
      await deleteAd(id);
      toast.success('Campaign deleted successfully');
    } catch (err) {
      toast.error('Failed to delete campaign');
    }
  };

  const handleEdit = (ad: AdvertisingExpense) => {
    setSelectedAd(ad);
    setIsDialogOpen(true);
  };

  const content = (
    <div className="space-y-6">
      {!isSubpage && (
        <div className="animate-in slide-in-from-top-4 duration-500 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Advertising Campaigns</h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">Strategic marketing data</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border-border bg-muted/50 pl-10 text-foreground focus-visible:ring-profit/50"
              />
            </div>
            <Button 
              onClick={() => {
                setSelectedAd(null);
                setIsDialogOpen(true);
              }}
              className="bg-profit text-primary-foreground hover:bg-profit/90 h-11 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-profit/20 flex-shrink-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              Launch Campaign
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card bg-secondary/30 border-border/50 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Total Ad Spend</p>
          <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">${totalSpend.toLocaleString()}</p>
        </div>
        <div className="stat-card bg-secondary/30 border-border/50 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Active Campaigns</p>
          <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">{ads.length}</p>
        </div>
        <div className="stat-card bg-secondary/30 border-border/50 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Avg Cost</p>
          <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">${ads.length > 0 ? Math.round(totalSpend / ads.length).toLocaleString() : 0}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Campaign</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Platform</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Duration</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Amount</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Vehicle</th>
                <th className="text-right px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAds.map((ad) => {
                const vehicle = ad.linkedVehicleId ? vehicles.find(v => v.id === ad.linkedVehicleId) : null;
                return (
                  <tr key={ad.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-foreground text-sm tracking-tight">{ad.campaignName}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-md text-[10px] font-black uppercase bg-secondary text-muted-foreground border border-border shadow-sm">
                        {ad.platform}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground font-black tracking-tight">
                      {new Date(ad.startDate).toLocaleDateString()} → {new Date(ad.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-display font-black text-foreground text-base">${ad.amountSpent.toLocaleString()}</td>
                    <td className="px-4 py-4 text-xs font-semibold text-profit">
                      {vehicle ? `${vehicle.make} ${vehicle.model}` : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEdit(ad)}
                          className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(ad.id)}
                          className="w-8 h-8 text-muted-foreground hover:text-loss hover:bg-loss/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {isSubpage ? content : <AppLayout>{content}</AppLayout>}
      <AddAdvertisingDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} ad={selectedAd} />
    </>
  );
}
