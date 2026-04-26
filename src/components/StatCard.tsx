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
        onClick && "cursor-pointer hover:border-primary/30 active:scale-[0.98]",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="stat-label">{label}</p>
          <p className="stat-value mt-1.5 truncate" title={value}>{value}</p>
          {trend && (
            <p className={cn("text-xs mt-1 font-medium", trend.positive ? "text-profit" : "text-loss")}>
              {trend.positive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", iconClassName || "bg-primary/10")}>
          <Icon className={cn("w-4 h-4", iconClassName ? "text-primary-foreground" : "text-primary")} />
        </div>
      </div>
    </div>
  );
}
