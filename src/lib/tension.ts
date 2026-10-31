import { t } from './i18n';

// `tension_level` is stored as the level itself - the schema's CHECK keeps it in
// 1-3 - so the label and the color are read straight from the number. There is no
// tier machinery and no normalization of any other scale: the CHECK is the guard.
// These live in `src/lib` rather than in `SessionView` so they can be
// exercised without a DOM.

// Level 1 is the loose end of the scale, level 3 the tight end.
const LABEL_KEYS = ['tension_low', 'tension_medium', 'tension_high'];
const TEXT_COLORS = ['text-accent-500', 'text-amber-500', 'text-brand-500'];

export function tensionLabel(level: number): string {
  return t(LABEL_KEYS[level - 1]);
}

export function tensionColor(level: number): string {
  return TEXT_COLORS[level - 1];
}
