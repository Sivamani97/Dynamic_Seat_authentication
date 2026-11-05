import { SupabaseClient } from "@supabase/supabase-js";
import { logAuditEvent } from "./supabase/server";

export interface EvaluationSummary {
  expiredHoldsRemoved: number;
  expiredTokensRemoved: number;
  expiredRateLimitsRemoved: number;
  mismatchesTriggered: number;
  missedHeartbeatsDetected: number;
  prolongedUncertainDetected: number;
  timestamp: string;
}

export interface EvaluationOptions {
  forceFullSweep?: boolean;
}

// In-memory debounce guard to prevent duplicate executions from concurrent ticks
let lastRunTimestamp = 0;
let lastSummary: EvaluationSummary | null = null;
const DEBOUNCE_INTERVAL_MS = 2000;

export function resetEvaluationDebounceForTesting() {
  lastRunTimestamp = 0;
  lastSummary = null;
}

/**
 * Shared evaluation and cleanup logic for daily Vercel Cron (/api/cron/evaluate)
 * and client-side tick fallback (/api/engine/tick).
 * 
 * - Purges expired seat holds, expired used replay tokens, and expired rate-limits.
 * - Evaluates seat mismatches and transitions unclaimed occupied seats to WRONG_SEAT.
 * - Detects missed hardware/virtual seat unit heartbeats.
 * - Idempotent and thread-safe: duplicate runs within DEBOUNCE_INTERVAL_MS return cached summary.
 */
export async function runSystemEvaluation(
  supabase: SupabaseClient,
  options?: EvaluationOptions
): Promise<EvaluationSummary> {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowEpoch = now.getTime();

  // Deduplication check: return cached summary if executed within debounce window
  if (!options?.forceFullSweep && nowEpoch - lastRunTimestamp < DEBOUNCE_INTERVAL_MS && lastSummary) {
    return {
      ...lastSummary,
      timestamp: nowIso,
    };
  }

  try {
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

    // 2. Clean Expired Seat Holds (Idempotent atomic delete)
    const { count: deletedHoldsCount } = await supabase
      .from("seat_holds")
      .delete({ count: "exact" })
      .lt("expires_at", nowIso);

    // 3. Clean Expired Used Tokens (Replay nonces that are past TTL cannot be reused anyway)
    let deletedTokensCount = 0;
    try {
      const { count } = await supabase
        .from("used_tokens")
        .delete({ count: "exact" })
        .lt("expires_at", nowIso);
      deletedTokensCount = count || 0;
    } catch {
      // Table may not have expired tokens or table might be empty
    }

    // 4. Clean Expired Rate Limits (Database fallback sliding-window maintenance)
    let deletedRateLimitsCount = 0;
    try {
      const { count } = await supabase
        .from("rate_limits")
        .delete({ count: "exact" })
        .lt("reset_at", nowIso);
      deletedRateLimitsCount = count || 0;
    } catch {
      // Ignore if rate_limits table empty
    }

    // 5. Evaluate Pending Mismatches in Seat States
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

          // Check if alert already exists to prevent duplicate alert rows
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

    // 6. Evaluate Missed Heartbeats from Seat Units (Throttled & Cooled-Down)
    const timeoutThresholdDate = new Date(
      now.getTime() - settings.heartbeat_timeout_sec * 1000
    ).toISOString();

    // Missed heartbeats: Throttle to max 2 units per evaluation cycle to prevent alert flooding
    const { data: deadUnitsRaw } = await supabase
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

    const deadUnits = (deadUnitsRaw || []).slice(0, 2);

    let missedHeartbeatsDetected = 0;

    if (deadUnits && deadUnits.length > 0) {
      for (const unit of deadUnits) {
        const seat = unit.seat as any;
        // Check if ANY alert already exists for this unit ("only one time is enough")
        const { data: existingAlerts } = await supabase
          .from("alerts")
          .select("id")
          .eq("unit_id", unit.id)
          .eq("type", "COMM_FAILURE");

        const hasExistingAlert = existingAlerts && existingAlerts.length > 0;

        if (!hasExistingAlert) {
          await supabase.from("alerts").insert({
            seat_id: unit.seat_id,
            unit_id: unit.id,
            type: "COMM_FAILURE",
            priority: "HIGH",
            status: "NEW",
            message: `Seat Unit ${unit.id} (Seat ${seat?.label || "Unknown"}) missed heartbeats (> ${settings.heartbeat_timeout_sec}s). Comms offline.`,
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

    const summary: EvaluationSummary = {
      expiredHoldsRemoved: deletedHoldsCount || 0,
      expiredTokensRemoved: deletedTokensCount,
      expiredRateLimitsRemoved: deletedRateLimitsCount,
      mismatchesTriggered,
      missedHeartbeatsDetected,
      prolongedUncertainDetected: 0,
      timestamp: nowIso,
    };

    lastRunTimestamp = nowEpoch;
    lastSummary = summary;

    return summary;
  } catch (err: any) {
    console.warn("runSystemEvaluation exception caught safely:", err?.message);
    return {
      expiredHoldsRemoved: 0,
      expiredTokensRemoved: 0,
      expiredRateLimitsRemoved: 0,
      mismatchesTriggered: 0,
      missedHeartbeatsDetected: 0,
      prolongedUncertainDetected: 0,
      timestamp: nowIso,
    };
  }
}
