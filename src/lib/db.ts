import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Single-user local tool: there is no auth and RLS is off, so a plain
// server-side client is all this needs. No session, no cookies, no login
// ceremony to use your own notebook.
//
// Everything that touches this runs in Server Components or Server Actions —
// the key never reaches the browser.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing Supabase env vars. Run `pnpm exec supabase start` and copy the API URL and keys into .env.local",
  );
}

export const db = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
