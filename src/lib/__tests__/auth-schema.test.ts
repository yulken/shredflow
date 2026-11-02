import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth';

// Scope: the schema sign-in leans on, read off disk like `bpm.test.ts` and
// `tension.test.ts` read theirs - an owner column or a policy silently changed in
// SQL would otherwise reach the screen as data nobody can see or a row anyone can
// write. The claims are counts and clauses, never SQL wording prose.

const migration = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/20261102150000_add_user_ownership.sql', import.meta.url)),
  'utf8',
);
// The two comment forms are prose, and they name the very clauses asserted below
// (`SET NOT NULL`, `SECURITY DEFINER`), so the claims are made over the statements.
const sql = migration.replace(/^\/\*[\s\S]*?\*\//, '').replace(/--[^\n]*/g, '');
const config = readFileSync(fileURLToPath(new URL('../../../supabase/config.toml', import.meta.url)), 'utf8');
const typesSource = readFileSync(fileURLToPath(new URL('../supabase.ts', import.meta.url)), 'utf8');
const hookSource = readFileSync(fileURLToPath(new URL('../../hooks/useAuth.ts', import.meta.url)), 'utf8');

describe('the owner column', () => {
  test('both tables gain user_id pointing at Auth, and rows die with the account', () => {
    expect(sql.match(/ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth\.users\(id\) ON DELETE CASCADE/g)).toHaveLength(2);
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_exercises_user_id ON exercises(user_id);');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_id ON practice_sessions(user_id);');
  });

  // NULL is the pre-auth log: `SET NOT NULL` here would discard rows the claim has
  // not moved yet, which is the whole point of section 3 of the migration.
  test('the column stays nullable, so the legacy log survives the upgrade', () => {
    expect(sql).not.toMatch(/SET NOT NULL/);
    expect(typesSource.match(/user_id: string \| null;/g)).toHaveLength(2);
  });
});

describe('who reaches the tables', () => {
  test('the eight anonymous policies are gone and eight owner policies replace them', () => {
    expect(sql.match(/DROP POLICY IF EXISTS "anon_/g)).toHaveLength(8);
    // The replacements are dropped too: the file must re-run without failing on
    // "policy already exists".
    expect(sql.match(/DROP POLICY IF EXISTS "owner_/g)).toHaveLength(8);
    expect(sql.match(/CREATE POLICY "owner_/g)).toHaveLength(8);
    expect(sql.match(/TO authenticated (USING|WITH CHECK)/g)).toHaveLength(8);
    expect(sql).not.toMatch(/CREATE POLICY.*TO anon/);
  });

  test('writes are keyed on the caller, reads also carry the ownerless rows', () => {
    expect(sql.match(/WITH CHECK \(auth\.uid\(\) = user_id\)/g)).toHaveLength(4);
    expect(sql.match(/USING \(auth\.uid\(\) = user_id\)/g)).toHaveLength(4);
    // SELECT alone keeps NULL: it is what shows the inherited log before the claim.
    expect(sql.match(/USING \(user_id IS NULL OR auth\.uid\(\) = user_id\)/g)).toHaveLength(2);
  });

  test('the owner of an insert is stamped by the database, not sent by the client', () => {
    // The app never sends `user_id`; a BEFORE INSERT trigger fills it from the
    // JWT, so a signed-in write passes WITH CHECK and a caller cannot stamp
    // another account as owner. Outside a request the row stays NULL for the
    // claim to move later.
    expect(sql).toContain('NEW.user_id := auth.uid();');
    expect(sql.match(/CREATE TRIGGER stamp_owner_/g)).toHaveLength(2);
    expect(sql.match(/BEFORE INSERT ON (exercises|practice_sessions)/g)).toHaveLength(2);
    expect(sql.match(/DROP TRIGGER IF EXISTS stamp_owner_/g)).toHaveLength(2);
    expect(sql).toContain('DROP FUNCTION IF EXISTS stamp_owner();');
  });

  test('anon is revoked on both tables and cannot call the claim', () => {
    expect(sql).toContain('REVOKE SELECT, INSERT, UPDATE, DELETE ON exercises FROM anon;');
    expect(sql).toContain('REVOKE SELECT, INSERT, UPDATE, DELETE ON practice_sessions FROM anon;');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION claim_legacy_rows() FROM anon;');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON exercises TO authenticated;');
  });

  // The Real BPM trigger must keep running as the caller, so its UPDATE of an
  // exercise is filtered by RLS: one DEFINER function in this file, the claim.
  test('only the claim runs as the table owner', () => {
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(1);
    expect(sql).toContain('IF auth.uid() IS NULL THEN');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION claim_legacy_rows() TO authenticated;');
  });
});

describe('the password bound is one number', () => {
  test('the hint follows config.toml rather than a copy of it', () => {
    const configured = Number(config.match(/^minimum_password_length = (\d+)$/m)![1]);
    expect(MIN_PASSWORD_LENGTH).toBe(configured);
  });
});

describe('the claim runs once per account', () => {
  test('it is awaited before the app is let in, and resets on sign-out', () => {
    expect(hookSource).toContain('await claimLegacyRows();');
    expect(hookSource).toContain('if (next && !claimed)');
    expect(hookSource).toContain('if (next === null) claimed = false;');
    // The app views fetch on mount, so the claim has to settle before `ready`.
    expect(hookSource.indexOf('await claimLegacyRows()')).toBeLessThan(hookSource.indexOf('setReady(true)'));
  });

  test('a null first event is not answered before the stored session is read back', () => {
    expect(hookSource).toContain('if (next === null && !restored) return;');
  });
});
