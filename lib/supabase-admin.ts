import { createClient } from '@supabase/supabase-js'

// Server-only guard: throw immediately if this module is accidentally
// imported in a browser or edge context where the service-role key must
// never be exposed.
if (typeof window !== 'undefined') {
  throw new Error(
    'lib/supabase-admin must only be imported in Server Actions or Route Handlers. ' +
    'Remove this import from any client component.',
  )
}

// Server-only Supabase client using the service role key.
// Used exclusively in Server Actions for storage uploads and admin operations.
// Never import this in client components.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
