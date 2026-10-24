import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, logAuditEvent } from "@/lib/supabase/server";
import { verifyDynamicToken } from "@/lib/tokens";
import { ScanSeatSchema } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

  // 1. Rate Limiting Check
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, reasonCode: "BAD_REQUEST", message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = ScanSeatSchema.safeParse(body);
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

  const { token, unitId, unitSecret } = parseResult.data;

  const rateLimit = await checkRateLimit(`scan_seat_${unitId}`, supabase, 40, 60);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        success: false,
        reasonCode: "RATE_LIMITED",
        message: "Seat unit scanning rate limit exceeded. Please wait.",
      },
      { status: 429 }
    );
  }

  // 2. Authenticate Virtual Seat Unit
  const { data: seatUnit, error: uErr } = await supabase
    .from("seat_units")
    .select(
      `
      id,
      seat_id,
      secret_hash,
      status_json,
      seat:seats (id, label, row, col, screen_id)
    `
    )
    .eq("id", unitId)
    .single();

  if (uErr || !seatUnit) {
    return NextResponse.json(
      {
        success: false,
        reasonCode: "INVALID_SEAT_UNIT",
        message: `Virtual seat unit ${unitId} is not recognized.`,
      },
      { status: 401 }
    );
  }

  const hashedProvidedSecret = crypto
    .createHash("sha256")
    .update(unitSecret)
    .digest("hex");

  if (hashedProvidedSecret !== seatUnit.secret_hash) {
    return NextResponse.json(
      {
        success: false,
        reasonCode: "INVALID_UNIT_SECRET",
        message: "Invalid API key/secret for this seat unit.",
      },
      { status: 403 }
    );
  }

  const seat = seatUnit.seat as any;

  // 3. Decode Token Payload
  let rawPayload: any;
  try {
    const [payloadB64] = token.split(".");
    const decoded = Buffer.from(payloadB64, "base64url").toString("utf8");
    rawPayload = JSON.parse(decoded);
  } catch {
    await logAuditEvent(supabase, {
      eventType: "SEAT_SCAN_DENIED",
      unitId,
      seatId: seatUnit.seat_id,
      seatLabel: seat?.label,
      status: "FAILED",
      actorRole: "SYSTEM",
      meta: { reason: "CORRUPT_TOKEN" },
    });
    return NextResponse.json(
      {
        success: false,
        reasonCode: "INVALID_FORMAT",
        message: "QR code payload is corrupted.",
      },
      { status: 400 }
    );
  }

  // 4. Fetch Booking
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
      seat:seats (id, label),
      event:events (id, title, status)
    `
    )
    .eq("id", rawPayload.bid)
    .single();

  if (bErr || !booking) {
    await logAuditEvent(supabase, {
      eventType: "SEAT_SCAN_DENIED",
      unitId,
      seatId: seatUnit.seat_id,
      seatLabel: seat?.label,
      status: "FAILED",
      actorRole: "SYSTEM",
      meta: { reason: "BOOKING_NOT_FOUND", bid: rawPayload.bid },
    });
    return NextResponse.json(
      {
        success: false,
        reasonCode: "BOOKING_NOT_FOUND",
        message: "Booking record not found.",
      },
      { status: 404 }
    );
  }

  // 5. CRITICAL CHECK: Does Token Seat Match Scanning Unit's Seat?
  // e.g. A12 credential scanned at A13 must fail and log WRONG_SEAT_SCAN!
  if (booking.seat_id !== seatUnit.seat_id || rawPayload.sid !== seatUnit.seat_id) {
    await logAuditEvent(supabase, {
      eventType: "WRONG_SEAT_SCAN",
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      seatId: seatUnit.seat_id,
      seatLabel: seat?.label,
      unitId,
      status: "FAILED",
      actorRole: "SYSTEM",
      meta: {
        bookedSeatId: booking.seat_id,
        bookedSeatLabel: (booking.seat as any)?.label,
        scannedUnitSeatId: seatUnit.seat_id,
        scannedUnitSeatLabel: seat?.label,
      },
    });

    return NextResponse.json(
      {
        success: false,
        reasonCode: "WRONG_SEAT_SCAN",
        message: `This ticket is reserved for Seat ${(booking.seat as any)?.label || "another seat"}, but scanned at Seat ${seat?.label}.`,
        assignedSeatLabel: (booking.seat as any)?.label,
        currentSeatLabel: seat?.label,
      },
      { status: 400 }
    );
  }

  // 6. Cryptographically Verify Signature and Expiration (+-5s clock skew)
  const verifyResult = verifyDynamicToken(token, booking.booking_secret, {
    clockSkewSec: 5,
  });

  if (!verifyResult.valid || !verifyResult.payload) {
    await logAuditEvent(supabase, {
      eventType: "SEAT_SCAN_DENIED",
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      seatId: seatUnit.seat_id,
      seatLabel: seat?.label,
      unitId,
      status: "FAILED",
      actorRole: "SYSTEM",
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
            ? "Dynamic ticket token expired. Please scan fresh dynamic QR."
            : "Cryptographic signature mismatch. Token not authentic.",
      },
      { status: 401 }
    );
  }

  // 7. Check Booking Status
  if (booking.status === "CANCELLED") {
    return NextResponse.json(
      {
        success: false,
        reasonCode: "TICKET_CANCELLED",
        message: "This ticket has been cancelled.",
      },
      { status: 410 }
    );
  }

  // 8. Replay Check in used_tokens
  const expiresAtDate = new Date(verifyResult.payload.exp * 1000).toISOString();
  const { error: nonceError } = await supabase.from("used_tokens").insert({
    nonce: verifyResult.payload.nonce,
    booking_id: booking.id,
    used_for: "SEAT",
    expires_at: expiresAtDate,
  });

  if (nonceError) {
    await logAuditEvent(supabase, {
      eventType: "SEAT_SCAN_DENIED",
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      seatId: seatUnit.seat_id,
      seatLabel: seat?.label,
      unitId,
      status: "FAILED",
      actorRole: "SYSTEM",
      meta: { reason: "REPLAYED_TOKEN", nonce: verifyResult.payload.nonce },
    });

    return NextResponse.json(
      {
        success: false,
        reasonCode: "REPLAYED_TOKEN",
        message: "Dynamic QR nonce already utilized. Screenshot replay rejected.",
      },
      { status: 409 }
    );
  }

  // 9. Update Booking Status: SEAT_AUTHORIZED
  const nowIso = new Date().toISOString();
  await supabase
    .from("bookings")
    .update({
      status: "SEAT_AUTHORIZED",
      seat_authorized_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", booking.id);

  // 10. Update Seat State: Authorization = 'AUTHORIZED', state = 'AUTHORIZED'
  await supabase
    .from("seat_states")
    .upsert(
      {
        seat_id: seatUnit.seat_id,
        event_id: booking.event_id,
        authorization: "AUTHORIZED",
        state: "AUTHORIZED",
        mismatch_since: null, // Clear any pending mismatch timer
        updated_at: nowIso,
      },
      { onConflict: "seat_id,event_id" }
    );

  // 11. Auto-resolve any existing WRONG_SEAT alerts for this seat
  await supabase
    .from("alerts")
    .update({
      status: "RESOLVED",
      resolution_note: "Auto-resolved: Seat authorized by passenger QR scan.",
      resolved_at: nowIso,
    })
    .eq("seat_id", seatUnit.seat_id)
    .eq("status", "NEW")
    .eq("type", "WRONG_SEAT");

  // 12. Log SEAT_AUTHORIZED to Immutable Hash Chain
  await logAuditEvent(supabase, {
    eventType: "SEAT_AUTHORIZED",
    bookingId: booking.id,
    bookingRef: booking.booking_ref,
    seatId: seatUnit.seat_id,
    seatLabel: seat?.label,
    unitId,
    status: "SUCCESS",
    actorRole: "SYSTEM",
    meta: {
      seatAuthorizedAt: nowIso,
      seatLabel: seat?.label,
      bookingRef: booking.booking_ref,
    },
  });

  return NextResponse.json({
    success: true,
    message: "SEAT AUTHORIZED",
    status: "SEAT_AUTHORIZED",
    bookingRef: booking.booking_ref,
    seatLabel: seat?.label,
    displayMessage: `Seat ${seat?.label} ✓ Seat Verified`,
  });
}
