import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, logAuditEvent, getAuthenticatedUser } from "@/lib/supabase/server";
import { ConfirmBookingSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = getAdminClient();

  // 1. Require caller authentication
  const user = await getAuthenticatedUser(request, supabase);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required. Please log in." },
      { status: 401 }
    );
  }

  // 2. Query construction with strict role isolation
  if (user.role === "USER") {
    // Passenger only sees their own bookings
    const { data: bookings, error } = await supabase
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
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ bookings: bookings || [] });
  }

  // Staff: Can query bookings, but NEVER expose ticket_link_token to staff
  if (user.role === "STAFF") {
    const targetUserId = request.nextUrl.searchParams.get("userId");
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
        checked_in_at,
        seat_authorized_at,
        created_at,
        seat:seats (id, label, row, col, type, price, unit_id),
        event:events (id, title, type, start_time, end_time, status, screen:screens (name, venue:venues (name, type)))
      `
      )
      .order("created_at", { ascending: false });

    if (targetUserId) {
      query = query.eq("user_id", targetUserId);
    }

    const { data: bookings, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ bookings: bookings || [] });
  }

  // Admin: Can view all bookings (including ticket_link_token for administration)
  const targetUserId = request.nextUrl.searchParams.get("userId");
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

  if (targetUserId) {
    query = query.eq("user_id", targetUserId);
  }

  const { data: bookings, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: bookings || [] });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  // 1. Require verified passenger authentication
  const user = await getAuthenticatedUser(request, supabase);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required. Please log in." },
      { status: 401 }
    );
  }

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
  // Always derive user ID from cryptographically verified session; discard any client overrides
  const userId = user.id;
  const userEmail = user.email || body.userEmail || "passenger@demo.com";

  // Generate Booking Reference (e.g. BK829173)
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const bookingRef = `BK${randomSuffix}`;

  // Generate Opaque Ticket Link Token & Booking Secret
  const ticketLinkToken = crypto.randomBytes(16).toString("hex");
  const bookingSecret = crypto.randomBytes(32).toString("hex");

  // Require atomic booking confirmation via PostgreSQL RPC
  const { data: rpcResult, error: rpcError } = await supabase.rpc("confirm_booking_atomic", {
    p_event_id: eventId,
    p_seat_id: seatId,
    p_user_id: userId,
    p_booking_ref: bookingRef,
    p_ticket_link_token: ticketLinkToken,
    p_booking_secret: bookingSecret,
  });

  if (rpcError || !rpcResult || typeof rpcResult !== "object" || typeof rpcResult.success !== "boolean") {
    console.error("Critical booking confirmation RPC failure:", rpcError || rpcResult);
    return NextResponse.json(
      { success: false, message: "Booking service unavailable or atomic transaction failed." },
      { status: 500 }
    );
  }

  if (!rpcResult.success) {
    const isConflict = ["SEAT_ALREADY_RESERVED", "SEAT_HELD_BY_ANOTHER", "CONCURRENT_CONFLICT"].includes(rpcResult.code);
    const isBadRequest = ["INVALID_EVENT_SEAT", "EVENT_NOT_BOOKABLE", "EVENT_NOT_FOUND", "SEAT_NOT_FOUND"].includes(rpcResult.code);
    return NextResponse.json(
      { success: false, message: rpcResult.message || "Failed to confirm booking." },
      { status: isConflict ? 409 : isBadRequest ? 400 : 500 }
    );
  }

  const booking = rpcResult.booking;

  // Fetch Seat and Event information for metadata and email
  const { data: seat } = await supabase
    .from("seats")
    .select("id, label, price, unit_id, screen:screens (name, venue:venues (name))")
    .eq("id", seatId)
    .maybeSingle();

  const { data: event } = await supabase
    .from("events")
    .select("id, title, start_time")
    .eq("id", eventId)
    .maybeSingle();

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

  // Log to Audit Log with verified actor ID and role
  await logAuditEvent(supabase, {
    eventType: "BOOKING_CREATED",
    bookingId: booking.id,
    bookingRef,
    seatId,
    seatLabel: seat?.label,
    unitId: seat?.unit_id,
    actorId: userId,
    actorRole: user.role,
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

  // 1. Require caller authentication
  const user = await getAuthenticatedUser(request, supabase);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required. Please log in." },
      { status: 401 }
    );
  }

  const bookingId = request.nextUrl.searchParams.get("id");
  if (!bookingId) {
    return NextResponse.json({ success: false, message: "Booking ID is required" }, { status: 400 });
  }

  // 2. Fetch target booking
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, booking_ref, seat_id, event_id, user_id, status, seat:seats (label, unit_id)")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  // 3. Ownership / Authorization Check
  const isOwner = booking.user_id === user.id;
  const isPrivileged = user.role === "STAFF" || user.role === "ADMIN";

  if (!isOwner && !isPrivileged) {
    return NextResponse.json(
      { success: false, message: "Forbidden: You are not authorized to cancel this booking." },
      { status: 403 }
    );
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json(
      { success: false, message: "Booking is already cancelled." },
      { status: 400 }
    );
  }

  // 4. Perform atomic transactional cancellation
  const { data: cancelResult, error: cancelError } = await supabase.rpc("cancel_booking_atomic", {
    p_booking_id: bookingId,
    p_user_id: user.id,
    p_is_privileged: isPrivileged,
  });

  if (cancelError || !cancelResult || typeof cancelResult !== "object" || !cancelResult.success) {
    const errorMsg = cancelResult?.message || cancelError?.message || "Failed to cancel booking.";
    const statusCode = cancelResult?.code === "FORBIDDEN" ? 403 : cancelResult?.code === "ALREADY_CANCELLED" ? 400 : 500;
    return NextResponse.json(
      { success: false, message: errorMsg },
      { status: statusCode }
    );
  }

  // Log Cancellation with authenticated actor details
  await logAuditEvent(supabase, {
    eventType: "BOOKING_CANCELLED",
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    seatId: booking.seat_id,
    seatLabel: (booking.seat as any)?.label,
    unitId: (booking.seat as any)?.unit_id,
    actorId: user.id,
    actorRole: user.role,
    status: "SUCCESS",
    meta: {
      cancelledBy: user.id,
      role: user.role,
      reason: isPrivileged && !isOwner ? "Staff/Admin cancellation override" : "Passenger requested cancellation",
    },
  });

  return NextResponse.json({
    success: true,
    message: `Booking ${booking.booking_ref} has been cancelled and seat released.`,
  });
}
