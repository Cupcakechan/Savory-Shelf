import { createClient } from '@supabase/supabase-js'

// Server-only Supabase client using the service role key.
// Used exclusively in Server Actions for storage uploads and admin operations.
// Never import this in client components.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
