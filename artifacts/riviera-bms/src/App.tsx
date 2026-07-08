import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrintProvider } from "@/lib/print";
import { Suspense, lazy, useEffect } from "react";
import { getToken } from "./lib/auth";
import NotFound from "@/pages/not-found";

// Components (eager — app shell + first paint)
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/login";

// Pages (lazy — each route ships as its own chunk, loaded on demand)
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Units = lazy(() => import("@/pages/units"));
const Tenants = lazy(() => import("@/pages/tenants"));
const Contracts = lazy(() => import("@/pages/contracts"));
const ReceiptVouchers = lazy(() => import("@/pages/receipt-vouchers"));
const PaymentVouchers = lazy(() => import("@/pages/payment-vouchers"));
const CashFund = lazy(() => import("@/pages/cash-fund"));
const BankAccounts = lazy(() => import("@/pages/bank-accounts"));
const Cheques = lazy(() => import("@/pages/cheques"));
const AccountStatements = lazy(() => import("@/pages/account-statements"));
const Documents = lazy(() => import("@/pages/documents"));
const Reports = lazy(() => import("@/pages/reports"));
const AuditLog = lazy(() => import("@/pages/audit-log"));
const Settings = lazy(() => import("@/pages/settings"));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <div className="animate-pulse text-sm">جاري التحميل...</div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const token = getToken();

  useEffect(() => {
    if (!token && location !== "/login") {
      setLocation("/login");
    } else if (token && location === "/login") {
      setLocation("/dashboard");
    }
  }, [token, location, setLocation]);

  if (!token && location !== "/login") {
    return null;
  }

  return <>{children}</>;
}

function RootRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => setLocation("/dashboard"), []);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      <Route>
        <AppLayout>
          <Suspense fallback={<RouteFallback />}>
            <Switch>
              <Route path="/" component={RootRedirect} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/units" component={Units} />
              <Route path="/tenants" component={Tenants} />
              <Route path="/contracts" component={Contracts} />
              <Route path="/receipt-vouchers" component={ReceiptVouchers} />
              <Route path="/payment-vouchers" component={PaymentVouchers} />
              <Route path="/cash-fund" component={CashFund} />
              <Route path="/bank-accounts" component={BankAccounts} />
              <Route path="/cheques" component={Cheques} />
              <Route path="/account-statements" component={AccountStatements} />
              <Route path="/documents" component={Documents} />
              <Route path="/reports" component={Reports} />
              <Route path="/audit-log" component={AuditLog} />
              <Route path="/settings" component={Settings} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PrintProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthGuard>
              <Router />
            </AuthGuard>
          </WouterRouter>
          <Toaster />
        </PrintProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
