import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";
import { runSystemEvaluation } from "@/lib/evaluator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const providedSecret =
    authHeader?.replace("Bearer ", "") ||
    request.nextUrl.searchParams.get("secret");

  // Protect route if CRON_SECRET is configured
  if (cronSecret && providedSecret !== cronSecret) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing cron secret" },
      { status: 401 }
    );
  }

  const supabase = getAdminClient();
  const summary = await runSystemEvaluation(supabase);

  return NextResponse.json({
    status: "OK",
    cronExecuted: true,
    summary,
  });
}
