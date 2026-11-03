import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    try {
      const supabase = createServerSupabaseClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch (err) {
      console.warn("Auth callback code exchange warning:", err);
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL("/tickets", request.url));
}
