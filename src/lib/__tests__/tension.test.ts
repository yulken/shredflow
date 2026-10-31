import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as tension from '@/lib/tension';
import { tensionColor, tensionLabel } from '@/lib/tension';
import { setLang, t } from '@/lib/i18n';

// Scope: the level->label/color mapping, and the schema that bounds it.
// There is no tier machinery any more: `tension_level` is stored as the level,
// so the helpers index by the number itself and the CHECK constraint is the
// only guard. Tier bounds are asserted as numbers in the migration text, the
// colors as literals (Tailwind class names are UI chrome: they stay out of the
// dictionaries, so they are the same in every locale and safe to pin). The
// label is asserted as key selection - in EN against `en.ts`, the reviewed
// reference dictionary, and in PT/ES only against what `t()` itself answers
// for the same key (the rule this test file follows: a test may state wording
// against EN, structure against the other two). The `[1, 2, 3]` selector and
// the tier-bar markup stay in the component.

describe('tensionLabel()', () => {
  test('in EN the three levels read the three dictionary keys, wording asserted', () => {
    // EN is the reviewed reference dictionary, so its wording is assertable;
    // `en.ts` says Low/Medium/High for the level keys.
    setLang('en');
    expect(tensionLabel(1)).toBe('Low');
    expect(tensionLabel(2)).toBe('Medium');
    expect(tensionLabel(3)).toBe('High');
  });

  test('in PT and ES the label is asserted as key selection, never as Spanish or Portuguese', () => {
    // tensionLabel(1) reads the same dictionary entry as t('tension_low'):
    // which key was picked is pinned, what the word is, nothing. Both sides
    // move together across any rewrite of the provisional pt.ts/es.ts content;
    // no word from either dictionary is quoted.
    for (const code of ['pt', 'es']) {
      setLang(code);
      expect(tensionLabel(1)).toBe(t('tension_low'));
      expect(tensionLabel(2)).toBe(t('tension_medium'));
      expect(tensionLabel(3)).toBe(t('tension_high'));
    }
    setLang('en');
  });

  test('each level answers differently: nothing collapses levels together', () => {
    // The old tier machinery made one label serve a whole band of stored
    // values. With 1-3 stored as-is, adjacent levels must differ.
    setLang('en');
    const labels = [1, 2, 3].map(tensionLabel);
    expect(new Set(labels).size).toBe(3);
    setLang('es');
    expect(tensionLabel(1)).not.toBe(tensionLabel(2));
    expect(tensionLabel(2)).not.toBe(tensionLabel(3));
    setLang('en');
  });
});

describe('tensionColor()', () => {
  test('one Tailwind class per level, in level order', () => {
    expect(tensionColor(1)).toBe('text-accent-500');
    expect(tensionColor(2)).toBe('text-amber-500');
    expect(tensionColor(3)).toBe('text-brand-500');
  });

  test('distinct levels get distinct classes', () => {
    expect(tensionColor(1)).not.toBe(tensionColor(2));
    expect(tensionColor(2)).not.toBe(tensionColor(3));
  });
});

describe('the module carries no normalization', () => {
  const helper = readFileSync(
    fileURLToPath(new URL('../tension.ts', import.meta.url)),
    'utf8',
  );

  test('the tier helper is gone, not just unused', () => {
    // Cast to a plain record: the module type no longer declares the symbol, so
    // reading it off the namespace would be a compile-time error, not a check.
    const exports: Record<string, unknown> = tension;
    expect(exports.tensionTier).toBeUndefined();
    expect(/tensionTier/.test(helper)).toBe(false);
  });

  test('both helpers index by the level itself', () => {
    expect(/LABEL_KEYS\[level - 1\]/.test(helper)).toBe(true);
    expect(/TEXT_COLORS\[level - 1\]/.test(helper)).toBe(true);
  });
});

describe('the schema that bounds tension_level', () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL(
        '../../../supabase/migrations/20261026230024_create_guitar_practice_tables.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );

  test('the CHECK admits exactly 1..3', () => {
    expect(/tension_level >= 1 AND tension_level <= 3/.test(sql)).toBe(true);
    expect(/tension_level <= 10/.test(sql)).toBe(false);
  });

  test('the column default sits inside the range it checks', () => {
    // A default outside the CHECK would make every insert that omits the
    // column fail, so the two numbers have to agree.
    expect(/tension_level integer NOT NULL DEFAULT 2/.test(sql)).toBe(true);
  });
});
