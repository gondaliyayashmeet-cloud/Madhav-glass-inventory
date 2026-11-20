import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { CompanyProvider, useCompany } from './lib/company';
import { Toaster } from './components/Toast';
import Layout from './components/Layout';
import SignIn from './pages/SignIn';
import GetStarted from './pages/GetStarted';
import Home from './pages/Home';
import Inventory from './pages/Inventory';
import Transactions from './pages/Transactions';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import Reports from './pages/Reports';
import Members from './pages/Members';
import PendingApproval from './pages/PendingApproval';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function AuthOnly() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-secondary">Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/signin" replace />;
  return <Outlet />;
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const { companies, loading: companyLoading } = useCompany();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-secondary">Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/signin" replace />;
  if (companyLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-secondary">Loading…</p>
      </div>
    );
  }

  const approvedCompanies = companies.filter((c) => c.approved);
  if (approvedCompanies.length === 0) {
    // User has no approved companies — check if they have pending requests
    const hasPending = companies.some((c) => !c.approved);
    if (hasPending) return <PendingApproval />;
    return <Navigate to="/get-started" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CompanyProvider>
          <BrowserRouter>
            <Toaster>
              <Routes>
                <Route path="/signin" element={<SignIn />} />
                <Route element={<AuthOnly />}>
                  <Route path="/get-started" element={<GetStarted />} />
                </Route>
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/transactions" element={<Transactions />} />
                    <Route path="/suppliers" element={<Suppliers />} />
                    <Route path="/customers" element={<Customers />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/members" element={<Members />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Toaster>
          </BrowserRouter>
        </CompanyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
