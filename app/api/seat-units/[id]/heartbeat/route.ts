import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, logAuditEvent } from "@/lib/supabase/server";
import { SeatHeartbeatSchema } from "@/lib/schemas";
import { AlertType, AlertPriority } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const unitId = params.id;
  const supabase = getAdminClient();

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = SeatHeartbeatSchema.safeParse({
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

  const { unitSecret, status } = parseResult.data;

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
    return NextResponse.json({ success: false, message: "Unit not found" }, { status: 404 });
  }

  const hashedSecret = crypto.createHash("sha256").update(unitSecret).digest("hex");
  if (hashedSecret !== seatUnit.secret_hash) {
    return NextResponse.json({ success: false, message: "Unauthorized unit secret" }, { status: 403 });
  }

  const seat = seatUnit.seat as any;
  const nowIso = new Date().toISOString();

  // 2. Update Heartbeat Timestamp and Status JSON
  await supabase
    .from("seat_units")
    .update({
      status_json: status,
      last_heartbeat: nowIso,
    })
    .eq("id", unitId);

  // 3. Evaluate Fault Injections & Tamper Flag
  const generatedAlerts: { type: AlertType; priority: AlertPriority; message: string }[] = [];

  if (status.tamper) {
    generatedAlerts.push({
      type: "TAMPER",
      priority: "CRITICAL",
      message: `Physical tamper switch tripped at Seat ${seat?.label} (Unit ${unitId})! Possible hardware enclosure breach.`,
    });
  }

  if (status.sensor !== "OK") {
    generatedAlerts.push({
      type: "SENSOR_FAILURE",
      priority: "HIGH",
      message: `Occupancy Sensor OFFLINE at Seat ${seat?.label}. Please inspect the seat.`,
    });
  }

  if (status.scanner !== "OK") {
    generatedAlerts.push({
      type: "SCANNER_FAILURE",
      priority: "MEDIUM",
      message: `Seat Barcode/QR Scanner OFFLINE at Seat ${seat?.label}. Manual verification may be required.`,
    });
  }

  if (status.power === "OUTAGE" || status.power === "LOW_BATTERY") {
    generatedAlerts.push({
      type: "POWER_FAILURE",
      priority: status.power === "OUTAGE" ? "HIGH" : "LOW",
      message:
        status.power === "OUTAGE"
          ? `Seat Unit ${unitId} (Seat ${seat?.label}) Power Outage. Running on internal supercapacitor.`
          : `Seat Unit ${unitId} (Seat ${seat?.label}) Low Battery Warning.`,
    });
  }

  if (status.comms === "DISCONNECTED") {
    generatedAlerts.push({
      type: "COMM_FAILURE",
      priority: "HIGH",
      message: `Virtual Seat Unit ${unitId} (Seat ${seat?.label}) Lost Connectivity Link.`,
    });
  }

  // 4. Upsert Alerts and Log Faults to Immutable Hash Chain
  for (const al of generatedAlerts) {
    // Check if duplicate active alert exists
    const { data: existing } = await supabase
      .from("alerts")
      .select("id")
      .eq("seat_id", seatUnit.seat_id)
      .eq("type", al.type)
      .in("status", ["NEW", "ACKNOWLEDGED"])
      .maybeSingle();

    if (!existing) {
      await supabase.from("alerts").insert({
        seat_id: seatUnit.seat_id,
        unit_id: seatUnit.id,
        type: al.type,
        priority: al.priority,
        status: "NEW",
        message: al.message,
        meta: { statusReported: status },
      });

      await logAuditEvent(supabase, {
        eventType: al.type === "TAMPER" ? "TAMPERING" : "SENSOR_FAILURE",
        seatId: seatUnit.seat_id,
        seatLabel: seat?.label,
        unitId: seatUnit.id,
        actorRole: "SYSTEM",
        status: "SUCCESS",
        meta: {
          type: al.type,
          priority: al.priority,
          message: al.message,
        },
      });
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: nowIso,
    statusReported: status,
    activeFaults: generatedAlerts.length,
  });
}
