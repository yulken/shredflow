import { t } from './i18n';

// Labels and colors read straight from `tension_level`: the schema's CHECK keeps it
// in 1-3, so there is no tier machinery and no normalization of another scale.
// Level 1 is the loose end of the scale, level 3 the tight end.
const LABEL_KEYS = ['tension_low', 'tension_medium', 'tension_high'];
const TEXT_COLORS = ['text-accent-500', 'text-amber-500', 'text-brand-500'];

export function tensionLabel(level: number): string {
  return t(LABEL_KEYS[level - 1]);
}

export function tensionColor(level: number): string {
  return TEXT_COLORS[level - 1];
}
