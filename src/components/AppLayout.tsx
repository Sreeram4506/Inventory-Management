import { ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import MobileNav from './MobileNav';
import AIChatAssistant from './AIChatAssistantV2';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex flex-col md:flex-row h-screen bg-background relative overflow-hidden">
      <AppSidebar />
      <MobileNav />
      <main className="flex-1 overflow-auto pb-28 md:pb-0 scrollbar-hide">
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500">
          {children}
        </div>
      </main>
      <AIChatAssistant />
    </div>
  );
}
