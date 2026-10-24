import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logAuditEvent } from "@/lib/supabase/server";
import { ManualOverrideSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = ManualOverrideSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, message: parseResult.error.errors.map((e) => e.message).join(", ") },
      { status: 400 }
    );
  }

  const { seatId, eventId, action, newSeatId, reason } = parseResult.data;

  // 1. Fetch current seat details
  const { data: seat } = await supabase
    .from("seats")
    .select("id, label, unit_id")
    .eq("id", seatId)
    .single();

  const nowIso = new Date().toISOString();

  if (action === "AUTHORIZE_SEAT") {
    // Manually mark seat authorized
    await supabase.from("seat_states").upsert(
      {
        seat_id: seatId,
        event_id: eventId,
        authorization: "AUTHORIZED",
        state: "AUTHORIZED",
        mismatch_since: null,
        updated_at: nowIso,
      },
      { onConflict: "seat_id,event_id" }
    );

    // Auto-resolve any WRONG_SEAT alert
    await supabase
      .from("alerts")
      .update({
        status: "RESOLVED",
        resolution_note: `Manual staff override authorization: ${reason}`,
        resolved_at: nowIso,
      })
      .eq("seat_id", seatId)
      .eq("type", "WRONG_SEAT")
      .in("status", ["NEW", "ACKNOWLEDGED"]);

    await logAuditEvent(supabase, {
      eventType: "MANUAL_OVERRIDE",
      seatId,
      seatLabel: seat?.label,
      unitId: seat?.unit_id,
      actorRole: "STAFF",
      status: "SUCCESS",
      meta: {
        action: "AUTHORIZE_SEAT",
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Seat ${seat?.label} manually authorized by staff.`,
    });
  }

  if (action === "REASSIGN_SEAT") {
    if (!newSeatId) {
      return NextResponse.json(
        { success: false, message: "newSeatId is required for seat reassignment" },
        { status: 400 }
      );
    }

    // Fetch target seat
    const { data: targetSeat } = await supabase
      .from("seats")
      .select("id, label, unit_id")
      .eq("id", newSeatId)
      .single();

    if (!targetSeat) {
      return NextResponse.json(
        { success: false, message: "Target seat does not exist" },
        { status: 404 }
      );
    }

    // Find active booking on old seat
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, booking_ref")
      .eq("seat_id", seatId)
      .eq("event_id", eventId)
      .single();

    if (booking) {
      // Reassign booking
      await supabase
        .from("bookings")
        .update({
          seat_id: newSeatId,
          updated_at: nowIso,
        })
        .eq("id", booking.id);
    }

    // Reset old seat state
    await supabase.from("seat_states").upsert(
      {
        seat_id: seatId,
        event_id: eventId,
        authorization: "UNAUTHORIZED",
        state: "NORMAL",
        mismatch_since: null,
        updated_at: nowIso,
      },
      { onConflict: "seat_id,event_id" }
    );

    // Authorize new seat
    await supabase.from("seat_states").upsert(
      {
        seat_id: newSeatId,
        event_id: eventId,
        authorization: "AUTHORIZED",
        state: "AUTHORIZED",
        mismatch_since: null,
        updated_at: nowIso,
      },
      { onConflict: "seat_id,event_id" }
    );

    await logAuditEvent(supabase, {
      eventType: "MANUAL_OVERRIDE",
      bookingId: booking?.id || null,
      bookingRef: booking?.booking_ref || null,
      seatId: newSeatId,
      seatLabel: targetSeat.label,
      actorRole: "STAFF",
      status: "SUCCESS",
      meta: {
        action: "REASSIGN_SEAT",
        fromSeat: seat?.label,
        toSeat: targetSeat.label,
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Reassigned from ${seat?.label} to ${targetSeat.label}.`,
    });
  }

  if (action === "RESET_STATE") {
    await supabase.from("seat_states").upsert(
      {
        seat_id: seatId,
        event_id: eventId,
        authorization: "UNAUTHORIZED",
        occupancy: "EMPTY",
        state: "NORMAL",
        pressure: 0,
        mismatch_since: null,
        updated_at: nowIso,
      },
      { onConflict: "seat_id,event_id" }
    );

    await logAuditEvent(supabase, {
      eventType: "MANUAL_OVERRIDE",
      seatId,
      seatLabel: seat?.label,
      actorRole: "STAFF",
      status: "SUCCESS",
      meta: { action: "RESET_STATE", reason },
    });

    return NextResponse.json({
      success: true,
      message: `Seat ${seat?.label} state reset to normal idle.`,
    });
  }

  return NextResponse.json({ success: false, message: "Unknown override action" }, { status: 400 });
}
