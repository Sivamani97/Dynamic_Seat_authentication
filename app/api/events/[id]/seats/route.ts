import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getAdminClient();
  const eventId = params.id;

  try {
    // 1. Fetch Event
    let { data: event } = await supabase
      .from("events")
      .select("id, screen_id, title, status, start_time, screen:screens (name, venue:venues (name))")
      .eq("id", eventId)
      .maybeSingle();

    // Default to seeded event if param is demo or not found
    const targetEventId = event?.id || "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const targetScreenId = event?.screen_id || "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

    // 2. Fetch Seats for screen
    let { data: seats, error: sErr } = await supabase
      .from("seats")
      .select("id, screen_id, label, row, col, unit_id, type, price")
      .eq("screen_id", targetScreenId)
      .order("row", { ascending: true })
      .order("col", { ascending: true });

    // If no seats found in database (e.g. before seed), auto-generate deterministic seats
    if (!seats || seats.length === 0) {
      const generatedSeats: any[] = [];
      const generatedUnits: any[] = [];
      const rows = ["A", "B", "C", "D", "E"];

      const screenName = (event?.screen as any)?.name;
      const screenSlug = screenName
        ? screenName.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()
        : targetScreenId.slice(0, 8).toUpperCase();
      const screenHex = targetScreenId.replace(/-/g, "").slice(0, 8);

      for (const r of rows) {
        for (let c = 1; c <= 12; c++) {
          const label = `${r}${c}`;
          const isVip = r === "D" || r === "E";
          const rHex = r.charCodeAt(0).toString(16).padStart(4, "0");
          const cHex = c.toString(16).padStart(12, "0");
          const isScreen2 = targetScreenId === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
          const deterministicId =
            isScreen2 && label === "A12"
              ? "a1200000-0000-0000-0000-000000000a12"
              : isScreen2 && label === "A13"
              ? "a1300000-0000-0000-0000-000000000a13"
              : isScreen2 && label === "B4"
              ? "b0400000-0000-0000-0000-000000000b04"
              : `${screenHex}-${rHex}-0000-0000-${cHex}`;

          const unitId = `${screenSlug}-${label}`;

          generatedSeats.push({
            id: deterministicId,
            screen_id: targetScreenId,
            label,
            row: r,
            col: c,
            unit_id: unitId,
            type: isVip ? "VIP" : "STANDARD",
            price: isVip ? 22.5 : 16.0,
          });

          generatedUnits.push({
            id: unitId,
            seat_id: deterministicId,
            secret_hash: `unit_secret_${unitId}`,
            status_json: { sensor: "OK", scanner: "OK", power: "OK", comms: "OK", tamper: false },
          });
        }
      }

      // Upsert into public.seats and public.seat_units so foreign keys work
      await supabase.from("seats").upsert(generatedSeats, { onConflict: "id" });
      await supabase.from("seat_units").upsert(generatedUnits, { onConflict: "id" });
      seats = generatedSeats;
    }

    // 3. Fetch Booked Seats for this Event
    const { data: bookings } = await supabase
      .from("bookings")
      .select("seat_id, status")
      .eq("event_id", targetEventId)
      .in("status", ["BOOKED", "CHECKED_IN", "SEAT_AUTHORIZED"]);

    const bookedSeatIds = new Set(bookings?.map((b) => b.seat_id) || []);

    // 4. Fetch Active Holds for this Event (expired holds are dynamically excluded)
    const nowIso = new Date().toISOString();
    const { data: holds } = await supabase
      .from("seat_holds")
      .select("seat_id")
      .eq("event_id", targetEventId)
      .gt("expires_at", nowIso);

    // Opportunistically prune expired holds in background without blocking seat map query
    Promise.resolve(supabase.from("seat_holds").delete().lt("expires_at", nowIso)).catch(() => {});

    const heldSeatIds = new Set(holds?.map((h) => h.seat_id) || []);

    // 5. Annotate seats with booking/hold status
    const annotatedSeats = seats.map((s) => ({
      ...s,
      isBooked: bookedSeatIds.has(s.id),
      isHeld: heldSeatIds.has(s.id),
    }));

    return NextResponse.json({
      eventId: targetEventId,
      event,
      seats: annotatedSeats,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load seats" },
      { status: 500 }
    );
  }
}
