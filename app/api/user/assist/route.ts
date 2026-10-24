import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logAuditEvent } from "@/lib/supabase/server";
import { UserInAppAssistSchema } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

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

  // Rate limit
  const rateLimit = await checkRateLimit(`user_assist_${bookingId}`, supabase, 5, 30);
  if (!rateLimit.success) {
    return NextResponse.json(
      { success: false, message: "Request already registered. Staff is notified." },
      { status: 429 }
    );
  }

  // Fetch Booking
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
      seat:seats (id, label, unit_id, screen:screens (name))
    `
    )
    .eq("id", bookingId)
    .single();

  if (bErr || !booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  const seat = booking.seat as any;
  const isCritical = category === "MEDICAL" || category === "EMERGENCY";
  const priority = isCritical ? "CRITICAL" : category === "DISTURBANCE" ? "HIGH" : "MEDIUM";

  const message = isCritical
    ? `EMERGENCY SOS from passenger at Seat ${seat?.label} (${category.replace("_", " ")}). Urgent!`
    : `Passenger assistance request at Seat ${seat?.label}: ${category.replace("_", " ")}${
        note ? ` - "${note}"` : ""
      }`;

  // Insert alert
  const { data: alert } = await supabase
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
        bookingRef: booking.booking_ref,
        seatLabel: seat?.label,
        screenName: seat?.screen?.name,
      },
    })
    .select()
    .single();

  // Update seat state to SOS
  await supabase
    .from("seat_states")
    .update({ state: "SOS", updated_at: new Date().toISOString() })
    .eq("seat_id", booking.seat_id)
    .eq("event_id", booking.event_id);

  // Log to Audit Chain
  await logAuditEvent(supabase, {
    eventType: "SOS_ACTIVATED",
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    seatId: booking.seat_id,
    seatLabel: seat?.label,
    unitId: seat?.unit_id,
    actorId: booking.user_id,
    actorRole: "USER",
    status: "SUCCESS",
    meta: {
      alertId: alert?.id,
      category,
      priority,
    },
  });

  return NextResponse.json({
    success: true,
    alertId: alert?.id,
    seatLabel: seat?.label,
    category,
    priority,
    message: "Request registered. Help is on the way.",
  });
}
