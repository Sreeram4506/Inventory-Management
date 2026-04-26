import AppLayout from '@/components/AppLayout';
import { useTeam } from '@/hooks/useTeam';
import QueryErrorState from '@/components/QueryErrorState';
import { Users, Car, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TeamAnalytics() {
  const { team, isLoading, isError } = useTeam();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading team data...</div>;
  if (isError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load team analytics"
          description="Failed to fetch team data."
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 page-enter">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Team Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Performance tracking for managers and staff</p>
        </div>

        {team.length === 0 ? (
          <div className="p-12 text-center bg-card rounded-xl border border-border/60">
            <p className="text-muted-foreground">No team members found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {team.map((member) => (
              <div key={member.id} className="relative bg-card/60 backdrop-blur-md border border-border/50 shadow-lg shadow-black/5 rounded-2xl overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                
                {/* Header */}
                <div className="relative z-10 p-5 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-muted/80 flex items-center justify-center shadow-sm">
                      <Users className="w-6 h-6 text-foreground" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground leading-tight tracking-tight">{member.name}</h2>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{member.email}</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-widest border shadow-sm",
                          member.role === 'MANAGER' ? "bg-info/10 text-info border-info/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        )}>
                          {member.role}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative z-10 flex gap-3">
                    <div className="bg-muted/20 px-4 py-2.5 rounded-xl border border-border/50 text-center min-w-[90px] shadow-sm">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Vehicles</p>
                      <p className="text-xl font-bold text-foreground tabular-nums">{member._count?.vehiclesAdded || 0}</p>
                    </div>
                    <div className="bg-muted/20 px-4 py-2.5 rounded-xl border border-border/50 text-center min-w-[90px] shadow-sm">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Sales</p>
                      <p className="text-xl font-bold text-profit tabular-nums">{member._count?.salesMade || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 bg-muted/5">
                  {/* Recent Vehicles */}
                  <div className="p-5 md:border-r border-border/50">
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5" /> Inventory Added
                    </h3>
                    {member.vehiclesAdded && member.vehiclesAdded.length > 0 ? (
                      <div className="space-y-2">
                        {member.vehiclesAdded.map(v => (
                          <div key={v.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                            <div>
                              <p className="font-medium text-foreground text-sm">{v.year} {v.make} {v.model}</p>
                              <p className="text-[11px] text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No vehicles added yet.</p>
                    )}
                  </div>

                  {/* Recent Sales */}
                  <div className="p-5 border-t md:border-t-0 border-border/50">
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <ShoppingCart className="w-3.5 h-3.5" /> Sales Completed
                    </h3>
                    {member.salesMade && member.salesMade.length > 0 ? (
                      <div className="space-y-2">
                        {member.salesMade.map(s => (
                          <div key={s.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                            <div>
                              <p className="font-medium text-foreground text-sm">
                                {s.vehicle ? `${s.vehicle.make} ${s.vehicle.model}` : 'Unknown Vehicle'}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-foreground text-sm tabular-nums">${s.salePrice?.toLocaleString()}</p>
                              <p className="text-[11px] text-profit font-medium tabular-nums">+${s.profit?.toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No sales completed yet.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
