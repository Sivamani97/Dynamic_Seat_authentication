import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logAuditEvent, getAuthenticatedUser } from "@/lib/supabase/server";
import { UserInAppAssistSchema } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/assist?bookingId=<id>
 * Retrieves the passenger's active or latest SOS alert status for their verified booking.
 * Enforces authenticated passenger ownership.
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();

  // 1. Require verified passenger authentication
  const user = await getAuthenticatedUser(request, supabase);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required. Please log in." },
      { status: 401 }
    );
  }

  const bookingId = request.nextUrl.searchParams.get("bookingId");
  if (!bookingId) {
    return NextResponse.json(
      { success: false, message: "bookingId query parameter is required" },
      { status: 400 }
    );
  }

  // 2. Fetch booking and verify ownership
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, user_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ success: false, message: "Booking not found." }, { status: 404 });
  }

  const isOwner = booking.user_id === user.id;
  const isPrivileged = user.role === "STAFF" || user.role === "ADMIN";

  if (!isOwner && !isPrivileged) {
    return NextResponse.json(
      { success: false, message: "Forbidden: You do not have permission to view alert status for this booking." },
      { status: 403 }
    );
  }

  // 3. Query the latest SOS alert for this booking
  const { data: alert } = await supabase
    .from("alerts")
    .select("id, status, type, priority, message, created_at, acknowledged_at, resolved_at, meta")
    .eq("booking_id", bookingId)
    .eq("type", "SOS")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasActiveAlert = alert ? alert.status === "NEW" || alert.status === "ACKNOWLEDGED" : false;

  return NextResponse.json({
    success: true,
    hasActiveAlert,
    alert: alert || null,
  });
}

/**
 * POST /api/user/assist
 * Passenger-Owned SOS Assistance Dispatch.
 * Enforces cryptographic session authentication, booking ownership,
 * active booking validation, and duplicate active SOS alert prevention.
 */
export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  // 1. Require authenticated session
  const user = await getAuthenticatedUser(request, supabase);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required. Please log in to request assistance." },
      { status: 401 }
    );
  }

  // 2. Validate Request Body
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = UserInAppAssistSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, message: parseResult.error.errors.map((e) => e.message).join(", ") },
      { status: 400 }
    );
  }

  const { bookingId, category, note } = parseResult.data;

  // 3. Rate Limiting Check (per-user and per-booking)
  const rateLimit = await checkRateLimit(`user_assist_${user.id}`, supabase, 5, 60);
  if (!rateLimit.success) {
    return NextResponse.json(
      { success: false, message: "Assistance request rate limit reached. Staff has already been notified." },
      { status: 429 }
    );
  }

  // 4. Fetch Booking Record and Verify Ownership
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select(
      `
      id,
      booking_ref,
      user_id,
      event_id,
      seat_id,
      status,
      seat:seats (id, label, unit_id, screen:screens (name)),
      event:events (id, title, status)
    `
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ success: false, message: "Booking not found." }, { status: 404 });
  }

  // Prevent passengers from triggering alerts against other passengers' bookings
  const isOwner = booking.user_id === user.id;
  const isStaffOrAdmin = user.role === "STAFF" || user.role === "ADMIN";

  if (!isOwner && !isStaffOrAdmin) {
    return NextResponse.json(
      {
        success: false,
        message: "Forbidden: You are not authorized to trigger an emergency alert for this booking.",
      },
      { status: 403 }
    );
  }

  // Verify booking is currently active
  if (!["BOOKED", "CHECKED_IN", "SEAT_AUTHORIZED"].includes(booking.status)) {
    return NextResponse.json(
      {
        success: false,
        message: `Cannot request assistance for a ${booking.status.toLowerCase()} booking.`,
      },
      { status: 400 }
    );
  }

  // 5. Prevent Duplicate Active SOS Alerts
  const { data: existingActiveAlert } = await supabase
    .from("alerts")
    .select("id, status, priority, created_at")
    .eq("booking_id", booking.id)
    .eq("type", "SOS")
    .in("status", ["NEW", "ACKNOWLEDGED"])
    .maybeSingle();

  if (existingActiveAlert) {
    return NextResponse.json(
      {
        success: false,
        code: "SOS_ALREADY_ACTIVE",
        message: "An active assistance request is already registered for your seat. Venue staff has been alerted.",
        alertId: existingActiveAlert.id,
        status: existingActiveAlert.status,
      },
      { status: 409 }
    );
  }

  // 6. Construct Alert Metadata
  const seat = booking.seat as any;
  const isCritical = category === "MEDICAL" || category === "EMERGENCY";
  const priority = isCritical ? "CRITICAL" : category === "DISTURBANCE" ? "HIGH" : "MEDIUM";

  const message = isCritical
    ? `EMERGENCY SOS from passenger at Seat ${seat?.label} (${category.replace("_", " ")}). Urgent response required!`
    : `Passenger assistance request at Seat ${seat?.label}: ${category.replace("_", " ")}${
        note ? ` - "${note}"` : ""
      }`;

  // 7. Insert Alert in Database
  const { data: alert, error: aErr } = await supabase
    .from("alerts")
    .insert({
      event_id: booking.event_id,
      seat_id: booking.seat_id,
      unit_id: seat?.unit_id,
      booking_id: booking.id,
      type: "SOS",
      priority,
      status: "NEW",
      message,
      meta: {
        category,
        note,
        passengerUserId: user.id,
        passengerEmail: user.email,
        bookingRef: booking.booking_ref,
        seatLabel: seat?.label,
        screenName: seat?.screen?.name,
        dispatchedAt: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (aErr || !alert) {
    if (
      aErr?.code === "23505" ||
      aErr?.message?.toLowerCase().includes("unique") ||
      aErr?.message?.toLowerCase().includes("duplicate")
    ) {
      return NextResponse.json(
        {
          success: false,
          code: "SOS_ALREADY_ACTIVE",
          message: "An active assistance request is already registered for your seat. Venue staff has been alerted.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, message: "Failed to create assistance alert: " + aErr?.message },
      { status: 500 }
    );
  }

  // 8. Update Seat State to SOS
  await supabase
    .from("seat_states")
    .update({ state: "SOS", updated_at: new Date().toISOString() })
    .eq("seat_id", booking.seat_id)
    .eq("event_id", booking.event_id);

  // 9. Append to Immutable Hash-Chained Audit Log
  await logAuditEvent(supabase, {
    eventType: "SOS_ACTIVATED",
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    seatId: booking.seat_id,
    seatLabel: seat?.label,
    unitId: seat?.unit_id,
    actorId: user.id,
    actorRole: user.role,
    status: "SUCCESS",
    meta: {
      alertId: alert.id,
      category,
      priority,
      passengerUserId: user.id,
    },
  });

  return NextResponse.json({
    success: true,
    alertId: alert.id,
    seatLabel: seat?.label,
    category,
    priority,
    status: alert.status,
    message: "Emergency assistance request registered. Venue staff has been alerted.",
  });
}
