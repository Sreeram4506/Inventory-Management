import AppLayout from '@/components/AppLayout';
import { useTeam } from '@/hooks/useTeam';
import QueryErrorState from '@/components/QueryErrorState';
import { Users, Car, ShoppingCart, DollarSign, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TeamAnalytics() {
  const { team, isLoading, isError } = useTeam();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading team analytics...</div>;
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
      <div className="space-y-8 animate-in fade-in duration-700">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold font-display text-white tracking-tight">Team Analytics</h1>
          <p className="text-zinc-400 mt-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-info" />
            Detailed performance tracking for Managers and Staff
          </p>
        </div>

        {team.length === 0 ? (
          <div className="p-12 text-center bg-zinc-900/50 rounded-2xl border border-zinc-800">
            <p className="text-zinc-500 text-lg">No team members found.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {team.map((member) => (
              <div key={member.id} className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl overflow-hidden shadow-xl">
                {/* Header */}
                <div className="p-6 bg-zinc-900/80 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-300">
                      <Users className="w-7 h-7" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white font-display">{member.name}</h2>
                      <div className="flex items-center gap-3 mt-1 text-sm font-medium">
                        <span className="text-zinc-400">{member.email}</span>
                        <span className="text-zinc-600">•</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold",
                          member.role === 'MANAGER' ? "bg-info/10 text-info border border-info/20" : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        )}>
                          {member.role}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-center min-w-[100px]">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Vehicles Added</p>
                      <p className="text-2xl font-bold text-white">{member._count?.vehiclesAdded || 0}</p>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-center min-w-[100px]">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Sales Closed</p>
                      <p className="text-2xl font-bold text-profit">{member._count?.salesMade || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-zinc-800">
                  {/* Recent Vehicles */}
                  <div className="bg-zinc-900/40 p-6">
                    <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Car className="w-4 h-4 text-zinc-500" /> Recent Inventory Added
                    </h3>
                    {member.vehiclesAdded && member.vehiclesAdded.length > 0 ? (
                      <div className="space-y-3">
                        {member.vehiclesAdded.map(v => (
                          <div key={v.id} className="flex items-center justify-between p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                            <div>
                              <p className="font-semibold text-white text-sm">{v.year} {v.make} {v.model}</p>
                              <p className="text-xs text-zinc-500">{new Date(v.createdAt).toLocaleDateString()}</p>
                            </div>
                            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold bg-zinc-800 px-2 py-1 rounded">Inventory</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-600 italic">No vehicles added yet.</p>
                    )}
                  </div>

                  {/* Recent Sales */}
                  <div className="bg-zinc-900/40 p-6">
                    <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-profit" /> Recent Sales Completed
                    </h3>
                    {member.salesMade && member.salesMade.length > 0 ? (
                      <div className="space-y-3">
                        {member.salesMade.map(s => (
                          <div key={s.id} className="flex items-center justify-between p-3 bg-zinc-950/50 rounded-lg border border-zinc-800">
                            <div>
                              <p className="font-semibold text-white text-sm">
                                {s.vehicle ? `${s.vehicle.make} ${s.vehicle.model}` : 'Unknown Vehicle'}
                              </p>
                              <p className="text-xs text-zinc-500">{new Date(s.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-white text-sm">${s.salePrice?.toLocaleString()}</p>
                              <p className="text-[10px] text-profit uppercase tracking-wider font-bold">+${s.profit?.toLocaleString()} Net</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-600 italic">No sales closed yet.</p>
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
