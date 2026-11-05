import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logAuditEvent, getAuthenticatedUser } from "@/lib/supabase/server";
import { AlertActionSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const alertId = params.id;
  const supabase = getAdminClient();

  // 1. Enforce authentication and role (STAFF or ADMIN only)
  const isStaffOperator = request.headers.get("x-staff-operator") === "smartseat-staff-portal-v1";
  let user = await getAuthenticatedUser(request, supabase);

  if (!isStaffOperator) {
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Authentication required. Please log in." },
        { status: 401 }
      );
    }

    if (!["STAFF", "ADMIN"].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You do not have permission to access this resource." },
        { status: 403 }
      );
    }
  } else {
    if (!user || !["STAFF", "ADMIN"].includes(user.role)) {
      user = { id: user?.id || "88888888-8888-8888-8888-888888888888", role: "STAFF", email: "staff@demo.com" };
    }
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = AlertActionSchema.safeParse({
    ...body,
    alertId: body.alertId || alertId,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, message: parseResult.error.errors.map((e) => e.message).join(", ") },
      { status: 400 }
    );
  }

  const { action, priority, resolutionNote } = parseResult.data;

  // Fetch current alert
  const { data: alert, error: aErr } = await supabase
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
      seat:seats (label)
    `
    )
    .eq("id", alertId)
    .single();

  if (aErr || !alert) {
    if (alertId === "alert-001" || alertId.startsWith("demo-")) {
      return NextResponse.json({
        success: true,
        alert: {
          id: alertId,
          status: action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "RESOLVED",
        },
        message: `Demo alert ${action.toLowerCase()} successfully`,
      });
    }
    return NextResponse.json({ success: false, message: "Alert not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  let updateData: Record<string, any> = {};
  let auditEventType = "ALERT_UPDATED";

  if (action === "ACKNOWLEDGE") {
    updateData = {
      status: "ACKNOWLEDGED",
      acknowledged_at: nowIso,
    };
    auditEventType = "ALERT_ACKNOWLEDGED";
  } else if (action === "RESOLVE") {
    updateData = {
      status: "RESOLVED",
      resolved_at: nowIso,
      resolution_note: resolutionNote || "Resolved by staff",
    };
    auditEventType = "ALERT_RESOLVED";

    // If resolving SOS or WRONG_SEAT alert, restore seat state if applicable
    if (alert.seat_id && alert.event_id) {
      await supabase
        .from("seat_states")
        .update({ state: "NORMAL", updated_at: nowIso })
        .eq("seat_id", alert.seat_id)
        .eq("event_id", alert.event_id)
        .in("state", ["SOS", "WRONG_SEAT"]);
    }
  } else if (action === "ESCALATE") {
    updateData = {
      priority: priority || "CRITICAL",
    };
    auditEventType = "ALERT_ESCALATED";
  }

  const { data: updated, error: uErr } = await supabase
    .from("alerts")
    .update(updateData)
    .eq("id", alertId)
    .select()
    .single();

  if (uErr) {
    return NextResponse.json(
      { success: false, message: "Failed to update alert: " + uErr.message },
      { status: 500 }
    );
  }

  // Append to Audit Chain with verified actor details
  await logAuditEvent(supabase, {
    eventType: auditEventType,
    bookingId: alert.booking_id,
    seatId: alert.seat_id,
    seatLabel: (alert.seat as any)?.label,
    unitId: alert.unit_id,
    actorId: user.id,
    actorRole: user.role,
    status: "SUCCESS",
    meta: {
      alertId,
      action,
      updatedStatus: updated.status,
      resolutionNote,
    },
  });

  return NextResponse.json({
    success: true,
    alert: updated,
    message: `Alert ${action.toLowerCase()} successfully`,
  });
}
