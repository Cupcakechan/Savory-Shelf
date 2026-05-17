# SavoryShelf — Security Contracts

This file is the single source of truth for security assumptions that live
**outside the app codebase** (Supabase dashboard, bucket policies, RLS SQL).
If any of these drift, app behaviour breaks silently — check here first.

---

## Supabase Storage — `recipe-images` bucket

| Setting | Required value | What breaks if it drifts |
|---------|---------------|--------------------------|
| Bucket visibility | **Private** | Public bucket → anyone can enumerate recipe images by guessing UUIDs |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | No restriction → SSRF via SVG or malicious upload |
| Max file size | **5 MB** | No limit → storage cost abuse |
| RLS — INSERT | `auth.role() = 'service_role'` only | Anon key → any unauthenticated client can upload directly, bypassing SSRF guard |
| RLS — SELECT | `auth.role() = 'service_role'` OR signed URL | Direct public reads → image scraping |

**App-side assumption:** All uploads go through `uploadImageToStorage` in
`lib/actions.ts`, which uses the service-role client (`supabaseAdmin`).
Direct client uploads are never performed.

---

## Supabase RLS — `recipes` table

Verify these policies are active (`SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'recipes'`):

| Policy | Command | Expression |
|--------|---------|------------|
| Users can only see their own recipes | SELECT | `auth.uid() = user_id OR is_public = true` |
| Users can only insert their own recipes | INSERT | `auth.uid() = user_id` (WITH CHECK) |
| Users can only update their own recipes | UPDATE | `auth.uid() = user_id` (USING + WITH CHECK) |
| Users can only delete their own recipes | DELETE | `auth.uid() = user_id` |

**What breaks if it drifts:**
- Missing SELECT policy → anon reads all recipes
- Missing `is_public` exception on SELECT → `/share/[id]` page returns 404 for all public recipes
- Missing INSERT WITH CHECK → client can forge `user_id` on insert

---

## Supabase RLS — `pantry` table

| Policy | Command | Expression |
|--------|---------|------------|
| Users can only see their own pantry | SELECT | `auth.uid() = user_id` |
| Users can only insert their own pantry items | INSERT | `auth.uid() = user_id` (WITH CHECK) |
| Users can only update their own pantry items | UPDATE | `auth.uid() = user_id` (USING + WITH CHECK) |
| Users can only delete their own pantry items | DELETE | `auth.uid() = user_id` |

---

## Supabase RLS — `shopping_lists` table

Source: `docs/shopping-list-migration.sql`. Same `auth.uid() = user_id`
pattern as `recipes` and `pantry`.

| Policy | Command | Expression |
|--------|---------|------------|
| Users can only see their own shopping lists | SELECT | `auth.uid() = user_id` |
| Users can only insert their own shopping lists | INSERT | `auth.uid() = user_id` (WITH CHECK) |
| Users can only update their own shopping lists | UPDATE | `auth.uid() = user_id` (USING + WITH CHECK) |
| Users can only delete their own shopping lists | DELETE | `auth.uid() = user_id` |

---

## Supabase RLS — `shopping_list_items` table

Items don't store `user_id`; ownership is enforced by joining to the parent
list. The `shopping_list_items_list_id_idx` index keeps this fast — drop
it and every RLS check becomes a sequential scan.

| Policy | Command | Expression |
|--------|---------|------------|
| Users can only see their own shopping list items | SELECT | `auth.uid() = (SELECT user_id FROM shopping_lists WHERE id = list_id)` |
| Users can only insert their own shopping list items | INSERT | same (WITH CHECK) |
| Users can only update their own shopping list items | UPDATE | same (USING + WITH CHECK) |
| Users can only delete their own shopping list items | DELETE | same (USING) |

---

## Supabase RLS — `rate_limits` table

| Setting | Required value | What breaks if it drifts |
|---------|---------------|--------------------------|
| RLS enabled | **Yes** | Direct client access to rate limit counters |
| Client policies | **None** | Any policy → clients can read/reset their own counters |
| Access path | `check_rate_limit()` RPC only (SECURITY DEFINER) | Direct table access bypasses atomic increment |

**App-side assumption:** Only `supabaseAdmin` (service role) calls the
`check_rate_limit` RPC. The anon/authenticated Supabase client never
touches `rate_limits` directly.

---

## Origin validation — `lib/verify-origin.ts`

`NEXT_PUBLIC_SITE_URL` **must** be set in Vercel Environment Variables:

```
NEXT_PUBLIC_SITE_URL=https://savoryshelf.com
```

If unset: origin check is skipped with a console warning (fail-open).
If set incorrectly: all Server Action calls from production are blocked.

Allowed origins at runtime:
- `NEXT_PUBLIC_SITE_URL` (production)
- `http://localhost:3000` and `http://localhost:3001` (dev)
- Any `*.vercel.app` URL (preview deployments)

---

## Verification checklist (run after any Supabase dashboard change)

```sql
-- 1. Confirm RLS is enabled on all user-owned tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('recipes', 'pantry', 'shopping_lists', 'shopping_list_items', 'rate_limits');

-- 2. Confirm all expected policies exist
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

Run `docs/rls-migration.sql` to restore any missing policies.
