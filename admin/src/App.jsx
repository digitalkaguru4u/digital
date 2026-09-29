import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, DataProvider } from './lib/context';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { Login, ForgotPassword, ResetPassword } from './pages/Auth';
import { lazy, Suspense } from 'react';

// Route-level code splitting keeps the first load small (charts / drag-and-drop load on demand)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leads = lazy(() => import('./pages/Leads'));
const LeadDetail = lazy(() => import('./pages/LeadDetail'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const Followups = lazy(() => import('./pages/Followups'));
const PipelineValue = lazy(() => import('./pages/PipelineValue'));
const Booked = lazy(() => import('./pages/Booked'));
const Settings = lazy(() => import('./pages/Settings'));

function Protected({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="boot"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <DataProvider><Suspense fallback={<Spinner />}>{children}</Suspense></DataProvider>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="followups" element={<Followups />} />
        <Route path="pipeline-value" element={<PipelineValue />} />
        <Route path="booked" element={<Booked />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
