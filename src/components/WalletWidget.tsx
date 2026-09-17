import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

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
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [recentTx, setRecentTx] = useState<TxData[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = hasRole('admin');

  const load = async () => {
    const [wRes, txRes] = await Promise.all([
      supabase.from('wallets').select('id, party_type, balance'),
      supabase.from('wallet_transactions').select('id, type, amount, description, created_at, wallet_id')
        .order('created_at', { ascending: false }).limit(50),
    ]);

    const allWallets = (wRes.data || []) as WalletData[];

    // Filter wallets visible to this user (RLS handles DB-level, but also apply role logic)
    let myWallets = allWallets;
    if (!isAdmin && !hasRole('accountant')) {
      const wIds = new Set<string>();
      // Get wallet IDs from the response (RLS already filters)
      allWallets.forEach(w => wIds.add(w.id));
      myWallets = allWallets;
    }

    setWallets(myWallets);

    // Filter transactions to only those belonging to visible wallets
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
    const ch = supabase.channel('wallet-widget-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (loading || wallets.length === 0) return null;

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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            {isAdmin ? 'All Wallets' : 'My Wallet'}
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/wallet')}>
            View All <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Balance summary */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary">D {totalBalance.toFixed(2)}</span>
          {wallets.length > 1 && <span className="text-xs text-muted-foreground">across {wallets.length} wallets</span>}
        </div>

        {/* Per-wallet breakdown (if multiple) */}
        {wallets.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            {wallets.map(w => (
              <div key={w.id} className="bg-muted rounded p-2 text-xs">
                <p className="text-muted-foreground">{partyLabel(w.party_type)}</p>
                <p className="font-semibold">D {Number(w.balance).toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Recent transactions */}
        {recentTx.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Recent Transactions</p>
            <div className="space-y-1.5">
              {recentTx.map(tx => (
                <div key={tx.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {tx.type === 'credit'
                      ? <TrendingUp className="h-3 w-3 text-emerald-600 shrink-0" />
                      : <TrendingDown className="h-3 w-3 text-destructive shrink-0" />}
                    <span className="truncate">{tx.description}</span>
                  </div>
                  <span className={`font-medium shrink-0 ml-2 ${tx.type === 'credit' ? 'text-emerald-600' : 'text-destructive'}`}>
                    {tx.type === 'credit' ? '+' : '-'}D {Number(tx.amount).toFixed(2)}
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
