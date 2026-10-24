import { SupabaseClient } from "@supabase/supabase-js";
import { logAuditEvent } from "./supabase/server";

export interface EvaluationSummary {
  expiredHoldsRemoved: number;
  mismatchesTriggered: number;
  missedHeartbeatsDetected: number;
  prolongedUncertainDetected: number;
  timestamp: string;
}

/**
 * Shared evaluation logic for Vercel Cron (/api/cron/evaluate)
 * and client-side tick fallback (/api/engine/tick).
 */
export async function runSystemEvaluation(
  supabase: SupabaseClient
): Promise<EvaluationSummary> {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Fetch system settings
  const { data: settingsRows } = await supabase
    .from("settings")
    .select("key, value");

  const settings: Record<string, number> = {
    mismatch_delay_sec: 15,
    heartbeat_timeout_sec: 30,
    prolonged_uncertain_sec: 300,
  };

  settingsRows?.forEach((r) => {
    const num = Number(r.value);
    if (!isNaN(num)) {
      settings[r.key] = num;
    }
  });

  // 2. Clean Expired Seat Holds
  const { count: deletedHoldsCount } = await supabase
    .from("seat_holds")
    .delete({ count: "exact" })
    .lt("expires_at", nowIso);

  // 3. Evaluate Pending Mismatches in Seat States
  // A seat is in mismatch if occupancy=OCCUPIED, authorization=UNAUTHORIZED, mismatch_since is set
  const { data: pendingMismatches } = await supabase
    .from("seat_states")
    .select(
      `
      id,
      seat_id,
      event_id,
      occupancy,
      authorization,
      state,
      mismatch_since,
      pressure,
      seat:seats (id, label, unit_id, screen:screens (name))
    `
    )
    .eq("occupancy", "OCCUPIED")
    .eq("authorization", "UNAUTHORIZED")
    .not("mismatch_since", "is", null);

  let mismatchesTriggered = 0;

  if (pendingMismatches && pendingMismatches.length > 0) {
    for (const item of pendingMismatches) {
      if (!item.mismatch_since) continue;
      const msElapsed = now.getTime() - new Date(item.mismatch_since).getTime();
      const secElapsed = msElapsed / 1000;

      if (secElapsed >= settings.mismatch_delay_sec) {
        // Transition to WRONG_SEAT
        await supabase
          .from("seat_states")
          .update({
            state: "WRONG_SEAT",
            updated_at: nowIso,
          })
          .eq("id", item.id);

        const seat = item.seat as any;

        // Check if alert already exists
        const { data: existingAlert } = await supabase
          .from("alerts")
          .select("id")
          .eq("seat_id", item.seat_id)
          .eq("type", "WRONG_SEAT")
          .in("status", ["NEW", "ACKNOWLEDGED"])
          .maybeSingle();

        if (!existingAlert) {
          await supabase.from("alerts").insert({
            event_id: item.event_id,
            seat_id: item.seat_id,
            unit_id: seat?.unit_id,
            type: "WRONG_SEAT",
            priority: "MEDIUM",
            status: "NEW",
            message: `Unauthorized occupancy confirmed at Seat ${seat?.label || item.seat_id}. Unclaimed seat occupied for ${Math.floor(
              secElapsed
            )}s without authorization.`,
            meta: {
              pressure: item.pressure,
              mismatchSince: item.mismatch_since,
              elapsedSeconds: Math.floor(secElapsed),
              screenName: seat?.screen?.name,
            },
          });

          await logAuditEvent(supabase, {
            eventType: "WRONG_SEAT_DETECTED",
            seatId: item.seat_id,
            seatLabel: seat?.label,
            unitId: seat?.unit_id,
            actorRole: "SYSTEM",
            status: "SUCCESS",
            meta: {
              elapsedSeconds: Math.floor(secElapsed),
              pressure: item.pressure,
            },
          });

          mismatchesTriggered++;
        }
      }
    }
  }

  // 4. Evaluate Missed Heartbeats from Seat Units
  const timeoutThresholdDate = new Date(
    now.getTime() - settings.heartbeat_timeout_sec * 1000
  ).toISOString();

  const { data: deadUnits } = await supabase
    .from("seat_units")
    .select(
      `
      id,
      seat_id,
      status_json,
      last_heartbeat,
      seat:seats (id, label)
    `
    )
    .lt("last_heartbeat", timeoutThresholdDate);

  let missedHeartbeatsDetected = 0;

  if (deadUnits && deadUnits.length > 0) {
    for (const unit of deadUnits) {
      const seat = unit.seat as any;
      const { data: existingAlert } = await supabase
        .from("alerts")
        .select("id")
        .eq("unit_id", unit.id)
        .eq("type", "COMM_FAILURE")
        .in("status", ["NEW", "ACKNOWLEDGED"])
        .maybeSingle();

      if (!existingAlert) {
        await supabase.from("alerts").insert({
          seat_id: unit.seat_id,
          unit_id: unit.id,
          type: "COMM_FAILURE",
          priority: "HIGH",
          status: "NEW",
          message: `Seat Unit ${unit.id} (Seat ${seat?.label}) missed heartbeats (> ${settings.heartbeat_timeout_sec}s). Comms offline.`,
          meta: { lastHeartbeat: unit.last_heartbeat },
        });

        await logAuditEvent(supabase, {
          eventType: "COMM_FAILURE",
          seatId: unit.seat_id,
          seatLabel: seat?.label,
          unitId: unit.id,
          actorRole: "SYSTEM",
          status: "SUCCESS",
          meta: { lastHeartbeat: unit.last_heartbeat },
        });

        missedHeartbeatsDetected++;
      }
    }
  }

  return {
    expiredHoldsRemoved: deletedHoldsCount || 0,
    mismatchesTriggered,
    missedHeartbeatsDetected,
    prolongedUncertainDetected: 0,
    timestamp: nowIso,
  };
}
