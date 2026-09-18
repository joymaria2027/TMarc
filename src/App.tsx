import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import Auth from "@/pages/Auth";
import Index from "@/pages/Index";
import RiderDashboard from "@/pages/RiderDashboard";
import DeliveriesPage from "@/pages/DeliveriesPage";
import RidersPage from "@/pages/RidersPage";
import MerchantsPage from "@/pages/MerchantsPage";
import BusinessTypesPage from "@/pages/BusinessTypesPage";
import AlertsPage from "@/pages/AlertsPage";
import SettlementsPage from "@/pages/SettlementsPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import FraudPage from "@/pages/FraudPage";
import SettingsPage from "@/pages/SettingsPage";
import RevenueSharingPage from "@/pages/RevenueSharingPage";
import RiderExpensesPage from "@/pages/RiderExpensesPage";
import ExpenseTypesPage from "@/pages/ExpenseTypesPage";
import RolePermissionsPage from "@/pages/RolePermissionsPage";
import GpsTrackerPage from "@/pages/GpsTrackerPage";
import WalletPage from "@/pages/WalletPage";
import RejectedDeliveriesPage from "@/pages/RejectedDeliveriesPage";
import RlsVerificationPage from "@/pages/RlsVerificationPage";
import PayrollPage from "@/pages/PayrollPage";
import ReconciliationPage from "@/pages/ReconciliationPage";
import ShopPage from "@/pages/ShopPage";
import MerchantStorefrontPage from "@/pages/MerchantStorefrontPage";
import ProductDetailPage from "@/pages/ProductDetailPage";
import CartPage from "@/pages/CartPage";
import CheckoutPage from "@/pages/CheckoutPage";
import MyOrdersPage from "@/pages/MyOrdersPage";
import MerchantProductsPage from "@/pages/MerchantProductsPage";
import MerchantOrdersPage from "@/pages/MerchantOrdersPage";
import ProductApprovalsPage from "@/pages/ProductApprovalsPage";
import CheckoutStatusPage from "@/pages/CheckoutStatusPage";
import WebhookEventsPage from "@/pages/WebhookEventsPage";
import DispatchAuditPage from "@/pages/DispatchAuditPage";
import PaymentBackfillPage from "@/pages/PaymentBackfillPage";
import MerchantAuditLogPage from "@/pages/MerchantAuditLogPage";
import StoreLandingPage from "@/pages/StoreLandingPage";
import WholesaleApplyPage from "@/pages/WholesaleApplyPage";
import WholesalersPage from "@/pages/WholesalersPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div role="status" aria-label="Loading" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  if (!user) return <Navigate to="/auth" replace />;
  return <Layout>{children}</Layout>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/rider" element={<ProtectedRoute><RiderDashboard /></ProtectedRoute>} />
            <Route path="/deliveries" element={<ProtectedRoute><DeliveriesPage /></ProtectedRoute>} />
            <Route path="/riders" element={<ProtectedRoute><RidersPage /></ProtectedRoute>} />
            <Route path="/gps-tracker" element={<ProtectedRoute><GpsTrackerPage /></ProtectedRoute>} />
            <Route path="/merchants" element={<ProtectedRoute><MerchantsPage /></ProtectedRoute>} />
            <Route path="/business-types" element={<ProtectedRoute><BusinessTypesPage /></ProtectedRoute>} />
            <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
            <Route path="/settlements" element={<ProtectedRoute><SettlementsPage /></ProtectedRoute>} />
            <Route path="/revenue-sharing" element={<ProtectedRoute><RevenueSharingPage /></ProtectedRoute>} />
            <Route path="/rider-expenses" element={<ProtectedRoute><RiderExpensesPage /></ProtectedRoute>} />
            <Route path="/expense-types" element={<ProtectedRoute><ExpenseTypesPage /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
            <Route path="/fraud" element={<ProtectedRoute><FraudPage /></ProtectedRoute>} />
            <Route path="/permissions" element={<ProtectedRoute><RolePermissionsPage /></ProtectedRoute>} />
            <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
            <Route path="/rejected-deliveries" element={<ProtectedRoute><RejectedDeliveriesPage /></ProtectedRoute>} />
            <Route path="/rls-verification" element={<ProtectedRoute><RlsVerificationPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/payroll" element={<ProtectedRoute><PayrollPage /></ProtectedRoute>} />
            <Route path="/reconciliation" element={<ProtectedRoute><ReconciliationPage /></ProtectedRoute>} />

            {/* Merchant product & order management (inside admin layout) */}
            <Route path="/merchant/products" element={<ProtectedRoute><MerchantProductsPage /></ProtectedRoute>} />
            <Route path="/merchant/orders" element={<ProtectedRoute><MerchantOrdersPage /></ProtectedRoute>} />
            <Route path="/admin/product-approvals" element={<ProtectedRoute><ProductApprovalsPage /></ProtectedRoute>} />

            {/* Public storefront (no admin layout) */}
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/s/:merchantId" element={<StoreLandingPage />} />
            <Route path="/shop/m/:merchantId" element={<MerchantStorefrontPage />} />
            <Route path="/shop/p/:productId" element={<ProductDetailPage />} />
            <Route path="/wholesale" element={<WholesaleApplyPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/checkout/status/:orderId" element={<CheckoutStatusPage />} />
            <Route path="/account/orders" element={<MyOrdersPage />} />
            <Route path="/admin/webhook-events" element={<ProtectedRoute><WebhookEventsPage /></ProtectedRoute>} />
            <Route path="/admin/dispatch-audit" element={<ProtectedRoute><DispatchAuditPage /></ProtectedRoute>} />
            <Route path="/admin/payment-backfill" element={<ProtectedRoute><PaymentBackfillPage /></ProtectedRoute>} />
            <Route path="/admin/wholesalers" element={<ProtectedRoute><WholesalersPage /></ProtectedRoute>} />
            <Route path="/admin/merchant-audit" element={<ProtectedRoute><MerchantAuditLogPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
