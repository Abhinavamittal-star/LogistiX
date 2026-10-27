import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useStore from './store';
import ToastContainer from './components/ToastContainer';
import CommandPalette from './components/CommandPalette';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DriverApp = lazy(() => import('./pages/DriverApp'));
const CustomerTracking = lazy(() => import('./pages/CustomerTracking'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));

function ProtectedRoute({ children, roles }) {
  const { user } = useStore();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRouter() {
  const { user } = useStore();
  
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'dispatcher') return <Navigate to="/dashboard" replace />;
  if (user.role === 'driver') return <Navigate to="/driver" replace />;
  if (user.role === 'customer') return <Navigate to="/customer" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  const { initSocket, user, syncAuthFromStorage } = useStore();
  
  useEffect(() => {
    if (user) initSocket();
  }, [user, initSocket]);

  useEffect(() => {
    const handleStorageChange = event => {
      if (event.key === 'lx_user' || event.key === 'lx_token' || event.key === 'lx_refresh') {
        syncAuthFromStorage();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [syncAuthFromStorage]);
  
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="app-loading"><span className="spinner" /> Loading operations…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/track/:code" element={<CustomerTracking />} />
        <Route path="/customer" element={<ProtectedRoute roles={['customer']}><CustomerPortal /></ProtectedRoute>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={['dispatcher']}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver"
          element={
            <ProtectedRoute roles={['driver']}>
              <DriverApp />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<AppRouter />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <ToastContainer />
      <CommandPalette />
    </BrowserRouter>
  );
}
