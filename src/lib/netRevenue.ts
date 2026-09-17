// Mirror of credit_wallets_on_settlement net-income math for testability.
// Keep in sync with supabase/migrations/*_settlement_net_revenue*.sql

export interface NetRevenueInputs {
  tariff: number;
  ratePerMile: number;
  miles: { startOdo?: number | null; endOdo?: number | null; actualKm?: number | null; estimatedKm?: number | null };
  prepaidFuelRemaining: number; // sum of (amount - consumed) across approved fuel rows
  amortizedSlicesTotal: number; // sum of slice = amount/amortize_over per amortized row this delivery
  immediateOtherExpenses: number; // sum of non-fuel non-amortized approved expenses pending deduction
}

export function resolveMiles(m: NetRevenueInputs['miles']): number {
  if (m.startOdo != null && m.endOdo != null && m.endOdo >= m.startOdo) return m.endOdo - m.startOdo;
  if (m.actualKm != null) return m.actualKm * 0.621371;
  if (m.estimatedKm != null) return m.estimatedKm * 0.621371;
  return 0;
}

export function computeNetIncome(i: NetRevenueInputs) {
  const miles = resolveMiles(i.miles);
  const fuelCost = Math.round(miles * i.ratePerMile * 100) / 100;
  const prepaidUsed = Math.min(i.prepaidFuelRemaining, fuelCost);
  const netIncome = Math.max(i.tariff - fuelCost - i.amortizedSlicesTotal - i.immediateOtherExpenses, 0);
  return { miles, fuelCost, prepaidUsed, amortized: i.amortizedSlicesTotal, immediate: i.immediateOtherExpenses, netIncome };
}

export function amortizedSlice(amount: number, amortizeOver: number, alreadyConsumed: number): number {
  const slice = Math.round((amount / amortizeOver) * 100) / 100;
  return Math.min(slice, Math.max(amount - alreadyConsumed, 0));
}
