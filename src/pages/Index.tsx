import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import RiderDashboard from './RiderDashboard';
import MerchantManagerDashboard from './MerchantManagerDashboard';
import AccountantDashboard from './AccountantDashboard';
import BusinessOwnerDashboard from './BusinessOwnerDashboard';
import AppDeveloperDashboard from './AppDeveloperDashboard';

export default function Index() {
  const { user, roles, loading } = useAuth();

  if (loading) return <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" /><span className="sr-only">Loading…</span></div>;
  if (!user) return <Navigate to="/auth" replace />;

  // Admin always gets admin dashboard
  if (roles.includes('admin')) return <AdminDashboard />;

  // Route based on primary role (priority order)
  if (roles.includes('rider')) return <RiderDashboard />;
  if (roles.includes('company_manager')) return <MerchantManagerDashboard />;
  if (roles.includes('accountant')) return <AccountantDashboard />;
  if (roles.includes('business_owner')) return <BusinessOwnerDashboard />;
  if (roles.includes('app_developer')) return <AppDeveloperDashboard />;

  // Fallback
  return <AdminDashboard />;
}
