import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy-project.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy_anon_key";
  return createBrowserClient(url, anonKey);
}
