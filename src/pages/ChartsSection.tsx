import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

interface ChartsSectionProps {
  salesHistory: any[];
  inventoryStatusData: any[];
  profitData: any[];
  COLORS: string[];
}

export default function ChartsSection({ salesHistory, inventoryStatusData, profitData, COLORS }: ChartsSectionProps) {
  return (
    <>
      {/* Sales & Profit Area Chart */}
      <div className="stat-card lg:col-span-2 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display font-semibold text-xl text-white">Financial Growth</h3>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-zinc-400">Revenue</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-profit" />
              <span className="text-zinc-400">Profit</span>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={salesHistory}>
            <defs>
              <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
              itemStyle={{ fontSize: '12px' }}
            />
            <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
            <Area type="monotone" dataKey="profit" stroke="#10b981" fillOpacity={1} fill="url(#colorProf)" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Inventory Status Pie */}
      <div className="stat-card bg-zinc-900/40 border-zinc-800/50">
        <h3 className="font-display font-semibold text-xl text-white mb-6">Inventory Status</h3>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={inventoryStatusData} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={8} dataKey="value" stroke="none">
              {inventoryStatusData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-4">
          {inventoryStatusData.map((item, index) => (
            <div key={item.name} className="flex flex-col items-center">
              <span className="text-[10px] uppercase font-bold text-zinc-500 mb-1">{item.name}</span>
              <span className="text-lg font-display font-bold text-white leading-none">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Profits Bar Chart */}
      <div className="stat-card">
        <h3 className="font-display font-semibold text-xl text-white mb-6">Vehicle Performance</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={profitData} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
            <XAxis type="number" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="vehicle" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} width={120} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
            />
            <Bar dataKey="profit" fill="#10b981" radius={[0, 4, 4, 0]} barSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}