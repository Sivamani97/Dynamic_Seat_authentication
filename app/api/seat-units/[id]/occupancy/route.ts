import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, logAuditEvent } from "@/lib/supabase/server";
import { evaluateSeatState } from "@/lib/engine";
import { SeatOccupancyUpdateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const unitId = params.id;
  const supabase = getAdminClient();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = SeatOccupancyUpdateSchema.safeParse({
    ...body,
    unitId: body.unitId || unitId,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        message: parseResult.error.errors.map((e) => e.message).join(", "),
      },
      { status: 400 }
    );
  }

  const { unitSecret, pressure, eventId } = parseResult.data;

  // 1. Authenticate Unit
  const { data: seatUnit, error: uErr } = await supabase
    .from("seat_units")
    .select(
      `
      id,
      seat_id,
      secret_hash,
      status_json,
      seat:seats (id, label, screen_id)
    `
    )
    .eq("id", unitId)
    .single();

  if (uErr || !seatUnit) {
    return NextResponse.json(
      { success: false, message: "Seat unit not recognized" },
      { status: 401 }
    );
  }

  const hashedSecret = crypto.createHash("sha256").update(unitSecret).digest("hex");
  if (hashedSecret !== seatUnit.secret_hash) {
    return NextResponse.json(
      { success: false, message: "Unauthorized unit key" },
      { status: 403 }
    );
  }

  const seat = seatUnit.seat as any;

  // 2. Fetch current Seat State for this event
  const { data: seatState } = await supabase
    .from("seat_states")
    .select("*")
    .eq("seat_id", seatUnit.seat_id)
    .eq("event_id", eventId)
    .single();

  const currentOccupancy = seatState?.occupancy || "EMPTY";
  const currentAuthorization = seatState?.authorization || "UNAUTHORIZED";
  const currentState = seatState?.state || "NORMAL";
  const mismatchSince = seatState?.mismatch_since || null;

  // 3. Fetch Settings for engine thresholds
  const { data: settingsRows } = await supabase
    .from("settings")
    .select("key, value");

  const settingsMap: Record<string, any> = {};
  settingsRows?.forEach((r) => {
    settingsMap[r.key] = r.value;
  });

  const mismatchDelaySec = Number(settingsMap["mismatch_delay_sec"]) || 15;
  const pressureEmptyMax = Number(settingsMap["pressure_empty_max"]) || 19;
  const pressureUncertainMax = Number(settingsMap["pressure_uncertain_max"]) || 59;
  const pressureOccupiedMin = Number(settingsMap["pressure_occupied_min"]) || 60;

  // 4. Run Pure Engine Evaluation
  const evalResult = evaluateSeatState({
    seatId: seatUnit.seat_id,
    unitId: seatUnit.id,
    currentOccupancy,
    currentAuthorization,
    currentState,
    pressure,
    mismatchSince,
    unitStatus: seatUnit.status_json as any,
    currentTime: new Date(),
    settings: {
      mismatchDelaySec,
      pressureEmptyMax,
      pressureUncertainMax,
      pressureOccupiedMin,
    },
  });

  // 5. Persist State Changes
  const nowIso = new Date().toISOString();
  await supabase.from("seat_states").upsert(
    {
      seat_id: seatUnit.seat_id,
      event_id: eventId,
      occupancy: evalResult.newOccupancy,
      authorization: evalResult.newAuthorization,
      state: evalResult.newState,
      pressure,
      mismatch_since: evalResult.newMismatchSince,
      updated_at: nowIso,
    },
    { onConflict: "seat_id,event_id" }
  );

  // 6. Handle Generated Alerts
  if (evalResult.generatedAlert) {
    const alert = evalResult.generatedAlert;

    // Check if an active (NEW or ACKNOWLEDGED) alert of this type already exists for this seat
    const { data: existingAlert } = await supabase
      .from("alerts")
      .select("id")
      .eq("seat_id", seatUnit.seat_id)
      .eq("type", alert.type)
      .in("status", ["NEW", "ACKNOWLEDGED"])
      .maybeSingle();

    if (!existingAlert) {
      await supabase.from("alerts").insert({
        event_id: eventId,
        seat_id: seatUnit.seat_id,
        unit_id: seatUnit.id,
        type: alert.type,
        priority: alert.priority,
        status: "NEW",
        message: alert.message,
        meta: alert.meta,
      });

      // Audit log alert creation
      await logAuditEvent(supabase, {
        eventType: alert.type === "WRONG_SEAT" ? "WRONG_SEAT_DETECTED" : "ALERT_SENT",
        seatId: seatUnit.seat_id,
        seatLabel: seat?.label,
        unitId: seatUnit.id,
        actorRole: "SYSTEM",
        status: "SUCCESS",
        meta: {
          type: alert.type,
          priority: alert.priority,
          pressure,
        },
      });
    }
  }

  // 7. Auto-Resolve Cleared Alerts
  if (evalResult.autoResolveAlertTypes && evalResult.autoResolveAlertTypes.length > 0) {
    await supabase
      .from("alerts")
      .update({
        status: "RESOLVED",
        resolution_note: "Auto-resolved: condition cleared by engine state update.",
        resolved_at: nowIso,
      })
      .eq("seat_id", seatUnit.seat_id)
      .in("type", evalResult.autoResolveAlertTypes)
      .in("status", ["NEW", "ACKNOWLEDGED"]);
  }

  return NextResponse.json({
    success: true,
    occupancy: evalResult.newOccupancy,
    authorization: evalResult.newAuthorization,
    state: evalResult.newState,
    displayMessage: evalResult.seatDisplayMessage,
    privateUserMessage: evalResult.privateUserMessage,
  });
}
