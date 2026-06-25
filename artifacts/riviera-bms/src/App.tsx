import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrintProvider } from "@/lib/print";
import { useEffect } from "react";
import { getToken } from "./lib/auth";
import NotFound from "@/pages/not-found";

// Components
import AppLayout from "@/components/layout/AppLayout";

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Units from "@/pages/units";
import Tenants from "@/pages/tenants";
import Contracts from "@/pages/contracts";
import ReceiptVouchers from "@/pages/receipt-vouchers";
import PaymentVouchers from "@/pages/payment-vouchers";
import CashFund from "@/pages/cash-fund";
import BankAccounts from "@/pages/bank-accounts";
import Cheques from "@/pages/cheques";
import AccountStatements from "@/pages/account-statements";
import Documents from "@/pages/documents";
import Reports from "@/pages/reports";
import AuditLog from "@/pages/audit-log";
import Settings from "@/pages/settings";

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
