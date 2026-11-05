import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logAuditEvent } from "@/lib/supabase/server";
import { generateDynamicToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const ticketLinkToken = params.token;
  if (!ticketLinkToken) {
    return NextResponse.json(
      { error: "Ticket link token is required" },
      { status: 400 }
    );
  }

  const supabase = getAdminClient();

  // 1. Fetch booking by ticket_link_token
  let { data: booking, error: bError } = await supabase
    .from("bookings")
    .select(
      `
      id,
      booking_ref,
      user_id,
      event_id,
      seat_id,
      status,
      booking_secret,
      seat:seats (id, label, row, col, unit_id),
      event:events (id, title, start_time, end_time, status)
    `
    )
    .eq("ticket_link_token", ticketLinkToken)
    .maybeSingle();

  // If demo ticket token is requested and not found in database, provision it automatically
  if (!booking && ticketLinkToken === "tok_bk829173_secure_demo_link") {
    const demoBookingId = "b0000000-0000-0000-0000-000000000a12";
    const demoSeatId = "a1200000-0000-0000-0000-000000000a12";
    const demoEventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const demoSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    await supabase.from("bookings").upsert(
      {
        id: demoBookingId,
        booking_ref: "BK829173",
        user_id: "11111111-1111-1111-1111-111111111111",
        event_id: demoEventId,
        seat_id: demoSeatId,
        status: "BOOKED",
        ticket_link_token: "tok_bk829173_secure_demo_link",
        booking_secret: demoSecret,
      },
      { onConflict: "id" }
    );

    const { data: refetched } = await supabase
      .from("bookings")
      .select(
        `
        id,
        booking_ref,
        user_id,
        event_id,
        seat_id,
        status,
        booking_secret,
        seat:seats (id, label, row, col, unit_id),
        event:events (id, title, start_time, end_time, status)
      `
      )
      .eq("ticket_link_token", ticketLinkToken)
      .maybeSingle();

    if (refetched) {
      booking = refetched;
    }
  }

  if (!booking) {
    return NextResponse.json(
      { error: "Ticket not found or invalid token link" },
      { status: 404 }
    );
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json(
      {
        error: "This ticket has been cancelled",
        status: "CANCELLED",
        bookingRef: booking.booking_ref,
      },
      { status: 410 }
    );
  }

  // 2. Query settings for dynamic token lifetime (default 30 seconds)
  let lifetimeSec = 30;
  const { data: settingRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "token_lifetime_sec")
    .single();

  if (settingRow?.value) {
    const val = Number(settingRow.value);
    if (!isNaN(val) && val >= 10) {
      lifetimeSec = val;
    }
  }

  // 3. Generate HMAC-SHA256 Signed Dynamic Token
  const generated = generateDynamicToken({
    bookingId: booking.id,
    seatId: booking.seat_id,
    eventId: booking.event_id,
    bookingSecret: booking.booking_secret,
    lifetimeSec,
  });

  // 4. Log ticket generation event to hash chain
  await logAuditEvent(supabase, {
    eventType: "TICKET_GENERATED",
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    seatId: booking.seat_id,
    seatLabel: (booking.seat as any)?.label,
    actorId: booking.user_id,
    actorRole: "USER",
    status: "SUCCESS",
    meta: {
      expiresAt: generated.expiresAt,
      noncePrefix: generated.payload.nonce.slice(0, 8),
    },
  });

  return NextResponse.json({
    token: generated.token,
    expiresAt: generated.expiresAt,
    lifetimeSec,
    booking: {
      id: booking.id,
      bookingRef: booking.booking_ref,
      status: booking.status,
      seatLabel: (booking.seat as any)?.label,
      seatUnitId: (booking.seat as any)?.unit_id,
      eventTitle: (booking.event as any)?.title,
      eventStartTime: (booking.event as any)?.start_time,
    },
  });
}
