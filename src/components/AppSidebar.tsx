import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Car, ShoppingCart, 
  Receipt, ChevronLeft, ChevronRight,
  LogOut, User as UserIcon, BarChart3, FileCheck2, FileArchive, Users
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-hooks';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inventory', icon: Car, label: 'Inventory' },
  { to: '/sales', icon: ShoppingCart, label: 'Sales', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/expenses', icon: Receipt, label: 'Expenses', roles: ['ADMIN'] },
  { to: '/used-vehicle-forms', icon: FileCheck2, label: 'Used Forms' },
  { to: '/registry', icon: FileArchive, label: 'Registry', roles: ['ADMIN', 'MANAGER'] },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['ADMIN', 'MANAGER'] },
  { to: '/team-analytics', icon: Users, label: 'Team', roles: ['ADMIN'] },
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
      "hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 min-h-screen shrink-0",
      collapsed ? "w-[68px]" : "w-[240px]"
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary/90 flex items-center justify-center shrink-0">
          <Car className="w-4 h-4 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-sidebar-accent-foreground truncate">AutoProfitHub</h1>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActive && "text-sidebar-primary")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User & Collapse */}
      <div className="mt-auto px-2 py-3 border-t border-sidebar-border space-y-0.5">
        <div className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-sidebar-muted",
          collapsed && "justify-center"
        )}>
          <UserIcon className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-sidebar-accent-foreground truncate">{user?.name}</span>
              <span className="text-[10px] uppercase font-semibold text-sidebar-primary tracking-wide">{user?.role}</span>
            </div>
          )}
        </div>
        
        <button
          onClick={logout}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-destructive/80 hover:bg-destructive/10 hover:text-destructive w-full transition-colors",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/60 w-full transition-colors",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? <ChevronRight className="w-[18px] h-[18px]" /> : <ChevronLeft className="w-[18px] h-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
