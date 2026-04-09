import AppLayout from '@/components/AppLayout';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useInventory } from '@/hooks/useInventory';
import QueryErrorState from '@/components/QueryErrorState';

interface AdvertisingProps {
  isSubpage?: boolean;
}

export default function Advertising({ isSubpage = false }: AdvertisingProps) {
  const { ads, isLoading: adsLoading, isError: adsError } = useAdvertising();
  const { vehicles, isLoading: vehiclesLoading, isError: vehiclesError } = useInventory();

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

  const totalSpend = ads.reduce((s, a) => s + a.amountSpent, 0);

  const content = (
    <div className="space-y-6">
      {!isSubpage && (
        <div className="animate-in slide-in-from-top-4 duration-500">
          <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Advertising Campaigns</h1>
          <p className="text-muted-foreground mt-1">Strategic marketing data</p>
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
              </tr>
            </thead>
            <tbody>
              {ads.map((ad) => {
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return isSubpage ? content : <AppLayout>{content}</AppLayout>;
}
