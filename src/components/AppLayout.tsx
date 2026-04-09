import { ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import MobileNav from './MobileNav';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background relative">
      <AppSidebar />
      <MobileNav />
      <main className="flex-1 overflow-auto pb-24 md:pb-0">
        <div className="p-5 md:p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
