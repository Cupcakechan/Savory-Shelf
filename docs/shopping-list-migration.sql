-- ─────────────────────────────────────────────────────────────────────────
-- SavoryShelf — Shopping List feature migration
-- ─────────────────────────────────────────────────────────────────────────
-- Idempotent: safe to re-run any number of times. Creates two tables —
-- shopping_lists (top-level) and shopping_list_items (line items) — plus
-- RLS policies that mirror the pantry/recipes pattern: a user can only
-- see and modify their own lists and items.
-- ─────────────────────────────────────────────────────────────────────────


-- ─── Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shopping_lists (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id         uuid        NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  ingredient_name text        NOT NULL,
  quantity        text,
  unit            text,
  checked         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);


-- ─── Indexes ─────────────────────────────────────────────────────────────
-- Required for fast user-scoped list queries and to back the
-- shopping_list_items RLS subquery (which joins on list_id).

CREATE INDEX IF NOT EXISTS shopping_lists_user_id_idx
  ON shopping_lists (user_id);

CREATE INDEX IF NOT EXISTS shopping_list_items_list_id_idx
  ON shopping_list_items (list_id);


-- ─── Enable RLS ──────────────────────────────────────────────────────────
-- Both ALTERs are no-ops if RLS is already enabled — safe to re-run.

ALTER TABLE shopping_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;


-- ─── shopping_lists policies ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can only see their own shopping lists"    ON shopping_lists;
DROP POLICY IF EXISTS "Users can only insert their own shopping lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users can only update their own shopping lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users can only delete their own shopping lists" ON shopping_lists;

CREATE POLICY "Users can only see their own shopping lists"
  ON shopping_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own shopping lists"
  ON shopping_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own shopping lists"
  ON shopping_lists FOR UPDATE
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own shopping lists"
  ON shopping_lists FOR DELETE
  USING (auth.uid() = user_id);


-- ─── shopping_list_items policies ────────────────────────────────────────
-- Item ownership is verified by joining to the parent list rather than
-- by storing user_id directly on each item. This keeps the schema lean
-- and prevents drift (e.g. a list being reassigned without items being
-- updated). The shopping_list_items_list_id_idx above keeps it fast.

DROP POLICY IF EXISTS "Users can only see their own shopping list items"    ON shopping_list_items;
DROP POLICY IF EXISTS "Users can only insert their own shopping list items" ON shopping_list_items;
DROP POLICY IF EXISTS "Users can only update their own shopping list items" ON shopping_list_items;
DROP POLICY IF EXISTS "Users can only delete their own shopping list items" ON shopping_list_items;

CREATE POLICY "Users can only see their own shopping list items"
  ON shopping_list_items FOR SELECT
  USING (
    auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id)
  );

CREATE POLICY "Users can only insert their own shopping list items"
  ON shopping_list_items FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id)
  );

CREATE POLICY "Users can only update their own shopping list items"
  ON shopping_list_items FOR UPDATE
  USING (
    auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id)
  );

CREATE POLICY "Users can only delete their own shopping list items"
  ON shopping_list_items FOR DELETE
  USING (
    auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id)
  );


-- ─── Verification ────────────────────────────────────────────────────────
-- Re-run these queries in the Supabase SQL editor to confirm everything
-- landed correctly:
--
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('shopping_lists', 'shopping_list_items');
--
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('shopping_lists', 'shopping_list_items')
--   ORDER BY tablename, cmd;
