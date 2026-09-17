import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Wallet, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Clock, XCircle, Loader2, History, TrendingUp, TrendingDown, KeyRound, ShieldCheck, ChevronDown, FolderOpen, Bike, Store, ShieldCheck as ShieldIcon, BarChart3, Search } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from '@/components/ui/pagination';
import { toast } from 'sonner';

interface WalletRow {
  id: string;
  party_type: string;
  party_id: string | null;
  user_id: string | null;
  balance: number;
  updated_at: string;
  merchant_id: string | null;
}

interface WithdrawalRow {
  id: string;
  wallet_id: string;
  requested_by: string;
  amount: number;
  status: string;
  payout_method: string | null;
  payout_reference: string | null;
  notes: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
}

interface TransactionRow {
  id: string;
  wallet_id: string;
  type: string;
  amount: number;
  description: string;
  delivery_id: string | null;
  withdrawal_request_id: string | null;
  created_at: string;
}

const PAYOUT_METHODS = ['Cash', 'Wave', 'QMoney', 'Afrimoney', 'APS Wallet', 'Bank Transfer'];

export default function WalletPage() {
  const { user, hasRole } = useAuth();
  const isAccountant = hasRole('accountant');
  const isAdmin = hasRole('admin');
  const isMerchantManager = hasRole('company_manager');
  // Accountants/admins handle initial approval; merchant managers (and admins) handle final approval
  // Manager approves first, accountant finalizes (debits wallet).
  const canApprove = isMerchantManager || isAdmin;
  const canFinalize = isAccountant || isAdmin;
  const canProcess = canApprove || canFinalize;

  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [partyNames, setPartyNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [txFilter, setTxFilter] = useState<string>('all'); // 'all', 'credit', 'debit', or wallet_id
  const [folderSearch, setFolderSearch] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string>('balances');
  const [withdrawSearch, setWithdrawSearch] = useState('');
  const [withdrawStatusFilter, setWithdrawStatusFilter] = useState('all');
  const [withdrawPage, setWithdrawPage] = useState(1);
  const [txSearch, setTxSearch] = useState('');
  const [txPage, setTxPage] = useState(1);
  const WITHDRAW_PAGE_SIZE = 10;
  const TX_PAGE_SIZE = 20;

  // Withdraw dialog
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletRow | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Process dialog (accountant initial approval / merchant manager finalization)
  const [processOpen, setProcessOpen] = useState(false);
  const [processMode, setProcessMode] = useState<'approve' | 'finalize'>('approve');
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRow | null>(null);
  const [payoutMethod, setPayoutMethod] = useState('');
  const [payoutRef, setPayoutRef] = useState('');
  const [bankName, setBankName] = useState('');
  const [processing, setProcessing] = useState(false);

  // PIN state
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'new' | 'confirm'>('new');
  const [settingPin, setSettingPin] = useState(false);

  // PIN verification for withdrawal
  const [pinVerifyOpen, setPinVerifyOpen] = useState(false);
  const [verifyPin, setVerifyPin] = useState('');
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    const [wRes, wrRes, txRes] = await Promise.all([
      supabase.from('wallets').select('*'),
      supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    const wData = (wRes.data || []) as WalletRow[];
    setWallets(wData);
    setWithdrawals((wrRes.data || []) as WithdrawalRow[]);
    setTransactions((txRes.data || []) as TransactionRow[]);

    // Check if user has a withdrawal PIN
    const { data: pinData } = await supabase.rpc('has_withdrawal_pin');
    setHasPin(pinData ?? false);

    // Resolve party names
    const names: Record<string, string> = {};
    const merchantNames: Record<string, string> = {};
    const riderIds = wData.filter(w => w.party_type === 'rider' && w.party_id).map(w => w.party_id!);
    const restIds = wData.filter(w => w.party_type === 'merchant' && w.party_id).map(w => w.party_id!);
    // Also collect merchant_ids referenced from rider wallets
    const riderWalletRestIds = wData.filter(w => w.party_type === 'rider' && w.merchant_id).map(w => w.merchant_id!);
    const allRestIds = Array.from(new Set([...restIds, ...riderWalletRestIds]));

    if (riderIds.length) {
      const { data: riders } = await supabase.from('riders').select('id, user_id').in('id', riderIds);
      if (riders?.length) {
        const userIds = riders.map(r => r.user_id);
        const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
        riders.forEach(r => {
          const p = profiles?.find(p => p.user_id === r.user_id);
          names[r.id] = p?.full_name || 'Rider';
        });
      }
    }
    if (allRestIds.length) {
      const { data: rests } = await supabase.from('merchants').select('id, name').in('id', allRestIds);
      rests?.forEach(r => { names[r.id] = r.name; merchantNames[r.id] = r.name; });
    }
    setPartyNames(names);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('wallet-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const getPartyLabel = (w: WalletRow) => {
    if (w.party_type === 'platform') return 'Platform (App Developer)';
    if (w.party_type === 'ucs_rides') return 'UCS Rides (Business Owner)';
    if (w.party_type === 'rider' && w.party_id) {
      const riderName = partyNames[w.party_id] || 'Rider';
      const restName = w.merchant_id ? partyNames[w.merchant_id] : null;
      return restName ? `Rider: ${riderName} – ${restName}` : `Rider: ${riderName}`;
    }
    if (w.party_id && partyNames[w.party_id]) return `Merchant: ${partyNames[w.party_id]}`;
    return w.party_type;
  };

  // Admin and accountant see all wallets; other users see wallets linked to them by user_id
  // Also match by role: business_owner sees ucs_rides, app_developer sees platform
  const myWallets = isAdmin ? wallets : wallets.filter(w => {
    if (w.user_id === user?.id) return true;
    if (isAccountant) return true;
    if (hasRole('business_owner') && w.party_type === 'ucs_rides') return true;
    if (hasRole('app_developer') && w.party_type === 'platform') return true;
    return false;
  });

  // Set withdrawal PIN
  const handleSetPin = async () => {
    if (pinStep === 'new') {
      if (newPin.length < 4) { toast.error('PIN must be at least 4 digits'); return; }
      setPinStep('confirm');
      return;
    }
    if (confirmPin !== newPin) {
      toast.error('PINs do not match');
      setConfirmPin('');
      return;
    }
    setSettingPin(true);
    const { error } = await supabase.rpc('set_withdrawal_pin', { _pin: newPin });
    setSettingPin(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Withdrawal PIN set successfully');
    setHasPin(true);
    setPinSetupOpen(false);
    setNewPin('');
    setConfirmPin('');
    setPinStep('new');
  };

  // Initiate withdrawal – check for PIN first
  const initiateWithdraw = (wallet: WalletRow) => {
    setSelectedWallet(wallet);
    if (!hasPin) {
      toast.error('Please set a withdrawal PIN first');
      setPinSetupOpen(true);
      return;
    }
    setWithdrawOpen(true);
  };

  // Submit withdrawal after PIN verification
  const handleWithdraw = async () => {
    if (!selectedWallet || !withdrawAmount || Number(withdrawAmount) <= 0) return;
    if (Number(withdrawAmount) > selectedWallet.balance) {
      toast.error('Amount exceeds wallet balance');
      return;
    }
    // Open PIN verification
    setWithdrawOpen(false);
    setPinVerifyOpen(true);
  };

  // Verify PIN and submit withdrawal
  const handlePinVerifyAndSubmit = async () => {
    if (verifyPin.length < 4) { toast.error('Enter your PIN'); return; }
    setVerifying(true);
    const { data: valid, error: verifyError } = await supabase.rpc('verify_withdrawal_pin', { _pin: verifyPin });
    if (verifyError) { setVerifying(false); toast.error(verifyError.message); return; }
    if (!valid) { setVerifying(false); toast.error('Incorrect PIN'); setVerifyPin(''); return; }

    // PIN verified – submit withdrawal
    const { error } = await supabase.from('withdrawal_requests').insert({
      wallet_id: selectedWallet!.id,
      requested_by: user!.id,
      amount: Number(withdrawAmount),
      notes: withdrawNotes || null,
    } as any);
    setVerifying(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Withdrawal request submitted');
    setPinVerifyOpen(false);
    setVerifyPin('');
    setWithdrawAmount('');
    setWithdrawNotes('');
    load();
  };

  // Process withdrawal: approve (accountant) / finalize (merchant manager) / reject
  const handleProcess = async (action: 'approve' | 'finalize' | 'rejected') => {
    if (!selectedRequest) return;
    if (action === 'finalize' && !payoutMethod) {
      toast.error('Please select a payout method');
      return;
    }
    setProcessing(true);
    const finalMethod = payoutMethod === 'Bank Transfer' ? `Bank Transfer (${bankName})` : payoutMethod;

    let updatePayload: any = {
      processed_by: user!.id,
      processed_at: new Date().toISOString(),
    };
    if (action === 'approve') {
      updatePayload.status = 'manager_approved';
    } else if (action === 'finalize') {
      updatePayload.status = 'completed';
      updatePayload.payout_method = finalMethod;
      updatePayload.payout_reference = payoutRef || null;
    } else {
      updatePayload.status = 'rejected';
    }

    const { error } = await supabase
      .from('withdrawal_requests')
      .update(updatePayload)
      .eq('id', selectedRequest.id);
    setProcessing(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      action === 'approve' ? 'Approved – sent to accountant for final approval'
        : action === 'finalize' ? 'Withdrawal finalized – wallet debited'
        : 'Withdrawal rejected'
    );
    setProcessOpen(false);
    setPayoutMethod('');
    setPayoutRef('');
    setBankName('');
    load();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'secondary',
      manager_approved: 'outline',
      processing: 'outline',
      completed: 'default',
      rejected: 'destructive',
    };
    const labels: Record<string, string> = {
      pending: 'Pending Manager',
      manager_approved: 'Awaiting Accountant',
      completed: 'Completed',
      rejected: 'Rejected',
    };
    return <Badge variant={map[s] as any || 'secondary'} className="capitalize">{labels[s] || s}</Badge>;
  };

  const statusIcon = (s: string) => {
    if (s === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (s === 'rejected') return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2"><Wallet className="h-3.5 w-3.5" />Treasury</p>
          <h1 className="font-display text-4xl tracking-tight">Wallets.</h1>
          <p className="text-muted-foreground">Balances, withdrawals, and transaction history.</p>
        </div>
        <Button variant={hasPin ? 'outline' : 'default'} size="sm" className="gap-1" onClick={() => { setPinSetupOpen(true); setPinStep('new'); setNewPin(''); setConfirmPin(''); }}>
          <KeyRound className="h-4 w-4" />
          {hasPin ? 'Change PIN' : 'Set Withdrawal PIN'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="balances" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> Balances</TabsTrigger>
          <TabsTrigger value="withdrawals" className="gap-1.5"><ArrowDownToLine className="h-3.5 w-3.5" /> Withdrawals</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5"><History className="h-3.5 w-3.5" /> Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="space-y-4 mt-0">
      {/* Wallet Cards – grouped into folders by party type */}
      {(() => {
        // Aggregate wallets per logical entity (rider/merchant collapse multi-merchant rows into one)
        const groups = new Map<string, WalletRow[]>();
        myWallets.forEach(w => {
          const key = (w.party_type === 'rider' || w.party_type === 'merchant')
            ? `${w.party_type}:${w.party_id}`
            : `${w.party_type}:${w.id}`;
          const arr = groups.get(key) || [];
          arr.push(w);
          groups.set(key, arr);
        });

        const renderCard = (key: string, ws: WalletRow[]) => {
          const totalBalance = ws.reduce((s, w) => s + Number(w.balance), 0);
          const totalIncome = ws.reduce((s, w) => s + transactions.filter(t => t.wallet_id === w.id && t.type === 'credit').reduce((a, t) => a + Number(t.amount), 0), 0);
          const totalWithdrawn = ws.reduce((s, w) => s + transactions.filter(t => t.wallet_id === w.id && t.type === 'debit').reduce((a, t) => a + Number(t.amount), 0), 0);
          const head = ws[0];
          const headerLabel = head.party_type === 'rider' && head.party_id
            ? `Rider: ${partyNames[head.party_id] || 'Rider'}`
            : getPartyLabel(head);
          const showBreakdown = ws.length > 1;
          const canOwn = (w: WalletRow) => w.user_id === user?.id || isAdmin;

          return (
            <Card key={key} className="relative">
              <CardHeader className="pb-2">
                <CardDescription className="capitalize">{head.party_type}</CardDescription>
                <CardTitle className="text-lg">{headerLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-display text-4xl tracking-tight tabular-nums text-primary">D {totalBalance.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {showBreakdown ? `Across ${ws.length} merchants` : `Updated ${new Date(head.updated_at).toLocaleDateString()}`}
                </p>

                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted rounded p-1.5">
                    <p className="text-muted-foreground">Total Income</p>
                    <p className="font-semibold text-emerald-600">D {totalIncome.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted rounded p-1.5">
                    <p className="text-muted-foreground">Withdrawn</p>
                    <p className="font-semibold text-destructive">D {totalWithdrawn.toFixed(2)}</p>
                  </div>
                </div>

                {showBreakdown && ws.some(w => w.merchant_id && partyNames[w.merchant_id]) ? (
                  <div className="mt-3 space-y-1.5 border-t pt-2">
                    <p className="text-xs font-semibold text-muted-foreground">Per merchant</p>
                    {ws.filter(w => w.merchant_id && partyNames[w.merchant_id]).map(w => (
                      <div key={w.id} className="flex items-center justify-between text-xs gap-2">
                        <span className="truncate">{partyNames[w.merchant_id!]}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-medium">D {Number(w.balance).toFixed(2)}</span>
                          {canOwn(w) && w.balance > 0 && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => initiateWithdraw(w)}>
                              <ArrowUpFromLine className="h-3 w-3" /> Withdraw
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  canOwn(head) && head.balance > 0 && (
                    <Button size="sm" className="mt-3 gap-1" onClick={() => initiateWithdraw(head)}>
                      <ArrowUpFromLine className="h-3.5 w-3.5" /> Request Withdrawal
                    </Button>
                  )
                )}
              </CardContent>
            </Card>
          );
        };

        // Categorize each group into a folder bucket
        const buckets: { id: string; label: string; icon: JSX.Element; entries: [string, WalletRow[]][] }[] = [
          { id: 'riders', label: 'Riders', icon: <Bike className="h-4 w-4" />, entries: [] },
          { id: 'merchants', label: 'Merchants', icon: <Store className="h-4 w-4" />, entries: [] },
          { id: 'admin', label: 'Admin / Platform', icon: <ShieldIcon className="h-4 w-4" />, entries: [] },
        ];
        Array.from(groups.entries()).forEach(([k, ws]) => {
          const t = ws[0].party_type;
          if (t === 'rider') buckets[0].entries.push([k, ws]);
          else if (t === 'merchant') buckets[1].entries.push([k, ws]);
          else buckets[2].entries.push([k, ws]); // platform, ucs_rides
        });

        const nonEmpty = buckets.filter(b => b.entries.length > 0);
        const useFolders = nonEmpty.length > 1 || myWallets.length > 3;

        if (myWallets.length === 0) {
          return <Card><CardContent className="py-10 text-center text-muted-foreground">No wallets found. Wallets are created automatically when settlements are approved.</CardContent></Card>;
        }

        if (!useFolders) {
          return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(groups.entries()).map(([k, ws]) => renderCard(k, ws))}
            </div>
          );
        }

        const matchesEntry = (ws: WalletRow[], q: string) => {
          if (!q) return true;
          const needle = q.toLowerCase();
          const head = ws[0];
          const baseLabel = head.party_type === 'rider' && head.party_id
            ? (partyNames[head.party_id] || 'Rider')
            : getPartyLabel(head);
          if (baseLabel.toLowerCase().includes(needle)) return true;
          // Match nested merchant names on rider per-merchant rows
          return ws.some(w => w.merchant_id && (partyNames[w.merchant_id] || '').toLowerCase().includes(needle));
        };

        return (
          <div className="space-y-4">
            {nonEmpty.map(b => {
              const totalBal = b.entries.reduce((s, [, ws]) => s + ws.reduce((a, w) => a + Number(w.balance), 0), 0);
              const totalIncome = b.entries.reduce((s, [, ws]) => s + ws.reduce((a, w) => a + transactions.filter(t => t.wallet_id === w.id && t.type === 'credit').reduce((x, t) => x + Number(t.amount), 0), 0), 0);
              const totalWithdrawn = b.entries.reduce((s, [, ws]) => s + ws.reduce((a, w) => a + transactions.filter(t => t.wallet_id === w.id && t.type === 'debit').reduce((x, t) => x + Number(t.amount), 0), 0), 0);
              const q = folderSearch[b.id] || '';
              const filtered = b.entries.filter(([, ws]) => matchesEntry(ws, q));
              return (
                <Collapsible key={b.id} defaultOpen>
                  <Card>
                    <CollapsibleTrigger className="w-full group">
                      <CardHeader className="pb-3 flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 text-primary" />
                          {b.icon}
                          <CardTitle className="text-base">{b.label}</CardTitle>
                          <Badge variant="secondary" className="ml-1">{b.entries.length}</Badge>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</p>
                            <p className="font-display text-base tabular-nums text-primary leading-tight">D {totalBal.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Income</p>
                            <p className="font-display text-base tabular-nums text-emerald-600 leading-tight">D {totalIncome.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Withdrawn</p>
                            <p className="font-display text-base tabular-nums text-destructive leading-tight">D {totalWithdrawn.toFixed(2)}</p>
                          </div>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-3">
                        <Input
                          placeholder={`Search ${b.label.toLowerCase()}…`}
                          value={q}
                          onChange={(e) => setFolderSearch(prev => ({ ...prev, [b.id]: e.target.value }))}
                          className="max-w-xs h-8 text-sm"
                        />
                        {filtered.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4">No wallets match "{q}".</p>
                        ) : (
                          <>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              {filtered.map(([k, ws]) => renderCard(k, ws))}
                            </div>

                            {/* Per-wallet transaction breakdown */}
                            {(() => {
                              type Row = { date: string; walletId: string; walletLabel: string; income: number; withdrawals: number };
                              const rowsMap = new Map<string, Row>();
                              filtered.forEach(([, ws]) => {
                                ws.forEach(w => {
                                  const label = w.party_type === 'rider' && w.party_id
                                    ? `${partyNames[w.party_id] || 'Rider'}${w.merchant_id ? ' – ' + (partyNames[w.merchant_id] || 'Merchant') : ''}`
                                    : getPartyLabel(w);
                                  transactions.filter(t => t.wallet_id === w.id).forEach(t => {
                                    const date = new Date(t.created_at).toISOString().slice(0, 10);
                                    const key = `${date}__${w.id}`;
                                    const existing = rowsMap.get(key) || { date, walletId: w.id, walletLabel: label, income: 0, withdrawals: 0 };
                                    if (t.type === 'credit') existing.income += Number(t.amount);
                                    else if (t.type === 'debit') existing.withdrawals += Number(t.amount);
                                    rowsMap.set(key, existing);
                                  });
                                });
                              });
                              const rows = Array.from(rowsMap.values()).sort((a, b) => b.date.localeCompare(a.date) || a.walletLabel.localeCompare(b.walletLabel));
                              const totalIn = rows.reduce((s, r) => s + r.income, 0);
                              const totalOut = rows.reduce((s, r) => s + r.withdrawals, 0);
                              return (
                                <Collapsible className="mt-4">
                                  <CollapsibleTrigger className="w-full group flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm hover:bg-muted/60">
                                    <span className="flex items-center gap-2 font-medium">
                                      <BarChart3 className="h-4 w-4 text-primary" />
                                      Transaction breakdown
                                      <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    {rows.length === 0 ? (
                                      <p className="text-sm text-muted-foreground py-4 px-3">No transactions yet.</p>
                                    ) : (
                                      <div className="border rounded-md mt-2 overflow-hidden">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Date</TableHead>
                                              <TableHead>Wallet</TableHead>
                                              <TableHead className="text-right">Income (D)</TableHead>
                                              <TableHead className="text-right">Withdrawals (D)</TableHead>
                                              <TableHead className="text-right">Net (D)</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {rows.map((r, i) => (
                                              <TableRow key={`${r.date}-${r.walletId}-${i}`}>
                                                <TableCell className="whitespace-nowrap tabular-nums">{r.date}</TableCell>
                                                <TableCell className="text-sm">{r.walletLabel}</TableCell>
                                                <TableCell className="text-right tabular-nums text-emerald-600">{r.income > 0 ? r.income.toFixed(2) : '–'}</TableCell>
                                                <TableCell className="text-right tabular-nums text-destructive">{r.withdrawals > 0 ? r.withdrawals.toFixed(2) : '–'}</TableCell>
                                                <TableCell className="text-right tabular-nums font-medium">{(r.income - r.withdrawals).toFixed(2)}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                          <TableFooter>
                                            <TableRow>
                                              <TableCell colSpan={2} className="font-semibold">Totals</TableCell>
                                              <TableCell className="text-right tabular-nums text-emerald-600 font-semibold">{totalIn.toFixed(2)}</TableCell>
                                              <TableCell className="text-right tabular-nums text-destructive font-semibold">{totalOut.toFixed(2)}</TableCell>
                                              <TableCell className="text-right tabular-nums font-semibold">{(totalIn - totalOut).toFixed(2)}</TableCell>
                                            </TableRow>
                                          </TableFooter>
                                        </Table>
                                      </div>
                                    )}
                                  </CollapsibleContent>
                                </Collapsible>
                              );
                            })()}
                          </>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        );
      })()}
        </TabsContent>

        <TabsContent value="withdrawals" className="space-y-4 mt-0">
          {/* Withdrawal Requests */}
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5" /> Withdrawal Requests</CardTitle>
                <Badge variant="secondary">{withdrawals.length} total</Badge>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search wallet, status, method, notes, amount…"
                    value={withdrawSearch}
                    onChange={(e) => { setWithdrawSearch(e.target.value); setWithdrawPage(1); }}
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={withdrawStatusFilter} onValueChange={(v) => { setWithdrawStatusFilter(v); setWithdrawPage(1); }}>
                  <SelectTrigger className="w-full sm:w-[200px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending Manager</SelectItem>
                    <SelectItem value="manager_approved">Awaiting Accountant</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const needle = withdrawSearch.trim().toLowerCase();
                let filtered = withdrawals;
                if (withdrawStatusFilter !== 'all') filtered = filtered.filter(wr => wr.status === withdrawStatusFilter);
                if (needle) {
                  filtered = filtered.filter(wr => {
                    const wallet = wallets.find(w => w.id === wr.wallet_id);
                    const label = wallet ? getPartyLabel(wallet).toLowerCase() : '';
                    return label.includes(needle)
                      || wr.status.toLowerCase().includes(needle)
                      || (wr.payout_method || '').toLowerCase().includes(needle)
                      || (wr.notes || '').toLowerCase().includes(needle)
                      || String(wr.amount).includes(needle);
                  });
                }
                if (filtered.length === 0) {
                  return <p className="text-center text-muted-foreground py-6">No withdrawal requests match your search</p>;
                }
                const totalPages = Math.max(1, Math.ceil(filtered.length / WITHDRAW_PAGE_SIZE));
                const page = Math.min(withdrawPage, totalPages);
                const start = (page - 1) * WITHDRAW_PAGE_SIZE;
                const paged = filtered.slice(start, start + WITHDRAW_PAGE_SIZE);
                return (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-2 pr-4">Date</th>
                            <th className="pb-2 pr-4">Wallet</th>
                            <th className="pb-2 pr-4">Amount</th>
                            <th className="pb-2 pr-4">Status</th>
                            <th className="pb-2 pr-4">Payout Method</th>
                            <th className="pb-2 pr-4">Notes</th>
                            {canProcess && <th className="pb-2">Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {paged.map(wr => {
                            const wallet = wallets.find(w => w.id === wr.wallet_id);
                            return (
                              <tr key={wr.id} className="border-b last:border-0">
                                <td className="py-2 pr-4 whitespace-nowrap">{new Date(wr.created_at).toLocaleDateString()}</td>
                                <td className="py-2 pr-4">{wallet ? getPartyLabel(wallet) : '–'}</td>
                                <td className="py-2 pr-4 font-medium">D {Number(wr.amount).toFixed(2)}</td>
                                <td className="py-2 pr-4">{statusBadge(wr.status)}</td>
                                <td className="py-2 pr-4">{wr.payout_method || '–'}</td>
                                <td className="py-2 pr-4 max-w-[200px] truncate">{wr.notes || '–'}</td>
                                {canProcess && (
                                  <td className="py-2">
                                    {wr.status === 'pending' && canApprove && (
                                      <Button size="sm" variant="outline" onClick={() => { setSelectedRequest(wr); setProcessMode('approve'); setProcessOpen(true); }}>
                                        Approve
                                      </Button>
                                    )}
                                    {wr.status === 'manager_approved' && canFinalize && (
                                      <Button size="sm" onClick={() => { setSelectedRequest(wr); setProcessMode('finalize'); setProcessOpen(true); }}>
                                        Finalize
                                      </Button>
                                    )}
                                    {wr.status === 'pending' && !canApprove && (
                                      <span className="text-xs text-muted-foreground">Awaiting manager</span>
                                    )}
                                    {wr.status === 'manager_approved' && !canFinalize && (
                                      <span className="text-xs text-muted-foreground">Awaiting accountant</span>
                                    )}
                                    {(wr.status === 'completed' || wr.status === 'rejected') && (
                                      <span className="flex items-center gap-1">{statusIcon(wr.status)}</span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                      <span>Showing {start + 1}–{Math.min(start + WITHDRAW_PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                      {totalPages > 1 && (
                        <Pagination className="mx-0 w-auto justify-end">
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setWithdrawPage(Math.max(1, page - 1)); }} />
                            </PaginationItem>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                              .map((p, idx, arr) => (
                                <span key={p} className="contents">
                                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                                    <PaginationItem><PaginationEllipsis /></PaginationItem>
                                  )}
                                  <PaginationItem>
                                    <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); setWithdrawPage(p); }}>{p}</PaginationLink>
                                  </PaginationItem>
                                </span>
                              ))}
                            <PaginationItem>
                              <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setWithdrawPage(Math.min(totalPages, page + 1)); }} />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      )}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4 mt-0">
          {/* Transaction History */}
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Transaction History</CardTitle>
                <Select value={txFilter} onValueChange={(v) => { setTxFilter(v); setTxPage(1); }}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Transactions</SelectItem>
                    <SelectItem value="credit">Credits Only</SelectItem>
                    <SelectItem value="debit">Debits Only</SelectItem>
                    {myWallets.map(w => (
                      <SelectItem key={w.id} value={w.id}>{getPartyLabel(w)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search description, wallet, reference, amount…"
                  value={txSearch}
                  onChange={(e) => { setTxSearch(e.target.value); setTxPage(1); }}
                  className="pl-9 h-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const myWalletIds = myWallets.map(w => w.id);
                let filtered = transactions.filter(t => myWalletIds.includes(t.wallet_id));
                if (txFilter === 'credit') filtered = filtered.filter(t => t.type === 'credit');
                else if (txFilter === 'debit') filtered = filtered.filter(t => t.type === 'debit');
                else if (txFilter !== 'all') filtered = filtered.filter(t => t.wallet_id === txFilter);

                const needle = txSearch.trim().toLowerCase();
                if (needle) {
                  filtered = filtered.filter(tx => {
                    const wallet = wallets.find(w => w.id === tx.wallet_id);
                    const label = wallet ? getPartyLabel(wallet).toLowerCase() : '';
                    return (tx.description || '').toLowerCase().includes(needle)
                      || label.includes(needle)
                      || String(tx.amount).includes(needle)
                      || (tx.delivery_id || '').toLowerCase().includes(needle)
                      || (tx.withdrawal_request_id || '').toLowerCase().includes(needle);
                  });
                }

                if (filtered.length === 0) return <p className="text-center text-muted-foreground py-6">No transactions match your search</p>;

                const totalPages = Math.max(1, Math.ceil(filtered.length / TX_PAGE_SIZE));
                const page = Math.min(txPage, totalPages);
                const start = (page - 1) * TX_PAGE_SIZE;
                const paged = filtered.slice(start, start + TX_PAGE_SIZE);

                return (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-2 pr-4">Date & Time</th>
                            <th className="pb-2 pr-4">Type</th>
                            <th className="pb-2 pr-4">Wallet</th>
                            <th className="pb-2 pr-4">Amount</th>
                            <th className="pb-2 pr-4">Description</th>
                            <th className="pb-2">Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paged.map(tx => {
                            const wallet = wallets.find(w => w.id === tx.wallet_id);
                            return (
                              <tr key={tx.id} className="border-b last:border-0">
                                <td className="py-2 pr-4 whitespace-nowrap">{new Date(tx.created_at).toLocaleString()}</td>
                                <td className="py-2 pr-4">
                                  <span className={`flex items-center gap-1 font-medium ${tx.type === 'credit' ? 'text-emerald-600' : 'text-destructive'}`}>
                                    {tx.type === 'credit' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                    {tx.type === 'credit' ? 'Credit' : 'Debit'}
                                  </span>
                                </td>
                                <td className="py-2 pr-4">{wallet ? getPartyLabel(wallet) : '–'}</td>
                                <td className={`py-2 pr-4 font-medium ${tx.type === 'credit' ? 'text-emerald-600' : 'text-destructive'}`}>
                                  {tx.type === 'credit' ? '+' : '-'} D {Number(tx.amount).toFixed(2)}
                                </td>
                                <td className="py-2 pr-4 max-w-[250px] truncate">{tx.description}</td>
                                <td className="py-2 text-xs text-muted-foreground">
                                  {tx.delivery_id ? `Delivery: ${tx.delivery_id.slice(0, 8)}` : ''}
                                  {tx.withdrawal_request_id ? `Withdrawal: ${tx.withdrawal_request_id.slice(0, 8)}` : ''}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                      <span>Showing {start + 1}–{Math.min(start + TX_PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                      {totalPages > 1 && (
                        <Pagination className="mx-0 w-auto justify-end">
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setTxPage(Math.max(1, page - 1)); }} />
                            </PaginationItem>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                              .map((p, idx, arr) => (
                                <span key={p} className="contents">
                                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                                    <PaginationItem><PaginationEllipsis /></PaginationItem>
                                  )}
                                  <PaginationItem>
                                    <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); setTxPage(p); }}>{p}</PaginationLink>
                                  </PaginationItem>
                                </span>
                              ))}
                            <PaginationItem>
                              <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setTxPage(Math.min(totalPages, page + 1)); }} />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      )}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Withdrawal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Wallet</Label>
              <p className="text-sm font-medium">{selectedWallet ? getPartyLabel(selectedWallet) : ''}</p>
              <p className="text-xs text-muted-foreground">Available: D {selectedWallet ? Number(selectedWallet.balance).toFixed(2) : '0.00'}</p>
            </div>
            <div>
              <Label>Amount</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" max={selectedWallet?.balance} value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="0.00" className="flex-1" />
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setWithdrawAmount(String(selectedWallet?.balance ?? 0))}>
                  Withdraw All
                </Button>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={withdrawNotes} onChange={e => setWithdrawNotes(e.target.value)} placeholder="Any notes for the accountant..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button onClick={handleWithdraw} disabled={!withdrawAmount || Number(withdrawAmount) <= 0}>
              <ShieldCheck className="h-4 w-4 mr-1" /> Verify & Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Dialog */}
      <Dialog open={processOpen} onOpenChange={setProcessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {processMode === 'approve' ? 'Approve Withdrawal (Step 1 of 2)' : 'Finalize Withdrawal (Final Approval)'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted rounded p-3">
              <p className="text-sm">Amount: <span className="font-bold">D {selectedRequest ? Number(selectedRequest.amount).toFixed(2) : ''}</span></p>
              {selectedRequest?.notes && <p className="text-xs text-muted-foreground mt-1">Notes: {selectedRequest.notes}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                {processMode === 'approve'
                  ? 'After your approval, the request will be sent to the merchant manager for final approval. The wallet will only be debited after final approval.'
                  : 'Final approval will debit the wallet balance immediately and record the transaction.'}
              </p>
            </div>
            {processMode === 'finalize' && (
              <>
                <div>
                  <Label>Payout Method</Label>
                  <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {PAYOUT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {payoutMethod === 'Bank Transfer' && (
                  <div>
                    <Label>Bank Name</Label>
                    <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Sierra Leone Commercial Bank" />
                  </div>
                )}
                <div>
                  <Label>Payout Reference (optional)</Label>
                  <Input value={payoutRef} onChange={e => setPayoutRef(e.target.value)} placeholder="Transaction ID or reference" />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="destructive" onClick={() => handleProcess('rejected')} disabled={processing}>Reject</Button>
            {processMode === 'approve' ? (
              <Button onClick={() => handleProcess('approve')} disabled={processing}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve & Forward'}
              </Button>
            ) : (
              <Button onClick={() => handleProcess('finalize')} disabled={processing}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Finalize & Debit Wallet'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* PIN Setup Dialog */}
      <Dialog open={pinSetupOpen} onOpenChange={(open) => { setPinSetupOpen(open); if (!open) { setPinStep('new'); setNewPin(''); setConfirmPin(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> {hasPin ? 'Change' : 'Set'} Withdrawal PIN</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 flex flex-col items-center">
            <p className="text-sm text-muted-foreground text-center">
              {pinStep === 'new' ? 'Enter a 4-6 digit PIN to secure your withdrawals' : 'Confirm your PIN'}
            </p>
            <InputOTP
              maxLength={6}
              value={pinStep === 'new' ? newPin : confirmPin}
              onChange={val => pinStep === 'new' ? setNewPin(val) : setConfirmPin(val)}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <DialogFooter>
            {pinStep === 'confirm' && (
              <Button variant="outline" onClick={() => { setPinStep('new'); setConfirmPin(''); }}>Back</Button>
            )}
            <Button onClick={handleSetPin} disabled={settingPin || (pinStep === 'new' ? newPin.length < 4 : confirmPin.length < 4)}>
              {settingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : pinStep === 'new' ? 'Next' : 'Set PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PIN Verification Dialog */}
      <Dialog open={pinVerifyOpen} onOpenChange={(open) => { setPinVerifyOpen(open); if (!open) setVerifyPin(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Verify Withdrawal PIN</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 flex flex-col items-center">
            <p className="text-sm text-muted-foreground text-center">
              Enter your PIN to confirm withdrawal of <span className="font-bold text-foreground">D {Number(withdrawAmount).toFixed(2)}</span>
            </p>
            <InputOTP maxLength={6} value={verifyPin} onChange={setVerifyPin}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPinVerifyOpen(false); setWithdrawOpen(true); }}>Back</Button>
            <Button onClick={handlePinVerifyAndSubmit} disabled={verifying || verifyPin.length < 4}>
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Withdrawal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
