import { describe, it, expect } from 'vitest';
import {
  CHART_GRID_STROKE,
  CHART_TICK_STROKE,
  CHART_TOOLTIP_STYLE,
  CHART_SERIES,
  PIE_COLORS_TOKENIZED,
} from '../chartPalette';

describe('chartPalette (tokenized, dark-mode safe)', () => {
  it('grid/tick/tooltip derive from CSS vars', () => {
    expect(CHART_GRID_STROKE).toContain('var(--border)');
    expect(CHART_TICK_STROKE).toContain('var(--muted-foreground)');
    expect(CHART_TOOLTIP_STYLE.background).toContain('var(--popover)');
    expect(CHART_TOOLTIP_STYLE.border).toContain('var(--border)');
  });

  it('series + pie use theme vars (no hardcoded hsl palette)', () => {
    const all = [...Object.values(CHART_SERIES), ...PIE_COLORS_TOKENIZED];
    expect(all.length).toBeGreaterThan(3);
    for (const c of all) {
      expect(c).toContain('var(--');
      expect(c).not.toContain('220, 70%');
      expect(c).not.toContain('145, 60%');
    }
  });
});
