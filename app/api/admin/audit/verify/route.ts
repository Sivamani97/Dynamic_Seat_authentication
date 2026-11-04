import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { verifyAuditChain } from "@/lib/audit";
import { AuditRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();

  // 1. Enforce admin role authentication
  const user = await getAuthenticatedUser(request, supabase);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required. Please log in." },
      { status: 401 }
    );
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, message: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  // 2. Load audit log entries ordered by ID ascending
  const { data: records, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch audit log: " + error.message },
      { status: 500 }
    );
  }

  const result = verifyAuditChain((records || []) as AuditRecord[]);

  return NextResponse.json({
    success: true,
    integrityVerified: result.valid,
    totalRecordsChecked: result.totalChecked,
    corruptedRowId: result.corruptedRowId,
    failureReason: result.failureReason,
    expectedHash: result.expectedHash,
    actualHash: result.actualHash,
    verificationTimestamp: new Date().toISOString(),
  });
}
