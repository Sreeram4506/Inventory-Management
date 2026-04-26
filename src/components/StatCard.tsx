import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  className?: string;
  iconClassName?: string;
  onClick?: () => void;
}

export default function StatCard({ label, value, icon: Icon, trend, className, iconClassName, onClick }: StatCardProps) {
  return (
    <div 
      className={cn(
        "stat-card page-enter", 
        onClick && "cursor-pointer active:scale-[0.98]",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm", 
          iconClassName || "bg-primary/10 text-primary"
        )}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight",
            trend.positive ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"
          )}>
            {trend.positive ? '+' : ''}{trend.value}
          </div>
        )}
      </div>
      
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1">{label}</p>
        <p className="text-2xl font-black text-foreground tabular-nums tracking-tight truncate" title={value}>{value}</p>
      </div>
    </div>
  );
}
