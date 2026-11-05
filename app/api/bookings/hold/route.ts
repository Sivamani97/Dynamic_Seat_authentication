import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { CreateHoldSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = CreateHoldSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, message: parseResult.error.errors.map((e) => e.message).join(", ") },
      { status: 400 }
    );
  }

  const { eventId, seatId } = parseResult.data;
  const now = new Date();
  const nowIso = now.toISOString();
  const holdExpiry = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

  try {
    const supabase = getAdminClient();

    // 1. Mandatory Trusted Authentication Verification
    // Never trust client-provided x-user-id headers by themselves.
    const authenticatedUser = await getAuthenticatedUser(request, supabase);
    if (!authenticatedUser || !authenticatedUser.id) {
      return NextResponse.json(
        { success: false, message: "Authentication required to hold a seat." },
        { status: 401 }
      );
    }
    const userId = authenticatedUser.id;

    // 2. Check if seat is already confirmed/booked
    const { data: existingBooking } = await supabase
      .from("bookings")
      .select("id, booking_ref")
      .eq("event_id", eventId)
      .eq("seat_id", seatId)
      .in("status", ["BOOKED", "CHECKED_IN", "SEAT_AUTHORIZED"])
      .maybeSingle();

    if (existingBooking) {
      return NextResponse.json(
        { success: false, message: "This seat has already been booked." },
        { status: 409 }
      );
    }

    // 3. Check for active seat holds using strict server-side timestamps.
    // Holds with expires_at <= nowIso are expired and ignored.
    const { data: existingHold } = await supabase
      .from("seat_holds")
      .select("id, user_id, expires_at")
      .eq("event_id", eventId)
      .eq("seat_id", seatId)
      .gt("expires_at", nowIso)
      .maybeSingle();

    // 4. Hold Ownership Enforcement
    if (existingHold) {
      // Different user owns the active hold -> HTTP 409 Conflict
      if (existingHold.user_id !== userId) {
        return NextResponse.json(
          { success: false, message: "This seat is temporarily held by another passenger during checkout." },
          { status: 409 }
        );
      }

      // Same user owns the active hold -> Allow refresh/extension
      const { data: updatedHold, error: uErr } = await supabase
        .from("seat_holds")
        .update({ expires_at: holdExpiry })
        .eq("id", existingHold.id)
        .eq("user_id", userId)
        .select()
        .single();

      if (uErr) {
        return NextResponse.json(
          { success: false, message: "Failed to extend seat hold: " + uErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        expiresAt: updatedHold?.expires_at || holdExpiry,
        holdDurationSeconds: 120,
        message: "Seat hold refreshed for 2 minutes during checkout.",
      });
    }

    // 5. Ensure seat exists before placing hold
    let resolvedSeatId = seatId;
    const { data: seatCheck } = await supabase
      .from("seats")
      .select("id")
      .eq("id", seatId)
      .maybeSingle();

    if (!seatCheck) {
      const { data: altSeat } = await supabase
        .from("seats")
        .select("id")
        .or(`unit_id.eq.${seatId},label.eq.${seatId}`)
        .maybeSingle();

      if (altSeat) {
        resolvedSeatId = altSeat.id;
      } else {
        const defaultScreenId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        const shortHex = seatId.replace(/[^A-Za-z0-9]/g, "").substring(0, 8);
        const uniqueLabel = `S-${shortHex}`;
        const uniqueUnitId = `SEAT-${shortHex}`;

        const { data: newSeat } = await supabase
          .from("seats")
          .upsert(
            {
              id: seatId,
              screen_id: defaultScreenId,
              label: uniqueLabel,
              row: "A",
              col: 1,
              unit_id: uniqueUnitId,
              type: "STANDARD",
              price: 16.0,
            },
            { onConflict: "id" }
          )
          .select("id")
          .maybeSingle();

        if (newSeat) {
          resolvedSeatId = newSeat.id;
          await supabase.from("seat_units").upsert(
            {
              id: uniqueUnitId,
              seat_id: seatId,
              secret_hash: `secret_${uniqueUnitId}`,
              status_json: { sensor: "OK", scanner: "OK", power: "OK", comms: "OK", tamper: false },
            },
            { onConflict: "id" }
          );
        }
      }
    }

    // 6. Atomically delete any expired hold for this seat before inserting new hold
    await supabase
      .from("seat_holds")
      .delete()
      .eq("event_id", eventId)
      .eq("seat_id", resolvedSeatId)
      .lte("expires_at", nowIso);

    // 7. Atomic Insert with Postgres UNIQUE (event_id, seat_id) constraint protection
    const { data: hold, error: hErr } = await supabase
      .from("seat_holds")
      .insert({
        event_id: eventId,
        seat_id: resolvedSeatId,
        user_id: userId,
        expires_at: holdExpiry,
      })
      .select()
      .single();

    if (hErr) {
      // Postgres error code 23505 indicates unique_violation: another concurrent request acquired the hold
      if (
        hErr.code === "23505" ||
        hErr.message?.includes("duplicate key") ||
        hErr.message?.includes("unique")
      ) {
        return NextResponse.json(
          { success: false, message: "This seat was just held by another passenger during checkout." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { success: false, message: "Failed to place seat hold: " + hErr.message },
        { status: 500 }
      );
    }

    // Opportunistically prune globally expired holds in background without blocking
    Promise.resolve(supabase.from("seat_holds").delete().lt("expires_at", nowIso)).catch(() => {});

    return NextResponse.json({
      success: true,
      expiresAt: hold?.expires_at || holdExpiry,
      holdDurationSeconds: 120,
      message: "Seat held for 2 minutes during checkout.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: "Internal server error: " + (err?.message || "Unknown error") },
      { status: 500 }
    );
  }
}
