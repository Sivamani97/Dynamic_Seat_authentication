import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logAuditEvent } from "@/lib/supabase/server";
import { SeatAssistSchema } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const unitId = params.id;
  const supabase = getAdminClient();

  // 1. Rate Limiting Check
  const rateLimit = await checkRateLimit(`assist_${unitId}`, supabase, 5, 30);
  if (!rateLimit.success) {
    return NextResponse.json(
      { success: false, message: "Assistance request already registered. Help is incoming." },
      { status: 429 }
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {}

  const parseResult = SeatAssistSchema.safeParse({
    ...body,
    unitId: body.unitId || unitId,
  });

  const category = parseResult.success ? parseResult.data.category : "WATER_BASIC";
  const note = parseResult.success ? parseResult.data.note : undefined;

  // 2. Fetch Seat Unit & Current Booking
  const { data: seatUnit, error: uErr } = await supabase
    .from("seat_units")
    .select(
      `
      id,
      seat_id,
      seat:seats (id, label, screen_id, screen:screens (venue_id, name))
    `
    )
    .eq("id", unitId)
    .single();

  if (uErr || !seatUnit) {
    return NextResponse.json(
      { success: false, message: "Seat unit not found" },
      { status: 404 }
    );
  }

  const seat = seatUnit.seat as any;

  // Find active booking for this seat if any
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_ref, event_id")
    .eq("seat_id", seatUnit.seat_id)
    .in("status", ["CHECKED_IN", "SEAT_AUTHORIZED"])
    .maybeSingle();

  // Determine Priority
  const isCritical = category === "MEDICAL" || category === "EMERGENCY";
  const priority = isCritical ? "CRITICAL" : category === "DISTURBANCE" ? "HIGH" : "MEDIUM";

  const message = isCritical
    ? `EMERGENCY SOS at Seat ${seat?.label} (${category.replace("_", " ")}). Immediate staff response required!`
    : `Passenger assistance request at Seat ${seat?.label}: ${category.replace("_", " ")}${
        note ? ` - "${note}"` : ""
      }`;

  // 3. Insert Alert
  const { data: alert, error: aErr } = await supabase
    .from("alerts")
    .insert({
      event_id: booking?.event_id || null,
      seat_id: seatUnit.seat_id,
      unit_id: seatUnit.id,
      booking_id: booking?.id || null,
      type: "SOS",
      priority,
      status: "NEW",
      message,
      meta: {
        category,
        note,
        bookingRef: booking?.booking_ref,
        seatLabel: seat?.label,
        screenName: seat?.screen?.name,
      },
    })
    .select()
    .single();

  if (aErr) {
    console.error("Failed to insert alert:", aErr.message);
  }

  // 4. Update Seat State to SOS
  if (booking?.event_id) {
    await supabase
      .from("seat_states")
      .update({
        state: "SOS",
        updated_at: new Date().toISOString(),
      })
      .eq("seat_id", seatUnit.seat_id)
      .eq("event_id", booking.event_id);
  }

  // 5. Append to Tamper-Evident Audit Log
  await logAuditEvent(supabase, {
    eventType: "SOS_ACTIVATED",
    bookingId: booking?.id || null,
    bookingRef: booking?.booking_ref || null,
    seatId: seatUnit.seat_id,
    seatLabel: seat?.label,
    unitId: seatUnit.id,
    actorRole: "USER",
    status: "SUCCESS",
    meta: {
      alertId: alert?.id,
      category,
      priority,
      message,
    },
  });

  return NextResponse.json({
    success: true,
    alertId: alert?.id,
    seatLabel: seat?.label,
    category,
    priority,
    message: "Request registered. Staff has been notified and help is on the way.",
  });
}
