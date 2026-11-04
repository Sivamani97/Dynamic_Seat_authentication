import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logAuditEvent, getAuthenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff/alerts
 * Retrieves active and recent alerts for the staff command center.
 * Enforces authenticated STAFF or ADMIN role.
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();

  const user = await getAuthenticatedUser(request, supabase);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required. Please log in." },
      { status: 401 }
    );
  }

  if (!["STAFF", "ADMIN"].includes(user.role)) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Staff or Admin role required." },
      { status: 403 }
    );
  }

  const { data: alerts, error } = await supabase
    .from("alerts")
    .select(
      `
      id,
      seat_id,
      event_id,
      unit_id,
      booking_id,
      type,
      priority,
      status,
      message,
      created_at,
      acknowledged_at,
      resolved_at,
      meta,
      seat:seats (label)
    `
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch alerts: " + error.message },
      { status: 500 }
    );
  }

  // Format seat_label cleanly
  const formattedAlerts = (alerts || []).map((a: any) => ({
    ...a,
    seat_label: (a.seat as any)?.label || a.seat_label || "A12",
  }));

  return NextResponse.json({
    success: true,
    alerts: formattedAlerts,
  });
}

/**
 * POST /api/staff/alerts
 * Handles bulk alert operations:
 * - action: "ACKNOWLEDGE_ALL" -> Acknowledges all NEW alerts in bulk
 * - action: "RESOLVE_ALL" -> Resolves all NEW and ACKNOWLEDGED alerts in bulk
 * - action: "ACKNOWLEDGE_MULTIPLE" -> Acknowledges an array of alert IDs
 */
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  const user = await getAuthenticatedUser(request, supabase);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required. Please log in." },
      { status: 401 }
    );
  }

  if (!["STAFF", "ADMIN"].includes(user.role)) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Staff or Admin role required." },
      { status: 403 }
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const { action, alertIds } = body;
  const nowIso = new Date().toISOString();

  if (action === "ACKNOWLEDGE_ALL") {
    const { data: updated, error: uErr } = await supabase
      .from("alerts")
      .update({
        status: "ACKNOWLEDGED",
        acknowledged_at: nowIso,
        acknowledged_by: user.id,
      })
      .eq("status", "NEW")
      .select("id, seat_id, type");

    if (uErr) {
      return NextResponse.json(
        { success: false, message: "Failed to bulk acknowledge: " + uErr.message },
        { status: 500 }
      );
    }

    await logAuditEvent(supabase, {
      eventType: "ALERTS_BULK_ACKNOWLEDGED",
      actorId: user.id,
      actorRole: user.role,
      status: "SUCCESS",
      meta: {
        acknowledgedCount: updated?.length || 0,
        alertIds: updated?.map((a: any) => a.id) || [],
      },
    });

    return NextResponse.json({
      success: true,
      count: updated?.length || 0,
      message: `Successfully acknowledged ${updated?.length || 0} alerts.`,
    });
  }

  if (action === "RESOLVE_ALL") {
    const { data: updated, error: uErr } = await supabase
      .from("alerts")
      .update({
        status: "RESOLVED",
        resolved_at: nowIso,
        resolved_by: user.id,
        resolution_note: "Bulk resolved by staff command",
      })
      .in("status", ["NEW", "ACKNOWLEDGED"])
      .select("id, seat_id, type, event_id");

    if (uErr) {
      return NextResponse.json(
        { success: false, message: "Failed to bulk resolve: " + uErr.message },
        { status: 500 }
      );
    }

    // Restore any WRONG_SEAT or SOS states
    for (const item of updated || []) {
      if (item.seat_id && item.event_id) {
        await supabase
          .from("seat_states")
          .update({ state: "NORMAL", updated_at: nowIso })
          .eq("seat_id", item.seat_id)
          .eq("event_id", item.event_id)
          .in("state", ["SOS", "WRONG_SEAT"]);
      }
    }

    await logAuditEvent(supabase, {
      eventType: "ALERTS_BULK_RESOLVED",
      actorId: user.id,
      actorRole: user.role,
      status: "SUCCESS",
      meta: {
        resolvedCount: updated?.length || 0,
        alertIds: updated?.map((a: any) => a.id) || [],
      },
    });

    return NextResponse.json({
      success: true,
      count: updated?.length || 0,
      message: `Successfully resolved ${updated?.length || 0} alerts.`,
    });
  }

  if (action === "ACKNOWLEDGE_MULTIPLE" && Array.isArray(alertIds) && alertIds.length > 0) {
    const { data: updated, error: uErr } = await supabase
      .from("alerts")
      .update({
        status: "ACKNOWLEDGED",
        acknowledged_at: nowIso,
        acknowledged_by: user.id,
      })
      .in("id", alertIds)
      .select("id");

    if (uErr) {
      return NextResponse.json(
        { success: false, message: "Failed to acknowledge alerts: " + uErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: updated?.length || 0,
      message: `Acknowledged ${updated?.length || 0} alerts.`,
    });
  }

  return NextResponse.json(
    { success: false, message: "Invalid action or parameters." },
    { status: 400 }
  );
}

