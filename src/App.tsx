import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { lazy, Suspense, useEffect, memo } from "react";

// Preload critical routes
const preloadDashboard = () => import("./pages/Index");
const preloadInventory = () => import("./pages/Inventory");

// Lazy load ALL pages for code splitting (Reports was previously eager-imported)
const Index = lazy(preloadDashboard);
const Inventory = lazy(preloadInventory);
const Sales = lazy(() => import("./pages/Sales"));
const Advertising = lazy(() => import("./pages/Advertising"));
const Expenses = lazy(() => import("./pages/Expenses"));
const CashFlow = lazy(() => import("./pages/CashFlow"));
const UsedVehicleForms = lazy(() => import("./pages/UsedVehicleForms"));
const Registry = lazy(() => import("./pages/Registry"));
const TeamAnalytics = lazy(() => import("./pages/TeamAnalytics"));
const Reports = lazy(() => import("./pages/Reports"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Preload manager — memoized to prevent re-renders from parent
const PreloadManager = memo(function PreloadManager() {
  const location = useLocation();

  useEffect(() => {
    // Predictive preloading: load the next likely route
    if (location.pathname === '/login') {
      preloadDashboard();
    }
    if (location.pathname === '/') {
      preloadInventory();
    }
  }, [location.pathname]); // Only re-run when pathname changes, not entire location object

  return null;
});

// Loading component — memoized since it never changes
const PageLoader = memo(function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-card text-foreground" role="status" aria-label="Loading page">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-profit/20 border-t-profit animate-spin" aria-hidden="true" />
        <p className="text-muted-foreground font-display animate-pulse font-bold tracking-widest text-xs uppercase">Loading Hub...</p>
      </div>
    </div>
  );
});

// QueryClient configured once at module scope — stable reference
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes — reduces redundant fetches
      gcTime: 10 * 60 * 1000,   // 10 minutes — keeps unused data in cache longer for back-nav
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
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
                <Route path="/registry" element={
                  <ProtectedRoute>
                    <Registry />
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
                <Route path="/team-analytics" element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <TeamAnalytics />
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
