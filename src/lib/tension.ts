import { t } from './i18n';

// The DB stores `tension_level` as an integer 1-10 (see ADR-0005); the three named
// levels and the tier bar are derived from that number at read time, never stored.
// These live in `src/lib` rather than in `SessionView` so they can be exercised
// without a DOM (ADR-0009).

export function tensionTier(level: number): number {
  if (level <= 3) return 1;
  if (level <= 6) return 2;
  return 3;
}

// Tier 1 is the loose end of the scale, tier 3 the tight end.
const LABEL_KEYS = ['tension_low', 'tension_medium', 'tension_high'];
const TEXT_COLORS = ['text-accent-500', 'text-amber-500', 'text-brand-500'];

export function tensionLabel(level: number): string {
  return t(LABEL_KEYS[tensionTier(level) - 1]);
}

export function tensionColor(level: number): string {
  return TEXT_COLORS[tensionTier(level) - 1];
}
