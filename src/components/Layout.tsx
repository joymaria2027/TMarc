import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Truck, LayoutDashboard, Users, MapPin, BarChart3, Shield, Settings,
  LogOut, Menu, X, Receipt, Building2, AlertTriangle, PieChart, ShieldCheck, Upload, Navigation, Bell, Wallet, PackageX, Tag, Scale,
  ShoppingBag, Package, CheckSquare, Webhook, ScrollText
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: <LayoutDashboard className="h-4 w-4" />, roles: ['admin', 'business_owner', 'app_developer', 'rider', 'company_manager', 'accountant'] },
  { label: 'My Deliveries', href: '/rider', icon: <Truck className="h-4 w-4" />, roles: ['rider'] },
  { label: 'Deliveries', href: '/deliveries', icon: <MapPin className="h-4 w-4" />, roles: ['admin', 'accountant', 'company_manager', 'business_owner', 'app_developer', 'rider'] },
  { label: 'Rejected Deliveries', href: '/rejected-deliveries', icon: <PackageX className="h-4 w-4" />, roles: ['admin', 'accountant', 'company_manager', 'business_owner', 'app_developer', 'rider'] },
  { label: 'Riders', href: '/riders', icon: <Users className="h-4 w-4" />, roles: ['admin'] },
  { label: 'GPS Tracker', href: '/gps-tracker', icon: <Navigation className="h-4 w-4" />, roles: ['admin', 'business_owner', 'app_developer'] },
  { label: 'Merchants', href: '/merchants', icon: <Building2 className="h-4 w-4" />, roles: ['admin', 'company_manager'] },
  { label: 'My Products', href: '/merchant/products', icon: <ShoppingBag className="h-4 w-4" />, roles: ['admin', 'company_manager'] },
  { label: 'Shop Orders', href: '/merchant/orders', icon: <Package className="h-4 w-4" />, roles: ['admin', 'company_manager'] },
  { label: 'Wholesalers', href: '/admin/wholesalers', icon: <Users className="h-4 w-4" />, roles: ['admin'] },
  { label: 'Product Approvals', href: '/admin/product-approvals', icon: <CheckSquare className="h-4 w-4" />, roles: ['admin'] },
  { label: 'Webhook Events', href: '/admin/webhook-events', icon: <Webhook className="h-4 w-4" />, roles: ['admin', 'app_developer'] },
  { label: 'Dispatch Audit', href: '/admin/dispatch-audit', icon: <ScrollText className="h-4 w-4" />, roles: ['admin', 'business_owner', 'accountant', 'app_developer'] },
  { label: 'Payment Backfill', href: '/admin/payment-backfill', icon: <Scale className="h-4 w-4" />, roles: ['admin', 'accountant', 'business_owner', 'app_developer'] },
  { label: 'Merchant Audit', href: '/admin/merchant-audit', icon: <ScrollText className="h-4 w-4" />, roles: ['admin', 'business_owner', 'app_developer'] },

  { label: 'Business Types', href: '/business-types', icon: <Tag className="h-4 w-4" />, roles: ['admin'] },
  { label: 'Alerts', href: '/alerts', icon: <AlertTriangle className="h-4 w-4" />, roles: ['admin', 'accountant', 'business_owner', 'app_developer', 'company_manager'] },
  { label: 'Settlements', href: '/settlements', icon: <Receipt className="h-4 w-4" />, roles: ['admin', 'accountant', 'company_manager', 'rider', 'business_owner', 'app_developer'] },
  { label: 'Revenue Sharing', href: '/revenue-sharing', icon: <PieChart className="h-4 w-4" />, roles: ['admin', 'company_manager', 'rider', 'business_owner', 'app_developer'] },
  { label: 'Rider Expenses', href: '/rider-expenses', icon: <Upload className="h-4 w-4" />, roles: ['admin', 'accountant', 'app_developer', 'rider'] },
  { label: 'Expense Types', href: '/expense-types', icon: <Tag className="h-4 w-4" />, roles: ['admin', 'accountant'] },
  { label: 'Wallet', href: '/wallet', icon: <Wallet className="h-4 w-4" />, roles: ['admin', 'accountant', 'business_owner', 'app_developer', 'rider', 'company_manager'] },
  { label: 'Analytics', href: '/analytics', icon: <BarChart3 className="h-4 w-4" />, roles: ['admin', 'business_owner', 'app_developer'] },
  { label: 'Fraud Prevention', href: '/fraud', icon: <Shield className="h-4 w-4" />, roles: ['admin'] },
  { label: 'Permissions', href: '/permissions', icon: <ShieldCheck className="h-4 w-4" />, roles: ['admin', 'app_developer'] },
  { label: 'RLS Verification', href: '/rls-verification', icon: <ShieldCheck className="h-4 w-4" />, roles: ['admin', 'app_developer', 'business_owner', 'company_manager', 'accountant', 'rider'] },
  { label: 'Payroll', href: '/payroll', icon: <Wallet className="h-4 w-4" />, roles: ['admin'] },
  { label: 'Reconciliation', href: '/reconciliation', icon: <Scale className="h-4 w-4" />, roles: ['admin', 'accountant'] },
  { label: 'Settings', href: '/settings', icon: <Settings className="h-4 w-4" />, roles: ['admin'] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, roles, signOut, hasRole } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Escape closes the mobile sidebar and returns focus to the menu button.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      // Minimal focus trap: keep Tab cycling inside the open sidebar on mobile.
      if (e.key === 'Tab' && sidebarRef.current) {
        const focusables = sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    // Move focus into the sidebar when it opens.
    sidebarRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // Fetch unread alert count
  useEffect(() => {
    const fetchAlerts = async () => {
      const { count } = await supabase
        .from('delivery_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('is_resolved', false);
      setUnreadAlerts(count || 0);
    };
    fetchAlerts();

    const channel = supabase
      .channel('layout-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, () => fetchAlerts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const visibleNav = navItems.filter(item =>
    item.roles.some(r => hasRole(r as any)) || (roles.length === 0 && item.href === '/')
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
            <span className="font-display text-base text-primary-foreground leading-none">D</span>
          </div>
          <span className="font-display text-lg">DeliveryAce</span>
        </div>
        <div className="flex items-center gap-2">
          {unreadAlerts > 0 && (
            <Link to="/alerts" className="relative" aria-label={`Alerts, ${unreadAlerts} unread`}>
              <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-xs font-bold text-destructive-foreground flex items-center justify-center tabular-nums">{unreadAlerts > 9 ? '9+' : unreadAlerts}</span>
            </Link>
          )}
          <Button ref={menuButtonRef} variant="ghost" size="icon" aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={sidebarOpen} aria-controls="app-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </Button>
        </div>
      </div>

      {/* Sidebar */}
      <aside ref={sidebarRef} id="app-sidebar" aria-label="Primary navigation" className={cn(
        "fixed inset-y-0 left-0 z-30 w-64 transform border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:relative md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border px-5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <span className="font-display text-lg text-primary-foreground leading-none">D</span>
            </div>
            <span className="font-display text-xl tracking-tight">DeliveryAce</span>
          </div>
          {unreadAlerts > 0 && (
            <Link to="/alerts" onClick={() => setSidebarOpen(false)} className="relative hidden md:block" aria-label={`Alerts, ${unreadAlerts} unread`}>
              <Bell className="h-5 w-5 text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors" aria-hidden="true" />
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-xs font-bold text-destructive-foreground flex items-center justify-center tabular-nums">{unreadAlerts > 9 ? '9+' : unreadAlerts}</span>
            </Link>
          )}
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-0.5 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
          {visibleNav.map(item => (
            <Link
              key={item.href}
              to={item.href}
              aria-current={location.pathname === item.href ? 'page' : undefined}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                location.pathname === item.href
                  ? "bg-primary/15 text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              {item.icon}
              {item.label}
              {item.href === '/alerts' && unreadAlerts > 0 && (
                <Badge variant="destructive" className="ml-auto text-xs h-5 px-1.5 tabular-nums">{unreadAlerts}</Badge>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <a
            href="/shop"
            target="_blank"
            rel="noreferrer"
            className="mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <ShoppingBag className="h-4 w-4" />
            View Storefront
          </a>
          <div className="mb-2 px-3 text-xs text-sidebar-foreground/60 truncate">{user?.email}</div>
          <div className="mb-2 flex flex-wrap gap-1 px-3">
            {roles.map(r => (
              <span key={r} className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary capitalize">{r.replace('_', ' ')}</span>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-foreground/40 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <main id="main-content" tabIndex={-1} className="flex-1 pt-14 md:pt-0">
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
