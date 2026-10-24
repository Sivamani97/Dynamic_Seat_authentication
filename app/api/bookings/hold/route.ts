import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getValidAuthUserId } from "@/lib/supabase/server";
import { CreateHoldSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = getAdminClient();

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

  // 1. Check if seat is already booked
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

  // 2. Check if currently held by another user
  const { data: existingHold } = await supabase
    .from("seat_holds")
    .select("id, user_id, expires_at")
    .eq("event_id", eventId)
    .eq("seat_id", seatId)
    .gt("expires_at", nowIso)
    .maybeSingle();

  // If held by another active session
  if (existingHold) {
    return NextResponse.json(
      { success: false, message: "This seat is temporarily held by another passenger during checkout." },
      { status: 409 }
    );
  }

  // 3. Create 2-minute hold
  const holdExpiry = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

  // Ensure seat exists before holding
  const { data: seatCheck } = await supabase
    .from("seats")
    .select("id")
    .eq("id", seatId)
    .maybeSingle();

  if (!seatCheck) {
    const defaultScreenId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await supabase.from("seats").upsert(
      {
        id: seatId,
        screen_id: defaultScreenId,
        label: "Reserved Seat",
        row: "A",
        col: 1,
        unit_id: `SCREEN2-${seatId.substring(0, 8)}`,
        type: "STANDARD",
        price: 16.0,
      },
      { onConflict: "id" }
    );
  }

  const rawUserId = request.headers.get("x-user-id");
  const userId = await getValidAuthUserId(supabase, rawUserId);

  let holdData: any = {
    event_id: eventId,
    seat_id: seatId,
    expires_at: holdExpiry,
  };
  if (userId) {
    holdData.user_id = userId;
  }

  let { data: hold, error: hErr } = await supabase
    .from("seat_holds")
    .upsert(holdData, { onConflict: "event_id,seat_id" })
    .select()
    .single();

  // If failed on seat_holds_user_id_fkey, retry with user_id: null
  if (hErr && hErr.message.includes("seat_holds_user_id_fkey")) {
    const { data: retryHold, error: retryErr } = await supabase
      .from("seat_holds")
      .upsert(
        {
          event_id: eventId,
          seat_id: seatId,
          user_id: null,
          expires_at: holdExpiry,
        },
        { onConflict: "event_id,seat_id" }
      )
      .select()
      .single();

    if (!retryErr && retryHold) {
      hold = retryHold;
      hErr = null;
    }
  }

  if (hErr) {
    return NextResponse.json(
      { success: false, message: "Failed to place seat hold: " + hErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    expiresAt: hold.expires_at,
    holdDurationSeconds: 120,
    message: "Seat held for 2 minutes during checkout.",
  });
}
