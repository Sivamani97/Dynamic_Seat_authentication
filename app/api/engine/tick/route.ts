import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { runSystemEvaluation } from "@/lib/evaluator";

export const dynamic = "force-dynamic";

/**
 * Client-Side Engine Tick Endpoint
 * Useful for Vercel Hobby tier (where Vercel cron runs max 1/day).
 * Allows active staff dashboards and demo sessions to advance time and evaluate
 * mismatch thresholds and heartbeats reliably.
 * 
 * Privileged operation: Requires authenticated STAFF/ADMIN session or CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  // 1. Check CRON_SECRET if automated worker (Bearer token only)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  const isCronAuthorized = Boolean(cronSecret && bearerToken && bearerToken === cronSecret);

  if (!isCronAuthorized) {
    // 2. Check Staff or Admin Session
    const user = await getAuthenticatedUser(request, supabase);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Authentication required for system evaluation tick." },
        { status: 401 }
      );
    }

    if (!["STAFF", "ADMIN"].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: Staff or Admin role required." },
        { status: 403 }
      );
    }
  }

  const summary = await runSystemEvaluation(supabase);

  return NextResponse.json({
    status: "OK",
    tick: true,
    summary,
  });
}
