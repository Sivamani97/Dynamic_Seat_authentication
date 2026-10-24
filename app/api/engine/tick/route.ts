import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import { runSystemEvaluation } from "@/lib/evaluator";

export const dynamic = "force-dynamic";

/**
 * Client-Side Engine Tick Endpoint
 * Useful for Vercel Hobby tier (where Vercel cron runs max 1/day).
 * Allows active staff dashboards and demo sessions to advance time and evaluate
 * mismatch thresholds and heartbeats every 5 seconds reliably.
 */
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();
  const summary = await runSystemEvaluation(supabase);

  return NextResponse.json({
    status: "OK",
    tick: true,
    summary,
  });
}
