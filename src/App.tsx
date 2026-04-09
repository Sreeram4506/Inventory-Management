import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
import { lazy, Suspense, useEffect } from "react";

// Preload critical routes
const preloadDashboard = () => import("./pages/Index.tsx");
const preloadInventory = () => import("./pages/Inventory.tsx");

// Standard imports for reporting to avoid lazy-loading issues during transition
import Reports from "./pages/Reports.tsx";

// Lazy load other pages for code splitting
const Index = lazy(preloadDashboard);
const Inventory = lazy(preloadInventory);
const Sales = lazy(() => import("./pages/Sales.tsx"));
const Advertising = lazy(() => import("./pages/Advertising.tsx"));
const Expenses = lazy(() => import("./pages/Expenses.tsx"));
const CashFlow = lazy(() => import("./pages/CashFlow.tsx"));
const UsedVehicleForms = lazy(() => import("./pages/UsedVehicleForms.tsx"));
const Login = lazy(() => import("./pages/Login.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Preload manager component
function PreloadManager() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/login') {
      preloadDashboard();
    }
    if (location.pathname === '/') {
      preloadInventory();
    }
  }, [location]);

  return null;
}

// Loading component
const PageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-profit/20 border-t-profit animate-spin" />
      <p className="text-zinc-400 font-display animate-pulse font-bold tracking-widest text-xs uppercase">Loading Hub...</p>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <TooltipProvider>
            <Suspense fallback={<PageLoader />}>
              <PreloadManager />
              <Routes>
                <Route path="/login" element={<Login />} />
                
                <Route path="/" element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } />
                <Route path="/inventory" element={
                  <ProtectedRoute>
                    <Inventory />
                  </ProtectedRoute>
                } />
                <Route path="/sales" element={
                  <ProtectedRoute>
                    <Sales />
                  </ProtectedRoute>
                } />
                <Route path="/used-vehicle-forms" element={
                  <ProtectedRoute>
                    <UsedVehicleForms />
                  </ProtectedRoute>
                } />
                <Route path="/advertising" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <Advertising />
                  </ProtectedRoute>
                } />
                <Route path="/expenses" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <Expenses />
                  </ProtectedRoute>
                } />
                <Route path="/cash-flow" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <CashFlow />
                  </ProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <Reports />
                  </ProtectedRoute>
                } />
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
