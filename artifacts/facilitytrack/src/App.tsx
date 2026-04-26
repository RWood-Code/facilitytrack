import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, isAdminOrHigher } from "@/lib/auth";
import { LicenseGate } from "@/components/LicenseGate";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/login";
import StatusPage from "@/pages/status";
import DashboardPage from "@/pages/dashboard";
import PoolsPage from "@/pages/pools/index";
import PoolDetailPage from "@/pages/pools/detail";
import TestFormPage from "@/pages/pools/test-form";
import WaterBalancePage from "@/pages/pools/water-balance";
import ClosePoolPage from "@/pages/pools/close-pool";
import SteamRoomPage from "@/pages/steam-room/index";
import SteamRoomTabletPage from "@/pages/steam-room/tablet";
import WorkOrdersPage from "@/pages/work-orders/index";
import AssetsPage from "@/pages/assets/index";
import MaintenancePage from "@/pages/maintenance/index";
import StaffPage from "@/pages/staff/index";
import StaffDetailPage from "@/pages/staff/detail";
import ReportsPage from "@/pages/reports";
import FacilitiesPage from "@/pages/facilities/index";
import SettingsPage from "@/pages/settings";
import NotificationsPage from "@/pages/notifications";
import ComplianceDocumentsPage from "@/pages/compliance-documents/index";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  if (!isAdminOrHigher(user?.role)) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/status" component={StatusPage} />
      <Route path="/">
        <AuthGate>
          <Layout>
            <DashboardPage />
          </Layout>
        </AuthGate>
      </Route>
      <Route path="/pools">
        <AuthGate>
          <Layout>
            <PoolsPage />
          </Layout>
        </AuthGate>
      </Route>
      <Route path="/pools/test">
        <AuthGate>
          <Layout>
            <TestFormPage />
          </Layout>
        </AuthGate>
      </Route>
      <Route path="/pools/:id">
        <AuthGate>
          <Layout>
            <PoolDetailPage />
          </Layout>
        </AuthGate>
      </Route>
      <Route path="/pools/:id/test">
        <AuthGate>
          <Layout>
            <TestFormPage />
          </Layout>
        </AuthGate>
      </Route>
      <Route path="/pools/:id/water-balance">
        <AuthGate>
          <AdminGate>
            <Layout>
              <WaterBalancePage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/pools/:id/close">
        <AuthGate>
          <AdminGate>
            <Layout>
              <ClosePoolPage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/steam-room">
        <AuthGate>
          <Layout>
            <SteamRoomPage />
          </Layout>
        </AuthGate>
      </Route>
      <Route path="/steam-room/tablet">
        <SteamRoomTabletPage />
      </Route>
      <Route path="/work-orders">
        <AuthGate>
          <AdminGate>
            <Layout>
              <WorkOrdersPage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/assets">
        <AuthGate>
          <AdminGate>
            <Layout>
              <AssetsPage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/maintenance">
        <AuthGate>
          <AdminGate>
            <Layout>
              <MaintenancePage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/staff">
        <AuthGate>
          <AdminGate>
            <Layout>
              <StaffPage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/staff/:id">
        <AuthGate>
          <AdminGate>
            <Layout>
              <StaffDetailPage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/reports">
        <AuthGate>
          <AdminGate>
            <Layout>
              <ReportsPage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/facilities">
        <AuthGate>
          <AdminGate>
            <Layout>
              <FacilitiesPage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/settings">
        <AuthGate>
          <AdminGate>
            <Layout>
              <SettingsPage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route path="/notifications">
        <AuthGate>
          <Layout>
            <NotificationsPage />
          </Layout>
        </AuthGate>
      </Route>
      <Route path="/compliance-documents">
        <AuthGate>
          <AdminGate>
            <Layout>
              <ComplianceDocumentsPage />
            </Layout>
          </AdminGate>
        </AuthGate>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <LicenseGate>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </LicenseGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
