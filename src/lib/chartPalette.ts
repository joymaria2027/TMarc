// Tokenized chart palette — dark-mode safe via CSS vars.
// Mirror of MerchantManagerDashboard:176-179 pattern. All dashboards must import
// from here instead of hardcoding hsl() hues.

export const CHART_GRID_STROKE = 'hsl(var(--border))';
export const CHART_TICK_STROKE = 'hsl(var(--muted-foreground))';
export const CHART_TOOLTIP_STYLE: Record<string, string> = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
};

export const CHART_SERIES = {
  primary: 'hsl(var(--primary))',
  accent: 'hsl(var(--accent))',
  info: 'hsl(var(--info))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
  success: 'hsl(var(--success))',
} as const;

export const PIE_COLORS_TOKENIZED = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--info))',
  'hsl(var(--success))',
];
