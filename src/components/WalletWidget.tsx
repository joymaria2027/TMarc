import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { formatMoney } from '@/lib/finance';

interface WalletData {
  id: string;
  party_type: string;
  balance: number;
}

interface TxData {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

export default function WalletWidget() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [recentTx, setRecentTx] = useState<TxData[]>([]);
  const [loading, setLoading] = useState(true);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = hasRole('admin');

  const load = async () => {
    const [wRes, txRes] = await Promise.all([
      supabase.from('wallets').select('id, party_type, balance'),
      supabase.from('wallet_transactions').select('id, type, amount, description, created_at, wallet_id')
        .order('created_at', { ascending: false }).limit(50),
    ]);

    const allWallets = (wRes.data || []) as WalletData[];
    const myWallets = allWallets;

    setWallets(myWallets);

    const walletIds = new Set(myWallets.map(w => w.id));
    const myTx = ((txRes.data || []) as any[])
      .filter(t => walletIds.has(t.wallet_id))
      .slice(0, 5)
      .map(t => ({ id: t.id, type: t.type, amount: t.amount, description: t.description, created_at: t.created_at }));

    setRecentTx(myTx);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const schedule = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => load(), 600);
    };
    const ch = supabase.channel(`wallet-widget-realtime-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => schedule())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, () => schedule())
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(ch);
    };
  }, []);

  if (loading) {
    return (
      <Card aria-busy={true}>
        <CardContent className="p-4 space-y-3" role="status" aria-label="Loading wallet">
          <div className="shimmer h-8 w-32 rounded" aria-hidden="true" />
          <div className="shimmer h-6 w-24 rounded" aria-hidden="true" />
          <span className="sr-only">Loading wallet…</span>
        </CardContent>
      </Card>
    );
  }

  if (wallets.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
            {isAdmin ? 'All Wallets' : 'My Wallet'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="font-medium text-sm">No wallet yet</p>
          <p className="text-xs text-muted-foreground">Wallets are created automatically when your first settlement is approved.</p>
          <Button variant="outline" size="sm" className="mt-1" onClick={() => navigate('/wallet')}>Learn about wallets</Button>
        </CardContent>
      </Card>
    );
  }

  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);

  const partyLabel = (type: string) => {
    const map: Record<string, string> = {
      rider: 'Rider',
      merchant: 'Merchant',
      platform: 'Platform (App Developer)',
      ucs_rides: 'UCS Rides (Business Owner)',
    };
    return map[type] || type;
  };

  return (
    <Card aria-busy={false}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
            {isAdmin ? 'All Wallets' : 'My Wallet'}
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/wallet')} aria-label="View all wallets">
            View All <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-primary">{formatMoney(totalBalance)}</span>
          {wallets.length > 1 && <span className="text-xs text-muted-foreground tabular-nums">across {wallets.length} wallets</span>}
        </div>

        {wallets.length > 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {wallets.slice(0, 4).map(w => (
              <div key={w.id} className="bg-muted rounded p-2 text-xs">
                <p className="text-muted-foreground">{partyLabel(w.party_type)}</p>
                <p className="font-semibold tabular-nums text-right">{formatMoney(w.balance)}</p>
              </div>
            ))}
          </div>
        )}
        {wallets.length > 4 && <p className="text-xs text-muted-foreground">+{wallets.length - 4} more — open Wallets for the full list.</p>}

        {recentTx.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Recent Transactions</p>
            <div className="space-y-1.5">
              {recentTx.map(tx => (
                <div key={tx.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {tx.type === 'credit'
                      ? <TrendingUp className="h-3 w-3 text-success shrink-0" aria-hidden="true" />
                      : <TrendingDown className="h-3 w-3 text-destructive shrink-0" aria-hidden="true" />}
                    <span className="truncate">{tx.description}</span>
                  </div>
                  <span className={`font-medium tabular-nums shrink-0 ml-2 ${tx.type === 'credit' ? 'text-success' : 'text-destructive'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{formatMoney(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
