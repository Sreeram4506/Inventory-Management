import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Car, ShoppingCart, DollarSign, 
  Megaphone, Receipt, TrendingUp, ChevronLeft, ChevronRight,
  LogOut, User as UserIcon, BarChart3, FileCheck2, FileArchive
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-hooks';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inventory', icon: Car, label: 'Inventory' },
  { to: '/sales', icon: ShoppingCart, label: 'Sales' },
  { to: '/used-vehicle-forms', icon: FileCheck2, label: 'Used Forms' },
  { to: '/registry', icon: FileArchive, label: 'Registry' },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['ADMIN', 'MANAGER'] },
];

export default function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  const filteredNavItems = navItems.filter(item => 
    !item.roles || (user && item.roles.includes(user.role))
  );

  return (
    <aside className={cn(
      "hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 min-h-screen shrink-0",
      collapsed ? "w-[72px]" : "w-[260px]"
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <Car className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="animate-slide-in">
            <h1 className="text-base font-bold text-sidebar-accent-foreground font-display tracking-tight">AutoProfitHub</h1>
            <p className="text-xs text-sidebar-muted">Management System</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5 shrink-0", isActive && "text-sidebar-primary")} />
              {!collapsed && <span className="animate-slide-in">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User & Collapse Info */}
      <div className="mt-auto px-3 py-4 border-t border-sidebar-border space-y-1">
        <div className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-muted mb-2",
          collapsed && "justify-center"
        )}>
          <UserIcon className="w-5 h-5 shrink-0" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sidebar-accent-foreground">{user?.name}</span>
              <span className="text-[10px] uppercase font-bold text-profit">{user?.role}</span>
            </div>
          )}
        </div>
        
        <button
          onClick={logout}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 w-full transition-colors",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 w-full transition-colors",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          {!collapsed && <span>Collapse Sidebar</span>}
        </button>
      </div>
    </aside>
  );
}
