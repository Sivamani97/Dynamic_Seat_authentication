import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logAuditEvent } from "@/lib/supabase/server";
import { verifyDynamicToken } from "@/lib/tokens";
import { ScanEntrySchema } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  // 1. Rate Limiting Check (by client IP or fallback header)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateLimit = await checkRateLimit(`scan_entry_${ip}`, supabase, 30, 60);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        success: false,
        reasonCode: "RATE_LIMITED",
        message: "Too many scan attempts. Please wait before retrying.",
      },
      { status: 429 }
    );
  }

  // 2. Validate Request Body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, reasonCode: "BAD_REQUEST", message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = ScanEntrySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        reasonCode: "VALIDATION_FAILED",
        message: parseResult.error.errors.map((e) => e.message).join(", "),
      },
      { status: 400 }
    );
  }

  const { token, eventId } = parseResult.data;

  // 3. Fast-decode token payload without verification first to retrieve booking record
  let rawPayload: any;
  try {
    const [payloadB64] = token.split(".");
    const decoded = Buffer.from(payloadB64, "base64url").toString("utf8");
    rawPayload = JSON.parse(decoded);
  } catch (err) {
    await logAuditEvent(supabase, {
      eventType: "ENTRY_DENIED",
      status: "FAILED",
      actorRole: "STAFF",
      meta: { reason: "CORRUPT_TOKEN_FORMAT" },
    });
    return NextResponse.json(
      {
        success: false,
        reasonCode: "INVALID_FORMAT",
        message: "QR code payload is corrupted or invalid format.",
      },
      { status: 400 }
    );
  }

  // 4. Fetch Booking Record & Secret
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
      booking_secret,
      checked_in_at,
      seat:seats (id, label, row, col, unit_id),
      event:events (id, title, start_time, end_time, status)
    `
    )
    .eq("id", rawPayload.bid)
    .single();

  if (bErr || !booking) {
    await logAuditEvent(supabase, {
      eventType: "ENTRY_DENIED",
      status: "FAILED",
      actorRole: "STAFF",
      meta: { reason: "BOOKING_NOT_FOUND", bid: rawPayload.bid },
    });
    return NextResponse.json(
      {
        success: false,
        reasonCode: "BOOKING_NOT_FOUND",
        message: "Booking record does not exist in system.",
      },
      { status: 404 }
    );
  }

  // 5. Cryptographically Verify Signature and Expiration (+-5s clock skew)
  const verifyResult = verifyDynamicToken(token, booking.booking_secret, {
    clockSkewSec: 5,
  });

  if (!verifyResult.valid || !verifyResult.payload) {
    await logAuditEvent(supabase, {
      eventType: "ENTRY_DENIED",
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      seatId: booking.seat_id,
      seatLabel: (booking.seat as any)?.label,
      actorRole: "STAFF",
      status: "FAILED",
      meta: {
        reasonCode: verifyResult.reasonCode,
        reasonMessage: verifyResult.reasonMessage,
      },
    });

    return NextResponse.json(
      {
        success: false,
        reasonCode: verifyResult.reasonCode,
        message:
          verifyResult.reasonCode === "TOKEN_EXPIRED"
            ? "Dynamic ticket QR has expired. Please refresh the ticket screen."
            : "Cryptographic signature mismatch. Possible fraudulent or forged ticket.",
      },
      { status: 401 }
    );
  }

  const payload = verifyResult.payload;

  // 6. Check Event Match
  if (booking.event_id !== eventId || payload.eid !== eventId) {
    await logAuditEvent(supabase, {
      eventType: "ENTRY_DENIED",
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      actorRole: "STAFF",
      status: "FAILED",
      meta: { reason: "WRONG_EVENT", scannedEventId: eventId, ticketEventId: booking.event_id },
    });

    return NextResponse.json(
      {
        success: false,
        reasonCode: "WRONG_EVENT",
        message: "This ticket is for a different event or showtime.",
      },
      { status: 400 }
    );
  }

  // 7. Check Cancellation
  if (booking.status === "CANCELLED") {
    await logAuditEvent(supabase, {
      eventType: "ENTRY_DENIED",
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      actorRole: "STAFF",
      status: "FAILED",
      meta: { reason: "TICKET_CANCELLED" },
    });

    return NextResponse.json(
      {
        success: false,
        reasonCode: "TICKET_CANCELLED",
        message: "This booking was previously cancelled and is void.",
      },
      { status: 410 }
    );
  }

  // 8. Check Status & Recheck double check-in
  if (booking.status === "CHECKED_IN" || booking.status === "SEAT_AUTHORIZED") {
    await logAuditEvent(supabase, {
      eventType: "ENTRY_DENIED",
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      actorRole: "STAFF",
      status: "FAILED",
      meta: {
        reason: "ALREADY_CHECKED_IN",
        checkedInAt: booking.checked_in_at,
      },
    });

    return NextResponse.json(
      {
        success: false,
        reasonCode: "ALREADY_CHECKED_IN",
        message: `Passenger already checked in at ${booking.checked_in_at || "earlier"}.`,
        bookingRef: booking.booking_ref,
      },
      { status: 409 }
    );
  }

  // 9. Replay Check: Atomic insert into used_tokens (nonce is PRIMARY KEY)
  const expiresAtDate = new Date(payload.exp * 1000).toISOString();
  const { error: nonceError } = await supabase.from("used_tokens").insert({
    nonce: payload.nonce,
    booking_id: booking.id,
    used_for: "ENTRY",
    expires_at: expiresAtDate,
  });

  if (nonceError) {
    // Primary key conflict indicates replay attack!
    await logAuditEvent(supabase, {
      eventType: "ENTRY_DENIED",
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      actorRole: "STAFF",
      status: "FAILED",
      meta: {
        reason: "REPLAYED_TOKEN",
        nonce: payload.nonce,
      },
    });

    return NextResponse.json(
      {
        success: false,
        reasonCode: "REPLAYED_TOKEN",
        message: "This dynamic QR code nonce has already been used. Screenshot/replay rejected.",
      },
      { status: 409 }
    );
  }

  // 10. Update Booking to CHECKED_IN
  const nowIso = new Date().toISOString();
  await supabase
    .from("bookings")
    .update({
      status: "CHECKED_IN",
      checked_in_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", booking.id);

  // 11. Log Success in Audit Hash Chain
  await logAuditEvent(supabase, {
    eventType: "ENTRY_VERIFIED",
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    seatId: booking.seat_id,
    seatLabel: (booking.seat as any)?.label,
    actorRole: "STAFF",
    status: "SUCCESS",
    meta: {
      checkedInAt: nowIso,
      eventTitle: (booking.event as any)?.title,
      seatLabel: (booking.seat as any)?.label,
    },
  });

  return NextResponse.json({
    success: true,
    bookingRef: booking.booking_ref,
    seatLabel: (booking.seat as any)?.label,
    eventTitle: (booking.event as any)?.title,
    message: "ENTRY AUTHORIZED",
    status: "CHECKED_IN",
  });
}
