import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import { runSystemEvaluation } from "@/lib/evaluator";

export const dynamic = "force-dynamic";

/**
 * Daily Vercel Cron Endpoint (Schedule: "0 0 * * *")
 * 
 * Performs scheduled full sweep maintenance:
 * - Purges expired seat holds
 * - Purges expired used replay token nonces
 * - Purges expired rate limit entries
 * - Flags persistent mismatches and missed heartbeats
 * 
 * Protected by CRON_SECRET authorization check.
 */
async function handleCronEvaluation(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  // Strict security: require verified Authorization: Bearer <token>.
  // Query-string secret parameters are strictly disallowed to prevent log and referer leakage.
  if (cronSecret) {
    if (!bearerToken || bearerToken !== cronSecret) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid Bearer cron secret" },
        { status: 401 }
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Server misconfiguration: CRON_SECRET environment variable is missing in production" },
      { status: 500 }
    );
  }

  const supabase = getAdminClient();
  const summary = await runSystemEvaluation(supabase, { forceFullSweep: true });

  return NextResponse.json({
    status: "OK",
    cronExecuted: true,
    summary,
  });
}

export async function GET(request: NextRequest) {
  return handleCronEvaluation(request);
}

export async function POST(request: NextRequest) {
  return handleCronEvaluation(request);
}
