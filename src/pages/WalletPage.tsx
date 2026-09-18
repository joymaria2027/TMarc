import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Wallet, ArrowDownToLine, History, KeyRound, ShieldCheck, Loader2, Bike, Store, ShieldCheck as ShieldIcon } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import WalletFolderCard, { WalletBalanceCard } from '@/components/wallet/WalletFolderCard';
import WithdrawalRequestsTable from '@/components/wallet/WithdrawalRequestsTable';
import TransactionHistoryTable from '@/components/wallet/TransactionHistoryTable';
import {
  rpcHasWithdrawalPin,
  rpcSetWithdrawalPin,
  rpcVerifyWithdrawalPin,
} from '@/lib/rpcTypes';
import type { HasWithdrawalPinResult } from '@/lib/rpcTypes';
import { validateWithdrawal } from '@/lib/finance';

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
  // TODO(data-layer): unify with WithdrawalRequestsTable's slimmer row —
  // the child's onApprove/onFinalize callbacks currently widen-narrow against
  // this fuller shape (app-tsc conflict at the table call site).
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
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Process dialog (merchant manager initial approval / accountant finalization)
  const [processOpen, setProcessOpen] = useState(false);
  const [processMode, setProcessMode] = useState<'approve' | 'finalize'>('approve');
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRow | null>(null);
  const [payoutMethod, setPayoutMethod] = useState('');
  const [payoutRef, setPayoutRef] = useState('');
  const [bankName, setBankName] = useState('');
  const [processing, setProcessing] = useState(false);

  // PIN state
  const [hasPin, setHasPin] = useState<HasWithdrawalPinResult | null>(null);
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
    const { data: pinData } = await rpcHasWithdrawalPin();
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
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => load(), 600);
    };
    const ch = supabase.channel('wallet-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, () => scheduleReload())
      .subscribe();
    return () => { if (reloadTimer) clearTimeout(reloadTimer); supabase.removeChannel(ch); };
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
    const { error } = await rpcSetWithdrawalPin(newPin);
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
    if (!selectedWallet) return;
    const amountError = validateWithdrawal(withdrawAmount, Number(selectedWallet.balance));
    if (amountError) { setWithdrawError(amountError); return; }
    setWithdrawError(null);
    // Open PIN verification
    setWithdrawOpen(false);
    setPinVerifyOpen(true);
  };

  // Verify PIN and submit withdrawal
  const handlePinVerifyAndSubmit = async () => {
    if (verifyPin.length < 4) { toast.error('Enter your PIN'); return; }
    setVerifying(true);
    const { data: valid, error: verifyError } = await rpcVerifyWithdrawalPin(verifyPin);
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

  // Withdrawal status rendering lives in WithdrawalRequestsTable (token-only badges + icons).

  if (loading) return (
    <div className="space-y-4" role="status" aria-label="Loading wallets" aria-busy="true">
      {[0, 1, 2].map(i => (
        <div key={i} className="shimmer h-28 rounded-md" aria-hidden="true" />
      ))}
      <span className="sr-only">Loading wallets…</span>
    </div>
  );

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
        const groups = new Map<string, WalletRow[]>();
        myWallets.forEach(w => {
          const key = (w.party_type === 'rider' || w.party_type === 'merchant')
            ? `${w.party_type}:${w.party_id}`
            : `${w.party_type}:${w.id}`;
          const arr = groups.get(key) || [];
          arr.push(w);
          groups.set(key, arr);
        });

        const canOwn = (w: WalletRow) => w.user_id === user?.id || isAdmin;

        const buckets: { id: string; label: string; icon: JSX.Element; entries: [string, WalletRow[]][] }[] = [
          { id: 'riders', label: 'Riders', icon: <Bike className="h-4 w-4" aria-hidden="true" />, entries: [] },
          { id: 'merchants', label: 'Merchants', icon: <Store className="h-4 w-4" aria-hidden="true" />, entries: [] },
          { id: 'admin', label: 'Admin / Platform', icon: <ShieldIcon className="h-4 w-4" aria-hidden="true" />, entries: [] },
        ];
        Array.from(groups.entries()).forEach(([k, ws]) => {
          const t = ws[0].party_type;
          if (t === 'rider') buckets[0].entries.push([k, ws]);
          else if (t === 'merchant') buckets[1].entries.push([k, ws]);
          else buckets[2].entries.push([k, ws]);
        });

        const nonEmpty = buckets.filter(b => b.entries.length > 0);
        const useFolders = nonEmpty.length > 1 || myWallets.length > 3;

        if (myWallets.length === 0) {
          return <Card><CardContent className="py-10 text-center text-muted-foreground">No wallets found. Wallets are created automatically when settlements are approved.</CardContent></Card>;
        }

        if (!useFolders) {
          return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(groups.entries()).map(([k, ws]) => (
                <WalletBalanceCard
                  key={k}
                  walletKey={k}
                  wallets={ws}
                  transactions={transactions}
                  partyNames={partyNames}
                  getPartyLabel={getPartyLabel}
                  canOwn={canOwn}
                  onWithdraw={initiateWithdraw}
                />
              ))}
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {nonEmpty.map(b => (
              <WalletFolderCard
                key={b.id}
                bucket={b}
                transactions={transactions}
                partyNames={partyNames}
                getPartyLabel={getPartyLabel}
                canOwn={canOwn}
                onWithdraw={initiateWithdraw}
                search={folderSearch[b.id] || ''}
                onSearchChange={(bucketId, value) => setFolderSearch(prev => ({ ...prev, [bucketId]: value }))}
              />
            ))}
          </div>
        );
      })()}
        </TabsContent>

        <TabsContent value="withdrawals" className="space-y-4 mt-0">
          <WithdrawalRequestsTable
            withdrawals={withdrawals}
            wallets={wallets}
            getPartyLabel={getPartyLabel}
            canProcess={canProcess}
            canApprove={canApprove}
            canFinalize={canFinalize}
            search={withdrawSearch}
            onSearchChange={(v) => { setWithdrawSearch(v); setWithdrawPage(1); }}
            statusFilter={withdrawStatusFilter}
            onStatusFilterChange={(v) => { setWithdrawStatusFilter(v); setWithdrawPage(1); }}
            page={withdrawPage}
            onPageChange={setWithdrawPage}
            onApprove={(wr) => { setSelectedRequest(wr); setProcessMode('approve'); setProcessOpen(true); }}
            onFinalize={(wr) => { setSelectedRequest(wr); setProcessMode('finalize'); setProcessOpen(true); }}
            pageSize={WITHDRAW_PAGE_SIZE}
          />
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4 mt-0">
          <TransactionHistoryTable
            transactions={transactions}
            wallets={wallets}
            myWallets={myWallets}
            getPartyLabel={getPartyLabel}
            filter={txFilter}
            onFilterChange={(v) => { setTxFilter(v); setTxPage(1); }}
            search={txSearch}
            onSearchChange={(v) => { setTxSearch(v); setTxPage(1); }}
            page={txPage}
            onPageChange={setTxPage}
            pageSize={TX_PAGE_SIZE}
          />
        </TabsContent>
      </Tabs>


      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Withdrawal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Wallet</p>
              <p className="text-sm font-medium">{selectedWallet ? getPartyLabel(selectedWallet) : ''}</p>
              <p className="text-xs text-muted-foreground">Available: D {selectedWallet ? Number(selectedWallet.balance).toFixed(2) : '0.00'}</p>
            </div>
            <div>
              <Label htmlFor="withdraw-amount">Amount</Label>
              <div className="flex gap-2">
                <Input id="withdraw-amount" type="number" min="0" max={selectedWallet?.balance} value={withdrawAmount} onChange={e => { setWithdrawAmount(e.target.value); setWithdrawError(null); }} placeholder="0.00" className="flex-1" aria-invalid={!!withdrawError} aria-describedby={withdrawError ? 'withdraw-amount-error' : undefined} />
                <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={(selectedWallet?.balance ?? 0) <= 0} onClick={() => { setWithdrawAmount(String(selectedWallet?.balance ?? 0)); setWithdrawError(null); }}>
                  Withdraw All
                </Button>
              </div>
              {withdrawError && <p id="withdraw-amount-error" role="alert" className="text-sm text-destructive mt-1">{withdrawError}</p>}
            </div>
            <div>
              <Label htmlFor="withdraw-notes">Notes (optional)</Label>
              <Textarea id="withdraw-notes" value={withdrawNotes} onChange={e => setWithdrawNotes(e.target.value)} placeholder="Any notes for the accountant..." />
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
                  ? 'After your approval, the request will be sent to the accountant for final approval. The wallet will only be debited after final approval.'
                  : 'Final approval will debit the wallet balance immediately and record the transaction.'}
              </p>
            </div>
            {processMode === 'finalize' && (
              <>
                <div>
                  <Label htmlFor="payout-method">Payout Method</Label>
                  <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                    <SelectTrigger id="payout-method"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {PAYOUT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {payoutMethod === 'Bank Transfer' && (
                  <div>
                    <Label htmlFor="bank-name">Bank Name</Label>
                    <Input id="bank-name" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Sierra Leone Commercial Bank" />
                  </div>
                )}
                <div>
                  <Label htmlFor="payout-ref">Payout Reference (optional)</Label>
                  <Input id="payout-ref" value={payoutRef} onChange={e => setPayoutRef(e.target.value)} placeholder="Transaction ID or reference" />
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
