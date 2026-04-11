import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Car, ShoppingCart, 
  BarChart3, Menu, LogOut, X, FileArchive
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-hooks';
import { Button } from './ui/button';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inventory', icon: Car, label: 'Inventory' },
  { to: '/sales', icon: ShoppingCart, label: 'Sales' },
  { to: '/registry', icon: FileArchive, label: 'Logs' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <>
      {/* Top Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-5 py-4 bg-sidebar border-b border-sidebar-border sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Car className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <h1 className="text-sm font-bold text-sidebar-accent-foreground font-display tracking-tight uppercase">AutoProfitHub</h1>
        </div>
        <button 
          onClick={() => setIsOpen(true)}
          className="w-9 h-9 rounded-lg bg-sidebar-accent flex items-center justify-center text-sidebar-foreground"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Slide-over Menu (Drawer) */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Drawer Content */}
          <div className="absolute top-0 right-0 h-full w-[280px] bg-sidebar border-l border-sidebar-border shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-sidebar-border">
              <span className="font-display font-bold text-sidebar-accent-foreground tracking-tight">Main Menu</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-sidebar-muted hover:text-sidebar-accent-foreground"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 space-y-2">
              <div className="bg-sidebar-accent/50 rounded-xl p-4 mb-4">
                <p className="text-xs text-sidebar-muted uppercase tracking-wider font-bold mb-1">Signed in as</p>
                <p className="text-sm font-semibold text-sidebar-accent-foreground">{user?.name}</p>
                <p className="text-[10px] text-profit font-bold">{user?.role}</p>
              </div>

              {/* Additional Links or Info could go here */}
              <div className="space-y-4 pt-4">
                <Button 
                  variant="destructive" 
                  className="w-full justify-start gap-3 h-12"
                  onClick={logout}
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </Button>
              </div>
            </div>
            
            <div className="mt-auto p-6 text-center">
              <p className="text-[10px] text-sidebar-muted">© 2024 AutoProfitHub v2.0</p>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-sidebar/80 backdrop-blur-xl border-t border-sidebar-border py-2 px-4 flex items-center justify-around z-50 safe-area-bottom shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 transition-all duration-300 relative px-4",
                isActive ? "text-sidebar-primary" : "text-sidebar-muted"
              )}
            >
              <div className={cn(
                "p-2 rounded-xl transition-all duration-300",
                isActive ? "bg-sidebar-primary/10" : ""
              )}>
                <item.icon className={cn("w-6 h-6", isActive ? "scale-110" : "scale-100")} />
              </div>
              <span className={cn(
                "text-[10px] font-bold tracking-tight uppercase transition-all duration-300",
                isActive ? "opacity-100 translate-y-0" : "opacity-70"
              )}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute -top-2 w-1.5 h-1.5 rounded-full bg-sidebar-primary shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-in zoom-in slide-in-from-top-1" />
              )}
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
