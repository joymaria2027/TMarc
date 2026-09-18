import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowRight, KeyRound, MapPin, Receipt, Wallet } from 'lucide-react';
import { validateAuthField, getEmailAutocomplete, getPasswordAutocomplete } from './auth.helpers';

export default function Auth({ resetMode = false }: { resetMode?: boolean }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const asCustomer = params.get('as') === 'customer';
  const asWholesaler = params.get('as') === 'wholesaler';
  const next = params.get('next') || (asWholesaler ? '/wholesale' : asCustomer ? '/shop' : '/');
  const initialTab = params.get('tab') === 'signup' || ((asCustomer || asWholesaler) && params.get('tab') !== 'signin') ? 'signup' : 'signin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [showReset, setShowReset] = useState(resetMode);
  const [resetSent, setResetSent] = useState(false);
  const { signIn, signUp } = useAuth();

  // A Supabase recovery link lands back on /auth with type=recovery and an active
  // session; show the set-new-password form instead of bouncing to the app.
  const isRecovery =
    window.location.hash.includes('type=recovery') ||
    window.location.search.includes('type=recovery');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div role="status" aria-label="Loading sign-in page" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  if (user && !isRecovery) return <Navigate to={next} replace />;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwErr = validateAuthField('password', newPassword, 'signup');
    const confirmErr = newPassword !== confirmPassword ? 'Passwords do not match.' : null;
    setFieldErrors((p) => ({ ...p, 'pass-new': pwErr, 'pass-confirm': confirmErr }));
    if (pwErr || confirmErr) return;
    setResetting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated — you are signed in.');
      navigate(next, { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update the password.');
    } finally {
      setResetting(false);
    }
  };

  const validateSignIn = () => {
    const errs: Record<string, string | null> = {
      'email-in': validateAuthField('email', email, 'signin'),
      'pass-in': validateAuthField('password', password, 'signin'),
    };
    setFieldErrors((p) => ({ ...p, ...errs }));
    return !errs['email-in'] && !errs['pass-in'];
  };

  const validateSignUp = () => {
    const errs: Record<string, string | null> = {
      'name-up': validateAuthField('fullName', fullName, 'signup'),
      'email-up': validateAuthField('email', email, 'signup'),
      'pass-up': validateAuthField('password', password, 'signup'),
    };
    setFieldErrors((p) => ({ ...p, ...errs }));
    return !errs['name-up'] && !errs['email-up'] && !errs['pass-up'];
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignIn()) {
      toast.error('Please fix the highlighted fields.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email, password);
      toast.success('Signed in');
    } catch (err: any) {
      const msg = err?.message ?? 'Sign-in failed.';
      setFieldErrors((p) => ({ ...p, 'pass-in': msg }));
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignUp()) {
      toast.error('Please fix the highlighted fields.');
      return;
    }
    setSubmitting(true);
    try {
      await signUp(email, password, fullName);
      // If signing up as a customer, assign the customer role
      if (asCustomer) {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) await supabase.rpc('self_assign_customer_role' as any);
      }
      toast.success('Account created. Check your email to verify.');
    } catch (err: any) {
      const msg = err?.message ?? 'Sign-up failed.';
      setFieldErrors((p) => ({ ...p, 'email-up': msg }));
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Password recovery: sends a Supabase reset email that redirects back to /auth.
  const handleReset = async () => {
    const emailErr = validateAuthField('email', email, 'signin');
    if (emailErr) {
      setFieldErrors((p) => ({ ...p, 'email-in': emailErr }));
      toast.error('Enter your email above first.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(next)}`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success('Reset link sent — check your email.');
    } catch (err: any) {
      const msg = err?.message ?? 'Could not send the reset email.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Editorial left panel */}
      <aside className="relative hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center">
            <span className="font-display text-xl text-primary-foreground leading-none">D</span>
          </div>
          <span className="font-display text-2xl">DeliveryAce</span>
        </div>

        <div className="relative z-10 space-y-8 max-w-lg">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-sidebar-foreground/60">
            Operations platform / v3
          </p>
          <h1 className="font-display text-5xl xl:text-6xl leading-[1.05] tracking-tight">
            Every kilometre, every dalasi, accounted for.
          </h1>
          <p className="text-base text-sidebar-foreground/75 leading-relaxed max-w-md">
            GPS tracking, settlement, and revenue sharing for merchant delivery operations
            in The Gambia. Built for riders, managers, and the back office.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-6 max-w-lg">
          <Feature icon={<MapPin className="h-4 w-4" />} label="Live GPS" />
          <Feature icon={<Receipt className="h-4 w-4" />} label="Settlements" />
          <Feature icon={<Wallet className="h-4 w-4" />} label="Wallets" />
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <span className="font-display text-lg text-primary-foreground leading-none">D</span>
            </div>
            <span className="font-display text-xl">DeliveryAce</span>
          </div>

          <div className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Sign in to continue
            </p>
            <h2 className="font-display text-2xl sm:text-3xl tracking-tight">Welcome back.</h2>
          </div>

          <Tabs defaultValue={initialTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted/60">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6">
              <form onSubmit={handleSignIn} className="space-y-4" noValidate>
                <Field
                  id="email-in"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(v) => {
                    setEmail(v);
                    setFieldErrors((p) => ({ ...p, 'email-in': null }));
                  }}
                  autoComplete={getEmailAutocomplete()}
                  error={fieldErrors['email-in']}
                />
                <Field
                  id="pass-in"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    setFieldErrors((p) => ({ ...p, 'pass-in': null }));
                  }}
                  autoComplete={getPasswordAutocomplete('signin')}
                  error={fieldErrors['pass-in']}
                />
                <Button type="submit" className="w-full group" size="lg" disabled={submitting}>
                  {submitting ? 'Signing in…' : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </>
                  )}
                </Button>
                {showReset ? (
                  resetSent ? (
                    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                      If an account exists for {email}, a reset link is on its way. It can take a
                      few minutes to arrive — check your spam folder if it's not there.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        We'll email a sign-in reset link to the address above.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={submitting}
                        onClick={handleReset}
                      >
                        {submitting ? 'Sending…' : 'Send reset link'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setShowReset(false)}
                        className="w-full min-h-[44px] text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowReset(true)}
                    className="mx-auto flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    Forgot password?
                  </button>
                )}
              </form>
            </TabsContent>

            {isRecovery && (
              <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
                <h3 className="font-display text-lg">Set a new password</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a new password for your account.
                </p>
                <form onSubmit={handleUpdatePassword} className="mt-4 space-y-4" noValidate>
                  <Field
                    id="pass-new"
                    label="New password"
                    type="password"
                    value={newPassword}
                    onChange={(v) => {
                      setNewPassword(v);
                      setFieldErrors((p) => ({ ...p, 'pass-new': null }));
                    }}
                    autoComplete="new-password"
                    error={fieldErrors['pass-new']}
                  />
                  <Field
                    id="pass-confirm"
                    label="Confirm new password"
                    type="password"
                    value={confirmPassword}
                    onChange={(v) => {
                      setConfirmPassword(v);
                      setFieldErrors((p) => ({ ...p, 'pass-confirm': null }));
                    }}
                    autoComplete="new-password"
                    error={fieldErrors['pass-confirm']}
                  />
                  <Button type="submit" className="w-full" size="lg" disabled={resetting}>
                    {resetting ? 'Updating…' : 'Update password'}
                  </Button>
                </form>
              </div>
            )}

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-4" noValidate>
                <Field
                  id="name-up"
                  label="Full name"
                  value={fullName}
                  onChange={(v) => {
                    setFullName(v);
                    setFieldErrors((p) => ({ ...p, 'name-up': null }));
                  }}
                  autoComplete="name"
                  error={fieldErrors['name-up']}
                />
                <Field
                  id="email-up"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(v) => {
                    setEmail(v);
                    setFieldErrors((p) => ({ ...p, 'email-up': null }));
                  }}
                  autoComplete={getEmailAutocomplete()}
                  error={fieldErrors['email-up']}
                />
                <Field
                  id="pass-up"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    setFieldErrors((p) => ({ ...p, 'pass-up': null }));
                  }}
                  minLength={6}
                  autoComplete={getPasswordAutocomplete('signup')}
                  error={fieldErrors['pass-up']}
                />
                <Button type="submit" className="w-full group" size="lg" disabled={submitting}>
                  {submitting ? 'Creating account…' : (
                    <>
                      Create Account
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground pt-2">
                  By creating an account you agree to verify your email before signing in.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function Field({
  id, label, type = 'text', value, onChange, minLength, autoComplete, error,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
  autoComplete?: string;
  error?: string | null;
}) {
  const messageId = `${id}-message`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? messageId : undefined}
        className="h-11"
      />
      {error && (
        <p id={messageId} role="alert" aria-live="polite" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-sidebar-foreground/85">
      <span aria-hidden="true" className="h-7 w-7 rounded-md bg-sidebar-accent flex items-center justify-center text-primary">
        {icon}
      </span>
      {label}
    </div>
  );
}
