import { describe, expect, test } from 'vitest';
import { tensionColor, tensionLabel, tensionTier } from '@/lib/tension';
import { setLang, t } from '@/lib/i18n';

// Scope: the tier machinery ADR-0005 defined and ADR-0009 moved to `src/lib`.
// Tier bounds are asserted as numbers (ADR-0005's `<= 3` and `<= 6`), the
// colors as literals (Tailwind class names are UI chrome: ADR-0006 keeps them
// out of the dictionaries, so they are the same in every locale and safe to
// pin). The label is asserted as key selection - in EN against
// `en.ts`, the reviewed reference dictionary, and in PT/ES only against what
// `t()` itself answers for the same key (ADR-0009's rule: a test may state
// wording against EN, structure against the other two). The `[1, 5, 10]`
// selector and the tier-bar markup stay in the component per ADR-0009.

describe('tensionTier()', () => {
  test('ADR-0005 boundaries: level <= 3 is tier 1, level <= 6 is tier 2', () => {
    expect(tensionTier(1)).toBe(1);
    expect(tensionTier(2)).toBe(1);
    expect(tensionTier(3)).toBe(1);
    expect(tensionTier(4)).toBe(2);
    expect(tensionTier(5)).toBe(2);
    expect(tensionTier(6)).toBe(2);
  });

  test('the rest of the stored 1-10 range is tier 3', () => {
    expect(tensionTier(7)).toBe(3);
    expect(tensionTier(8)).toBe(3);
    expect(tensionTier(9)).toBe(3);
    expect(tensionTier(10)).toBe(3);
  });

  test('the tier is a total function: out-of-scale levels collapse, they do not throw', () => {
    // The DB stores 1-10, so these are the helper's defensive side rather than
    // reachable data: the tier stays at the end of the scale it belongs to,
    // which is what lets `TEXT_COLORS[tier - 1]` never read out of bounds.
    expect(tensionTier(0)).toBe(1);
    expect(tensionTier(11)).toBe(3);
  });
});

describe('tensionColor()', () => {
  test('one Tailwind class per tier, in ADR-0005 recorded order', () => {
    expect(tensionColor(1)).toBe('text-accent-500');
    expect(tensionColor(6)).toBe('text-amber-500');
    expect(tensionColor(10)).toBe('text-brand-500');
  });

  test('the tier bar is a function of the tier: equal tiers, equal colors', () => {
    expect(tensionColor(4)).toBe(tensionColor(6));
    expect(tensionColor(2)).not.toBe(tensionColor(4));
    expect(tensionColor(6)).not.toBe(tensionColor(7));
  });
});

describe('tensionLabel()', () => {
  test('in EN the three tiers read the three dictionary keys, wording asserted', () => {
    // EN is the reviewed reference dictionary, so its wording is assertable
    // (ADR-0009 rule 1); `en.ts` says Low/Medium/High for the tier keys.
    setLang('en');
    expect(tensionLabel(2)).toBe('Low');
    expect(tensionLabel(5)).toBe('Medium');
    expect(tensionLabel(9)).toBe('High');
  });

  test('in PT and ES the label is asserted as key selection, never as Spanish or Portuguese', () => {
    // tensionLabel(1) reads the same dictionary entry as t('tension_low'):
    // which key was picked is pinned, what the word is, nothing. Both sides
    // move together across any rewrite of the provisional pt.ts/es.ts content that
    // ADR-0008 rule 3 promises; no word from either dictionary is quoted.
    for (const code of ['pt', 'es']) {
      setLang(code);
      expect(tensionLabel(1)).toBe(t('tension_low'));
      expect(tensionLabel(5)).toBe(t('tension_medium'));
      expect(tensionLabel(9)).toBe(t('tension_high'));
    }
  });

  test('labels are tier-collapsed, so one label serves a whole tier', () => {
    setLang('es');
    expect(tensionLabel(2)).toBe(tensionLabel(3));
    expect(tensionLabel(4)).toBe(tensionLabel(6));
    expect(tensionLabel(7)).toBe(tensionLabel(10));
    setLang('en');
  });
});
