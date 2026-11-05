import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, logAuditEvent, getAuthenticatedUser } from "@/lib/supabase/server";
import { generateDynamicToken, verifyDynamicToken } from "@/lib/tokens";
import { ScanEntrySchema } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  // 1. Enforce Staff/Admin Authentication
  const user = await getAuthenticatedUser(request, supabase);
  if (!user) {
    return NextResponse.json(
      {
        success: false,
        reasonCode: "UNAUTHORIZED",
        message: "Staff or Admin authentication required for entry gate scanning.",
      },
      { status: 401 }
    );
  }

  if (!["STAFF", "ADMIN"].includes(user.role)) {
    return NextResponse.json(
      {
        success: false,
        reasonCode: "FORBIDDEN",
        message: "Passengers are not authorized to operate entry gate scanners.",
      },
      { status: 403 }
    );
  }

  // 2. Rate Limiting Check (by client IP or fallback header)
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

  let token = parseResult.data.token.trim();
  const { eventId } = parseResult.data;

  // 2.1 Smart URL normalization: extract raw token if a full URL was scanned
  try {
    if (token.startsWith("http://") || token.startsWith("https://")) {
      const u = new URL(token);
      const qToken = u.searchParams.get("token");
      if (qToken) {
        token = qToken.trim();
      } else {
        const m = u.pathname.match(/\/t\/([^/?#]+)/);
        if (m && m[1]) {
          token = m[1].trim();
        }
      }
    }
  } catch {}

  // 2.2 Bridge ticket link token: if ticket_link_token was scanned, generate a fresh active token
  if (token.startsWith("tok_")) {
    const { data: bData } = await supabase
      .from("bookings")
      .select("id, seat_id, event_id, booking_secret")
      .eq("ticket_link_token", token)
      .maybeSingle();

    if (bData) {
      const dynamicTokenObj = generateDynamicToken({
        bookingId: bData.id,
        seatId: bData.seat_id,
        eventId: bData.event_id,
        bookingSecret: bData.booking_secret,
        lifetimeSec: 30,
      });
      token = dynamicTokenObj.token;
    }
  }

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
      actorId: user.id,
      actorRole: user.role,
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
      seat:seats (id, label, row, col, unit_id, screen:screens (id, name, venue:venues (id, name))),
      event:events (id, title, start_time, end_time, status)
    `
    )
    .eq("id", rawPayload.bid)
    .single();

  if (bErr || !booking) {
    await logAuditEvent(supabase, {
      eventType: "ENTRY_DENIED",
      status: "FAILED",
      actorId: user.id,
      actorRole: user.role,
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
      actorId: user.id,
      actorRole: user.role,
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

  // 6. Check Event Match (enforced when a specific event gate is targeted)
  if (eventId && eventId !== "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee") {
    if (booking.event_id !== eventId || payload.eid !== eventId) {
      await logAuditEvent(supabase, {
        eventType: "ENTRY_DENIED",
        bookingId: booking.id,
        bookingRef: booking.booking_ref,
        actorId: user.id,
        actorRole: user.role,
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
  }

  // 7. Check Cancellation
  if (booking.status === "CANCELLED") {
    await logAuditEvent(supabase, {
      eventType: "ENTRY_DENIED",
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      actorId: user.id,
      actorRole: user.role,
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
      actorId: user.id,
      actorRole: user.role,
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
      actorId: user.id,
      actorRole: user.role,
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

  // 10. Update Booking to CHECKED_IN dynamically
  const nowIso = new Date().toISOString();
  await supabase
    .from("bookings")
    .update({
      status: "CHECKED_IN",
      checked_in_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", booking.id);

  // 10.1 Update Seat State: OCCUPIED & AUTHORIZED dynamically in database
  try {
    await supabase
      .from("seat_states")
      .upsert(
        {
          seat_id: booking.seat_id,
          event_id: booking.event_id,
          occupancy: "OCCUPIED",
          authorization: "AUTHORIZED",
          state: "NORMAL",
          updated_at: nowIso,
        },
        { onConflict: "seat_id,event_id" }
      );
  } catch {}

  // 10.2 Fetch Passenger Profile Name
  let passengerName = "Passenger";
  if (booking.user_id) {
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", booking.user_id)
        .maybeSingle();
      if (prof?.name) passengerName = prof.name;
    } catch {}
  }

  const seatObj = booking.seat as any;
  const eventObj = booking.event as any;

  // 11. Log Success in Audit Hash Chain
  await logAuditEvent(supabase, {
    eventType: "ENTRY_VERIFIED",
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    seatId: booking.seat_id,
    seatLabel: seatObj?.label,
    actorId: user.id,
    actorRole: user.role,
    status: "SUCCESS",
    meta: {
      checkedInAt: nowIso,
      eventTitle: eventObj?.title,
      seatLabel: seatObj?.label,
      passengerName,
    },
  });

  return NextResponse.json({
    success: true,
    status: "CHECKED_IN",
    bookingRef: booking.booking_ref,
    passengerName,
    seatLabel: seatObj?.label || "A12",
    row: seatObj?.row || "A",
    col: seatObj?.col || 12,
    screenName: seatObj?.screen?.name || eventObj?.screen?.name || "Screen 2",
    venueName: seatObj?.screen?.venue?.name || "Cinema Multiplex",
    eventTitle: eventObj?.title || "Movie / Show",
    eventStartTime: eventObj?.start_time,
    checkedInAt: nowIso,
    message: "ENTRY AUTHORIZED",
    displayMessage: `✓ Pass Verified for ${seatObj?.label || "Seat"} — Gate Access Granted`,
  });
}
