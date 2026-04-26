import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Car, ShoppingCart, 
  BarChart3, Menu, LogOut, X, FileArchive, FileText, Receipt, Users
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-hooks';
import { Button } from './ui/button';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/inventory', icon: Car, label: 'Cars' },
  { to: '/sales', icon: ShoppingCart, label: 'Sales', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/used-vehicle-forms', icon: FileArchive, label: 'Forms' },
];

const drawerItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inventory', icon: Car, label: 'Inventory' },
  { to: '/sales', icon: ShoppingCart, label: 'Sales', roles: ['ADMIN', 'MANAGER', 'STAFF'] },
  { to: '/expenses', icon: Receipt, label: 'Expenses', roles: ['ADMIN'] },
  { to: '/used-vehicle-forms', icon: FileText, label: 'Used Forms' },
  { to: '/registry', icon: FileArchive, label: 'Registry', roles: ['ADMIN', 'MANAGER'] },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['ADMIN', 'MANAGER'] },
  { to: '/team-analytics', icon: Users, label: 'Team', roles: ['ADMIN'] },
];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  const filteredNavItems = navItems.filter(item => 
    !item.roles || (user && item.roles.includes(user.role))
  );

  const filteredDrawerItems = drawerItems.filter(item => 
    !item.roles || (user && item.roles.includes(user.role))
  );

  return (
    <>
      {/* Top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-sidebar-primary/90 flex items-center justify-center">
            <Car className="w-3.5 h-3.5 text-sidebar-primary-foreground" />
          </div>
          <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">AutoProfitHub</h1>
        </div>
        <button 
          onClick={() => setIsOpen(true)}
          className="w-8 h-8 rounded-md bg-sidebar-accent flex items-center justify-center text-sidebar-foreground"
        >
          <Menu className="w-4 h-4" />
        </button>
      </header>

      {/* Drawer overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
            onClick={() => setIsOpen(false)}
          />
          
          <div className="absolute top-0 right-0 h-full w-[260px] bg-sidebar border-l border-sidebar-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
              <span className="font-semibold text-sm text-sidebar-accent-foreground">Menu</span>
              <button onClick={() => setIsOpen(false)} className="text-sidebar-muted hover:text-sidebar-accent-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
              <div className="bg-sidebar-accent/40 rounded-lg p-3 mb-3">
                <p className="text-[10px] text-sidebar-muted uppercase tracking-wider font-semibold mb-0.5">Signed in as</p>
                <p className="text-sm font-medium text-sidebar-accent-foreground">{user?.name}</p>
                <p className="text-[10px] text-sidebar-primary font-semibold">{user?.role}</p>
              </div>

              {filteredDrawerItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
                      isActive 
                        ? "bg-sidebar-primary/10 text-sidebar-primary" 
                        : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="w-[18px] h-[18px]" />
                    {item.label}
                  </NavLink>
                );
              })}

              <div className="pt-3 mt-3 border-t border-sidebar-border">
                <Button 
                  variant="destructive" 
                  className="w-full justify-start gap-3 h-10 rounded-lg text-[13px]"
                  onClick={logout}
                >
                  <LogOut className="w-[18px] h-[18px]" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar - Modern Floating Design */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 h-16 bg-sidebar/80 backdrop-blur-xl border border-sidebar-border/50 rounded-2xl shadow-2xl py-1.5 px-3 flex items-center justify-around z-50 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-sidebar-primary/5 via-transparent to-sidebar-primary/5 pointer-events-none" />
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 transition-all duration-300 px-4 h-full",
                isActive ? "text-sidebar-primary transform -translate-y-0.5" : "text-sidebar-muted hover:text-sidebar-foreground"
              )}
            >
              {isActive && (
                <div className="absolute -top-1 w-8 h-1 bg-sidebar-primary rounded-b-full shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-fade-in" />
              )}
              <item.icon className={cn("w-[22px] h-[22px] transition-all duration-300", isActive && "scale-110 drop-shadow-md")} />
              <span className={cn(
                "text-[10px] font-semibold tracking-tight transition-all duration-300",
                isActive ? "opacity-100" : "opacity-70"
              )}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
