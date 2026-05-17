-- ============================================================================
-- SavoryShelf — One-time cleanup: drop redundant RLS policies on `recipes`
-- ============================================================================
-- Background
-- ----------
-- Earlier migrations left the `recipes` table with two overlapping sets of
-- RLS policies. PostgreSQL combines permissive policies with OR, so the
-- effective access behaviour has always matched the canonical set documented
-- in docs/security-contracts.md — but the duplicates made `pg_policies`
-- noisy to audit and risked future confusion.
--
-- This migration drops the 5 redundant policies, leaving only the 4 policies
-- documented in docs/security-contracts.md. No effective access behaviour
-- changes; SELECT, INSERT, UPDATE, and DELETE outcomes are byte-for-byte
-- identical before and after.
--
-- Verified safe by comparing each dropped policy against its canonical
-- counterpart:
--   • "Anyone can view public recipes"  ⊂  "Users can only see their own recipes"
--                                          (subsumed by the `OR is_public = true` clause)
--   • "select own"                      ⊂  "Users can only see their own recipes"
--                                          (subsumed by the `auth.uid() = user_id` clause)
--   • "insert own"                      ≡  "Users can only insert their own recipes"
--   • "update own"                      ≡  "Users can only update their own recipes"
--                                          (NULL with_check defaults to the USING expr in PG)
--   • "delete own"                      ≡  "Users can only delete their own recipes"
--
-- Idempotent — DROP IF EXISTS makes this safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view public recipes" ON public.recipes;
DROP POLICY IF EXISTS "select own"                     ON public.recipes;
DROP POLICY IF EXISTS "insert own"                     ON public.recipes;
DROP POLICY IF EXISTS "update own"                     ON public.recipes;
DROP POLICY IF EXISTS "delete own"                     ON public.recipes;

-- ============================================================================
-- Verification — run this after the DROPs and confirm exactly 4 rows return:
-- ============================================================================
--
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'recipes'
-- ORDER BY cmd, policyname;
--
-- Expected output (4 rows):
--
--   policyname                                | cmd    | qual                                           | with_check
--   ------------------------------------------+--------+------------------------------------------------+------------------------
--   Users can only delete their own recipes   | DELETE | (auth.uid() = user_id)                         | NULL
--   Users can only insert their own recipes   | INSERT | NULL                                           | (auth.uid() = user_id)
--   Users can only see their own recipes      | SELECT | ((auth.uid() = user_id) OR (is_public = true)) | NULL
--   Users can only update their own recipes   | UPDATE | (auth.uid() = user_id)                         | (auth.uid() = user_id)
--
-- This matches docs/security-contracts.md exactly.
