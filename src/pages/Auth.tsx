import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowRight, MapPin, Receipt, Wallet } from 'lucide-react';

export default function Auth() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const asCustomer = params.get('as') === 'customer';
  const asWholesaler = params.get('as') === 'wholesaler';
  const next = params.get('next') || (asWholesaler ? '/wholesale' : asCustomer ? '/shop' : '/');
  const initialTab = params.get('tab') === 'signup' || ((asCustomer || asWholesaler) && params.get('tab') !== 'signin') ? 'signup' : 'signin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  if (user) return <Navigate to={next} replace />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
      toast.success('Signed in');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
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
      toast.error(err.message);
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
            <h2 className="font-display text-3xl tracking-tight">Welcome back.</h2>
          </div>

          <Tabs defaultValue={initialTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted/60">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <Field id="email-in" label="Email" type="email" value={email} onChange={setEmail} />
                <Field id="pass-in" label="Password" type="password" value={password} onChange={setPassword} />
                <Button type="submit" className="w-full group" size="lg" disabled={submitting}>
                  {submitting ? 'Signing in…' : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-4">
                <Field id="name-up" label="Full name" value={fullName} onChange={setFullName} />
                <Field id="email-up" label="Email" type="email" value={email} onChange={setEmail} />
                <Field id="pass-up" label="Password" type="password" value={password} onChange={setPassword} minLength={6} />
                <Button type="submit" className="w-full group" size="lg" disabled={submitting}>
                  {submitting ? 'Creating account…' : (
                    <>
                      Create Account
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
  id, label, type = 'text', value, onChange, minLength,
}: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; minLength?: number }) {
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
        className="h-11"
      />
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-sidebar-foreground/85">
      <span className="h-7 w-7 rounded-md bg-sidebar-accent flex items-center justify-center text-primary">
        {icon}
      </span>
      {label}
    </div>
  );
}
