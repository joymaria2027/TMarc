import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, ShieldCheck, RefreshCw, Info } from 'lucide-react';

type CheckResult = {
  label: string;
  expected: string;
  count: number | null;
  sample: any[];
  error: string | null;
};

const ROLE_EXPECTATIONS: Record<string, string> = {
  company_manager:
    'Should see ONLY their own merchants, deliveries, riders assigned to those merchants, the accountant assigned, revenue-sharing for those merchants, and rider expenses tied to those merchants.',
  rider:
    'Should see ONLY their own rider record, own deliveries, own expenses, own wallet/transactions, plus revenue_sharing rules for merchants they are assigned to. Must NOT see other riders\' wallets or expenses.',
  accountant:
    'Should see deliveries, revenue_sharing, rider_expenses, wallets, and withdrawals only for merchants where they are the assigned accountant.',
  business_owner:
    'Should see ALL deliveries, riders, wallets, transactions, withdrawals, and revenue_sharing across the platform (read-only oversight).',
  app_developer:
    'Should see ALL deliveries, riders, wallets, transactions, alerts, and tariff notifications across the platform.',
};

export default function RlsVerificationPage() {
  const { user, roles, hasRole } = useAuth();
  const [results, setResults] = useState<CheckResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const runChecks = async () => {
    if (!user) return;
    setLoading(true);

    const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    setProfile(prof);

    const checks: { label: string; expected: string; run: () => Promise<{ count: number | null; sample: any[]; error: string | null }> }[] = [
      {
        label: 'Merchants visible',
        expected: 'Manager: own merchants only · Accountant: merchants they are assigned to · BO/Dev: all · Rider: assigned',
        run: async () => {
          const { data, count, error } = await supabase
            .from('merchants')
            .select('id, name, manager_user_id, accountant_user_id', { count: 'exact' })
            .limit(5);
          return { count: count ?? data?.length ?? 0, sample: data ?? [], error: error?.message ?? null };
        },
      },
      {
        label: 'Deliveries visible',
        expected: 'Scoped to your merchant/role assignment',
        run: async () => {
          const { data, count, error } = await supabase
            .from('deliveries')
            .select('id, status, merchant_id, rider_id, order_reference', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(5);
          return { count: count ?? data?.length ?? 0, sample: data ?? [], error: error?.message ?? null };
        },
      },
      {
        label: 'Riders visible',
        expected: 'Manager: active riders only · Rider: own record only · BO/Dev/Accountant: all',
        run: async () => {
          const { data, count, error } = await supabase
            .from('riders')
            .select('id, rider_code, user_id, is_active', { count: 'exact' })
            .limit(5);
          return { count: count ?? data?.length ?? 0, sample: data ?? [], error: error?.message ?? null };
        },
      },
      {
        label: 'Merchant ↔ Rider assignments',
        expected: 'Used to confirm which riders the merchant manager can dispatch.',
        run: async () => {
          const { data, count, error } = await supabase
            .from('merchant_riders')
            .select('merchant_id, rider_id', { count: 'exact' })
            .limit(10);
          return { count: count ?? data?.length ?? 0, sample: data ?? [], error: error?.message ?? null };
        },
      },
      {
        label: 'Revenue sharing rules',
        expected: 'Rider: only for assigned merchants · Manager/Accountant: own merchant · BO: all',
        run: async () => {
          const { data, count, error } = await supabase
            .from('revenue_sharing')
            .select('id, merchant_id, rider_id, rider_percentage, merchant_percentage', { count: 'exact' })
            .limit(5);
          return { count: count ?? data?.length ?? 0, sample: data ?? [], error: error?.message ?? null };
        },
      },
      {
        label: 'Rider expenses',
        expected: 'Rider: own only · Manager/Accountant: own merchant · Admin/Dev: all',
        run: async () => {
          const { data, count, error } = await supabase
            .from('rider_expenses')
            .select('id, rider_id, merchant_id, amount, status', { count: 'exact' })
            .limit(5);
          return { count: count ?? data?.length ?? 0, sample: data ?? [], error: error?.message ?? null };
        },
      },
      {
        label: 'Wallets',
        expected: 'User: own · Manager: own merchant + its riders · BO/Dev/Accountant: all',
        run: async () => {
          const { data, count, error } = await supabase
            .from('wallets')
            .select('id, party_type, party_id, merchant_id, balance', { count: 'exact' })
            .limit(10);
          return { count: count ?? data?.length ?? 0, sample: data ?? [], error: error?.message ?? null };
        },
      },
      {
        label: 'Wallet transactions',
        expected: 'Scoped to wallets you can see',
        run: async () => {
          const { data, count, error } = await supabase
            .from('wallet_transactions')
            .select('id, wallet_id, type, amount', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(5);
          return { count: count ?? data?.length ?? 0, sample: data ?? [], error: error?.message ?? null };
        },
      },
      {
        label: 'Public profiles (RPC)',
        expected: 'Returns only safe fields (name/email/avatar). Never phone or PIN.',
        run: async () => {
          const { data, error } = await supabase.rpc('get_public_profiles');
          const sample = (data ?? []).slice(0, 3);
          const leaked = sample.some((r: any) => 'phone' in r || 'withdrawal_pin' in r);
          return {
            count: data?.length ?? 0,
            sample,
            error: leaked ? 'Sensitive fields leaked from RPC!' : error?.message ?? null,
          };
        },
      },
      {
        label: 'Direct profiles read (PII guard)',
        expected: 'Should return only YOUR profile row (1) — confirms phone/PIN are not exposed to others.',
        run: async () => {
          const { data, count, error } = await supabase
            .from('profiles')
            .select('user_id, full_name, phone', { count: 'exact' })
            .limit(5);
          return { count: count ?? data?.length ?? 0, sample: data ?? [], error: error?.message ?? null };
        },
      },
    ];

    const out: CheckResult[] = [];
    for (const c of checks) {
      const r = await c.run();
      out.push({ label: c.label, expected: c.expected, ...r });
    }
    setResults(out);
    setLoading(false);
  };

  // Developer tool — the check battery hits 10+ tables, so only run it for
  // admin/app_developer sessions (lane-10: intent + perf).
  const isPlatformRole = hasRole('admin') || hasRole('app_developer');

  useEffect(() => {
    if (isPlatformRole) runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isPlatformRole]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> RLS Verification
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sign in as each role and load this page to confirm row-level security returns only the data that role should see.
          </p>
        </div>
        <Button onClick={runChecks} disabled={loading} variant="outline" size="sm" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Re-run
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Current session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">User:</span> {profile?.full_name || user?.email} <span className="text-muted-foreground">({user?.email})</span></div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-muted-foreground">Roles:</span>
            {roles.length === 0 && <Badge variant="outline">no roles</Badge>}
            {roles.map(r => <Badge key={r} variant="secondary" className="capitalize">{r.replace('_', ' ')}</Badge>)}
          </div>
          {roles.map(r => ROLE_EXPECTATIONS[r] && (
            <div key={r} className="mt-2 flex gap-2 rounded-md border bg-muted/40 p-3 text-xs">
              <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div><span className="font-semibold capitalize">{r.replace('_', ' ')}:</span> {ROLE_EXPECTATIONS[r]}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {results.map(r => (
          <Card key={r.label}>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm flex items-center gap-2">
                {r.error ? <XCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-accent" />}
                {r.label}
              </CardTitle>
              <Badge variant={r.error ? 'destructive' : 'secondary'}>
                {r.error ? 'Error' : `${r.count ?? 0} visible`}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{r.expected}</p>
              {r.error && <p className="text-xs text-destructive">{r.error}</p>}
              {r.sample.length > 0 && (
                <pre className="text-[11px] bg-muted rounded p-2 overflow-x-auto max-h-48">
{JSON.stringify(r.sample, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
        {!loading && results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isPlatformRole
              ? 'No checks run yet.'
              : 'This is a developer tool — the check battery runs for admin and app_developer sessions only.'}
          </p>
        )}
      </div>
    </div>
  );
}
