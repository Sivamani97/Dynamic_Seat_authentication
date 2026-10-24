import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, logAuditEvent } from "@/lib/supabase/server";
import { ConfirmBookingSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const userId = request.nextUrl.searchParams.get("userId");

  let query = supabase
    .from("bookings")
    .select(
      `
      id,
      booking_ref,
      user_id,
      event_id,
      seat_id,
      status,
      ticket_link_token,
      checked_in_at,
      seat_authorized_at,
      created_at,
      seat:seats (id, label, row, col, type, price, unit_id),
      event:events (id, title, type, start_time, end_time, status, screen:screens (name, venue:venues (name, type)))
    `
    )
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: bookings, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: bookings || [] });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = ConfirmBookingSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, message: parseResult.error.errors.map((e) => e.message).join(", ") },
      { status: 400 }
    );
  }

  const { eventId, seatId } = parseResult.data;
  const userId =
    request.headers.get("x-user-id") ||
    body.userId ||
    "00000000-0000-0000-0000-000000000001";
  const userEmail = body.userEmail || "user1@demo.com";

  // Check seat availability
  const { data: existingBooking } = await supabase
    .from("bookings")
    .select("id")
    .eq("event_id", eventId)
    .eq("seat_id", seatId)
    .in("status", ["BOOKED", "CHECKED_IN", "SEAT_AUTHORIZED"])
    .maybeSingle();

  if (existingBooking) {
    return NextResponse.json(
      { success: false, message: "Seat already reserved." },
      { status: 409 }
    );
  }

  // Generate Booking Reference (e.g. BK829173)
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const bookingRef = `BK${randomSuffix}`;

  // Generate Opaque Ticket Link Token & Booking Secret
  const ticketLinkToken = crypto.randomBytes(16).toString("hex");
  const bookingSecret = crypto.randomBytes(32).toString("hex");

  // Fetch Seat and Event information for metadata and email
  const { data: seat } = await supabase
    .from("seats")
    .select("id, label, price, unit_id, screen:screens (name, venue:venues (name))")
    .eq("id", seatId)
    .single();

  const { data: event } = await supabase
    .from("events")
    .select("id, title, start_time")
    .eq("id", eventId)
    .single();

  // Create Booking
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .insert({
      booking_ref: bookingRef,
      user_id: userId,
      event_id: eventId,
      seat_id: seatId,
      status: "BOOKED",
      ticket_link_token: ticketLinkToken,
      booking_secret: bookingSecret,
    })
    .select()
    .single();

  if (bErr) {
    return NextResponse.json(
      { success: false, message: "Failed to create booking: " + bErr.message },
      { status: 500 }
    );
  }

  // Release any hold
  await supabase.from("seat_holds").delete().eq("event_id", eventId).eq("seat_id", seatId);

  // Initialize Seat State to EMPTY & UNAUTHORIZED if not already present
  await supabase.from("seat_states").upsert(
    {
      seat_id: seatId,
      event_id: eventId,
      occupancy: "EMPTY",
      authorization: "UNAUTHORIZED",
      state: "NORMAL",
      pressure: 0,
      mismatch_since: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "seat_id,event_id" }
  );

  // Create simulated email in email_outbox table
  const ticketUrl = `/t/${ticketLinkToken}`;
  const venueName = (seat?.screen as any)?.venue?.name || "SmartSeat Venue";
  const screenName = (seat?.screen as any)?.name || "Screen";

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
      <h1 style="color: #6366f1; margin-bottom: 8px;">SmartSeat Booking Confirmation</h1>
      <p style="color: #94a3b8; font-size: 14px;">Your seat has been securely reserved.</p>
      
      <div style="background: #1e293b; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #334155;">
        <p><strong>Booking Ref:</strong> <span style="font-family: monospace; color: #38bdf8;">${bookingRef}</span></p>
        <p><strong>Event:</strong> ${event?.title || "Event"}</p>
        <p><strong>Venue:</strong> ${venueName} (${screenName})</p>
        <p><strong>Assigned Seat:</strong> <span style="color: #10b981; font-size: 18px; font-weight: bold;">${seat?.label}</span></p>
      </div>

      <p style="margin: 24px 0;">
        <a href="${ticketUrl}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
          Open Dynamic Ticket
        </a>
      </p>

      <p style="font-size: 12px; color: #64748b;">
        Dynamic seat authentication requires scanning your 30s refreshing QR at entry and at your assigned seat.
      </p>
    </div>
  `;

  await supabase.from("email_outbox").insert({
    user_id: userId,
    booking_id: booking.id,
    recipient_email: userEmail,
    subject: `Booking Confirmed: ${event?.title} (Seat ${seat?.label}) [${bookingRef}]`,
    body_html: emailHtml,
    ticket_link: ticketUrl,
  });

  // Log to Audit Log
  await logAuditEvent(supabase, {
    eventType: "BOOKING_CREATED",
    bookingId: booking.id,
    bookingRef,
    seatId,
    seatLabel: seat?.label,
    unitId: seat?.unit_id,
    actorId: userId,
    actorRole: "USER",
    status: "SUCCESS",
    meta: {
      eventTitle: event?.title,
      price: seat?.price,
      ticketLinkToken,
    },
  });

  return NextResponse.json({
    success: true,
    bookingId: booking.id,
    bookingRef,
    ticketLinkToken,
    ticketUrl,
    seatLabel: seat?.label,
    eventTitle: event?.title,
    message: "Booking confirmed successfully.",
  });
}

// Cancel Booking
export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient();
  const bookingId = request.nextUrl.searchParams.get("id");

  if (!bookingId) {
    return NextResponse.json({ success: false, message: "Booking ID is required" }, { status: 400 });
  }

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, booking_ref, seat_id, event_id, user_id, seat:seats (label, unit_id)")
    .eq("id", bookingId)
    .single();

  if (bErr || !booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();

  // Update status to CANCELLED
  await supabase
    .from("bookings")
    .update({
      status: "CANCELLED",
      updated_at: nowIso,
    })
    .eq("id", bookingId);

  // Reset seat state to UNAUTHORIZED
  await supabase.from("seat_states").upsert(
    {
      seat_id: booking.seat_id,
      event_id: booking.event_id,
      authorization: "UNAUTHORIZED",
      occupancy: "EMPTY",
      state: "NORMAL",
      pressure: 0,
      mismatch_since: null,
      updated_at: nowIso,
    },
    { onConflict: "seat_id,event_id" }
  );

  // Log Cancellation
  await logAuditEvent(supabase, {
    eventType: "BOOKING_CANCELLED",
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    seatId: booking.seat_id,
    seatLabel: (booking.seat as any)?.label,
    unitId: (booking.seat as any)?.unit_id,
    actorId: booking.user_id,
    actorRole: "USER",
    status: "SUCCESS",
    meta: { reason: "User requested cancellation" },
  });

  return NextResponse.json({
    success: true,
    message: `Booking ${booking.booking_ref} has been cancelled and seat released.`,
  });
}
