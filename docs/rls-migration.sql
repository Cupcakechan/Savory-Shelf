-- SavoryShelf — RLS recovery migration
--
-- This file is the single executable source of truth for the row-level
-- security state documented in docs/security-contracts.md. Run it in
-- Supabase SQL Editor any time the contract verification queries flag
-- a missing or drifted policy:
--
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--   WHERE schemaname = 'public' ORDER BY tablename, cmd;
--
-- The script is fully idempotent — every policy is dropped (IF EXISTS)
-- before being recreated, so re-running it is always safe.
--
-- NOT covered here (configured elsewhere):
--   • Bucket-level config for `recipe-images` (visibility, allowed MIMEs,
--     max file size) — set in Supabase Dashboard → Storage. See the
--     "Supabase Storage" section of security-contracts.md for required
--     values.
--   • The check_rate_limit() RPC and rate_limits table schema — provisioned
--     by docs/rate-limit-migration.sql (referenced by lib/rate-limit.ts).
--   • Index creation — handled by docs/shopping-list-migration.sql and any
--     earlier table-creation migrations.

-- ════════════════════════════════════════════════════════════════════════
-- 1. recipes
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their own recipes" ON recipes;
CREATE POLICY "Users can only see their own recipes"
  ON recipes FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

DROP POLICY IF EXISTS "Users can only insert their own recipes" ON recipes;
CREATE POLICY "Users can only insert their own recipes"
  ON recipes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only update their own recipes" ON recipes;
CREATE POLICY "Users can only update their own recipes"
  ON recipes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only delete their own recipes" ON recipes;
CREATE POLICY "Users can only delete their own recipes"
  ON recipes FOR DELETE
  USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════
-- 2. pantry
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE pantry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their own pantry" ON pantry;
CREATE POLICY "Users can only see their own pantry"
  ON pantry FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only insert their own pantry items" ON pantry;
CREATE POLICY "Users can only insert their own pantry items"
  ON pantry FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only update their own pantry items" ON pantry;
CREATE POLICY "Users can only update their own pantry items"
  ON pantry FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only delete their own pantry items" ON pantry;
CREATE POLICY "Users can only delete their own pantry items"
  ON pantry FOR DELETE
  USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════
-- 3. shopping_lists
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their own shopping lists" ON shopping_lists;
CREATE POLICY "Users can only see their own shopping lists"
  ON shopping_lists FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only insert their own shopping lists" ON shopping_lists;
CREATE POLICY "Users can only insert their own shopping lists"
  ON shopping_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only update their own shopping lists" ON shopping_lists;
CREATE POLICY "Users can only update their own shopping lists"
  ON shopping_lists FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can only delete their own shopping lists" ON shopping_lists;
CREATE POLICY "Users can only delete their own shopping lists"
  ON shopping_lists FOR DELETE
  USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════════
-- 4. shopping_list_items
-- ════════════════════════════════════════════════════════════════════════
--
-- Items don't carry user_id directly — ownership is enforced by joining
-- to the parent shopping_lists row. The shopping_list_items_list_id_idx
-- index keeps this fast; if it's ever dropped every RLS check becomes a
-- sequential scan.

ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only see their own shopping list items" ON shopping_list_items;
CREATE POLICY "Users can only see their own shopping list items"
  ON shopping_list_items FOR SELECT
  USING (auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id));

DROP POLICY IF EXISTS "Users can only insert their own shopping list items" ON shopping_list_items;
CREATE POLICY "Users can only insert their own shopping list items"
  ON shopping_list_items FOR INSERT
  WITH CHECK (auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id));

DROP POLICY IF EXISTS "Users can only update their own shopping list items" ON shopping_list_items;
CREATE POLICY "Users can only update their own shopping list items"
  ON shopping_list_items FOR UPDATE
  USING (auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id))
  WITH CHECK (auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id));

DROP POLICY IF EXISTS "Users can only delete their own shopping list items" ON shopping_list_items;
CREATE POLICY "Users can only delete their own shopping list items"
  ON shopping_list_items FOR DELETE
  USING (auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id));


-- ════════════════════════════════════════════════════════════════════════
-- 5. rate_limits
-- ════════════════════════════════════════════════════════════════════════
--
-- RLS is enabled with NO client policies. With RLS on and zero policies,
-- the anon and authenticated roles have no access at all. The only path
-- that touches this table is the check_rate_limit() RPC, which runs with
-- SECURITY DEFINER privileges and bypasses RLS by design.
--
-- Adding any policy here would silently allow clients to read or reset
-- their own rate-limit counters. Don't.

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════════════════
-- Verification
-- ════════════════════════════════════════════════════════════════════════
--
-- Run these after applying the migration to confirm the final state.

-- A. Every protected table has RLS enabled.
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('recipes', 'pantry', 'shopping_lists', 'shopping_list_items', 'rate_limits')
-- ORDER BY tablename;

-- B. Every expected policy exists.
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
