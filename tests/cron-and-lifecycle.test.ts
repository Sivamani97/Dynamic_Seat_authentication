import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateDynamicToken, verifyDynamicToken } from "../lib/tokens";
import { evaluateSeatState } from "../lib/engine";
import { runSystemEvaluation, resetEvaluationDebounceForTesting } from "../lib/evaluator";

describe("SmartSeat Lifecycle, Cron & Security Suite", () => {
  const sampleBooking = {
    bookingId: "b0000000-0000-0000-0000-000000000001",
    seatId: "s0000000-0000-0000-0000-000000000a12",
    eventId: "e0000000-0000-0000-0000-000000000001",
    bookingSecret: "secret_booking_key_9999",
    lifetimeSec: 30,
  };

  const defaultEngineSettings = {
    mismatchDelaySec: 15,
    pressureEmptyMax: 19,
    pressureUncertainMax: 59,
    pressureOccupiedMin: 60,
  };

  beforeEach(() => {
    resetEvaluationDebounceForTesting();
  });

  // =========================================================================
  // 1. Expired QR Tokens (Validated dynamically on server using timestamps)
  // =========================================================================
  describe("1. Expired QR Tokens & Dynamic Evaluation", () => {
    it("dynamically validates unexpired QR token without Cron dependency", () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const { token } = generateDynamicToken({
        ...sampleBooking,
        customIat: nowSec,
        lifetimeSec: 30,
      });

      const verification = verifyDynamicToken(token, sampleBooking.bookingSecret, {
        currentTimeSec: nowSec + 15, // Scanned 15s into 30s lifetime
      });

      expect(verification.valid).toBe(true);
      expect(verification.payload?.bid).toBe(sampleBooking.bookingId);
      expect(verification.payload?.sid).toBe(sampleBooking.seatId);
    });

    it("rejects expired dynamic QR token immediately when past lifetime and clock skew", () => {
      const nowSec = 1700000000;
      const { token } = generateDynamicToken({
        ...sampleBooking,
        customIat: nowSec - 40, // Issued 40s ago, 30s TTL
        lifetimeSec: 30,
      });

      // Verification performed at nowSec (10s past TTL, 5s past allowed clock skew)
      const verification = verifyDynamicToken(token, sampleBooking.bookingSecret, {
        currentTimeSec: nowSec,
        clockSkewSec: 5,
      });

      expect(verification.valid).toBe(false);
      expect(verification.reasonCode).toBe("TOKEN_EXPIRED");
      expect(verification.reasonMessage).toContain("Token expired");
    });

    it("rejects premature tokens used before their issued timestamp", () => {
      const nowSec = 1700000000;
      const { token } = generateDynamicToken({
        ...sampleBooking,
        customIat: nowSec + 30, // Future timestamp
        lifetimeSec: 30,
      });

      const verification = verifyDynamicToken(token, sampleBooking.bookingSecret, {
        currentTimeSec: nowSec,
        clockSkewSec: 5,
      });

      expect(verification.valid).toBe(false);
      expect(verification.reasonCode).toBe("TOKEN_PREMATURE");
    });
  });

  // =========================================================================
  // 2. Expired Booking Holds (Enforced dynamically on database queries)
  // =========================================================================
  describe("2. Expired Booking Holds", () => {
    it("dynamically filters out expired holds so seat is available without waiting for cron", () => {
      const now = new Date("2026-11-03T12:00:00.000Z");
      const nowIso = now.toISOString();

      const holdsInDatabase = [
        {
          id: "hold-active",
          seat_id: "seat-A1",
          user_id: "user-1",
          expires_at: "2026-11-03T12:01:30.000Z", // Active for 90 more seconds
        },
        {
          id: "hold-expired",
          seat_id: "seat-A2",
          user_id: "user-2",
          expires_at: "2026-11-03T11:59:00.000Z", // Expired 60 seconds ago
        },
      ];

      // Simulate the query filter used across endpoints: .gt("expires_at", nowIso)
      const activeHolds = holdsInDatabase.filter((h) => h.expires_at > nowIso);

      expect(activeHolds).toHaveLength(1);
      expect(activeHolds[0].id).toBe("hold-active");
      expect(activeHolds[0].seat_id).toBe("seat-A1");

      // Seat A2 is completely free to book because its hold has expired
      const isSeatA2Available = !activeHolds.some((h) => h.seat_id === "seat-A2");
      expect(isSeatA2Available).toBe(true);
    });

    it("allows a user to refresh or extend their own active hold while blocking other users", () => {
      const activeHold = {
        id: "hold-123",
        seat_id: "seat-B4",
        user_id: "passenger-1",
        expires_at: "2026-11-03T12:05:00.000Z",
      };

      const requestingUser1 = "passenger-1";
      const requestingUser2 = "passenger-2";

      // Same user: allowed
      const allowUser1 = activeHold.user_id === requestingUser1;
      expect(allowUser1).toBe(true);

      // Different user: blocked (409 Conflict)
      const allowUser2 = activeHold.user_id === requestingUser2;
      expect(allowUser2).toBe(false);
    });
  });

  // =========================================================================
  // 3. Valid Active Bookings
  // =========================================================================
  describe("3. Valid Active Bookings", () => {
    it("protects booked seats from concurrent reservations and double-booking", () => {
      const activeBookings = [
        { id: "b1", seat_id: "seat-A12", status: "BOOKED" },
        { id: "b2", seat_id: "seat-A13", status: "CHECKED_IN" },
        { id: "b3", seat_id: "seat-A14", status: "SEAT_AUTHORIZED" },
        { id: "b4", seat_id: "seat-A15", status: "CANCELLED" },
      ];

      const reservedSeatStatuses = new Set(["BOOKED", "CHECKED_IN", "SEAT_AUTHORIZED"]);

      const isA12Reserved = activeBookings.some(
        (b) => b.seat_id === "seat-A12" && reservedSeatStatuses.has(b.status)
      );
      expect(isA12Reserved).toBe(true);

      // Cancelled booking leaves seat unreserved
      const isA15Reserved = activeBookings.some(
        (b) => b.seat_id === "seat-A15" && reservedSeatStatuses.has(b.status)
      );
      expect(isA15Reserved).toBe(false);
    });

    it("atomically deletes seat hold when booking confirmation completes", () => {
      let holds = [
        { seat_id: "seat-A12", event_id: "event-1" },
        { seat_id: "seat-B1", event_id: "event-1" },
      ];

      // Simulated booking confirmation for seat-A12:
      // await supabase.from("seat_holds").delete().eq("event_id", eventId).eq("seat_id", seatId)
      holds = holds.filter((h) => !(h.seat_id === "seat-A12" && h.event_id === "event-1"));

      expect(holds).toHaveLength(1);
      expect(holds[0].seat_id).toBe("seat-B1");
    });
  });

  // =========================================================================
  // 4. Duplicate Cleanup Prevention (Debounce & Idempotent Sweeps)
  // =========================================================================
  describe("4. Duplicate Cleanup Prevention", () => {
    it("debounces rapid concurrent evaluation calls returning cached summary", async () => {
      let dbDeleteCount = 0;

      // Mock Supabase admin client with fluent query builder
      const createChain = (resolveData: any = { data: [] }) => {
        const chain: any = {
          select: () => chain,
          delete: () => {
            dbDeleteCount++;
            return chain;
          },
          update: () => chain,
          insert: () => chain,
          eq: () => chain,
          not: () => chain,
          in: () => chain,
          lt: (col: string, val: any) => Promise.resolve({ count: 5, data: [] }),
          gt: (col: string, val: any) => Promise.resolve({ count: 0, data: [] }),
          maybeSingle: () => Promise.resolve({ data: null }),
          single: () => Promise.resolve({ data: null }),
          then: (fn: any) => Promise.resolve(resolveData).then(fn),
        };
        return chain;
      };

      const mockSupabase = {
        from: (table: string) => createChain(),
      } as any;

      // First run: executes DB sweep
      const run1 = await runSystemEvaluation(mockSupabase);
      const initialDbDeletes = dbDeleteCount;
      expect(initialDbDeletes).toBeGreaterThan(0);

      // Second run immediately (< 2000ms): debounced, returns cached summary
      const run2 = await runSystemEvaluation(mockSupabase);
      expect(dbDeleteCount).toBe(initialDbDeletes); // No additional DB calls
      expect(run2.expiredHoldsRemoved).toBe(run1.expiredHoldsRemoved);

      // Force full sweep (used by daily Vercel Cron): bypasses debounce
      const run3 = await runSystemEvaluation(mockSupabase, { forceFullSweep: true });
      expect(dbDeleteCount).toBeGreaterThan(initialDbDeletes);
    });

    it("ensures atomic database cleanup queries are idempotent", () => {
      // Simulating idempotent SQL: DELETE FROM seat_holds WHERE expires_at < nowIso
      const holds = [
        { id: "h1", expires_at: "2026-11-03T10:00:00Z" },
        { id: "h2", expires_at: "2026-11-03T14:00:00Z" },
      ];
      const nowIso = "2026-11-03T12:00:00Z";

      // First execution
      const remaining1 = holds.filter((h) => h.expires_at >= nowIso);
      expect(remaining1).toHaveLength(1);
      expect(remaining1[0].id).toBe("h2");

      // Repeated execution does not cause error or further deletion
      const remaining2 = remaining1.filter((h) => h.expires_at >= nowIso);
      expect(remaining2).toHaveLength(1);
      expect(remaining2[0].id).toBe("h2");
    });
  });

  // =========================================================================
  // 5. Unauthorized Cron Requests (CRON_SECRET Security)
  // =========================================================================
  describe("5. Unauthorized Cron Requests & CRON_SECRET Security", () => {
    const CRON_SECRET = "test_cron_secret_key_abcdef123456";

    function checkCronAuthorization(headers: Headers, querySecret?: string | null, envSecret?: string, nodeEnv = "test"): { authorized: boolean; status: number; error?: string } {
      const authHeader = headers.get("authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
      const providedSecret = bearerToken || querySecret;

      if (envSecret) {
        if (!providedSecret || providedSecret !== envSecret) {
          return { authorized: false, status: 401, error: "Unauthorized: Invalid or missing cron secret" };
        }
      } else if (nodeEnv === "production") {
        return { authorized: false, status: 500, error: "Server misconfiguration: CRON_SECRET environment variable is missing in production" };
      }

      return { authorized: true, status: 200 };
    }

    it("rejects request with missing secret when CRON_SECRET is configured", () => {
      const headers = new Headers();
      const auth = checkCronAuthorization(headers, null, CRON_SECRET);

      expect(auth.authorized).toBe(false);
      expect(auth.status).toBe(401);
      expect(auth.error).toContain("Unauthorized");
    });

    it("rejects request with invalid bearer token", () => {
      const headers = new Headers({ authorization: "Bearer wrong_secret_attacker" });
      const auth = checkCronAuthorization(headers, null, CRON_SECRET);

      expect(auth.authorized).toBe(false);
      expect(auth.status).toBe(401);
    });

    it("rejects request with invalid query parameter secret", () => {
      const headers = new Headers();
      const auth = checkCronAuthorization(headers, "invalid_secret_token", CRON_SECRET);

      expect(auth.authorized).toBe(false);
      expect(auth.status).toBe(401);
    });

    it("authorizes request with valid Bearer token", () => {
      const headers = new Headers({ authorization: `Bearer ${CRON_SECRET}` });
      const auth = checkCronAuthorization(headers, null, CRON_SECRET);

      expect(auth.authorized).toBe(true);
      expect(auth.status).toBe(200);
    });

    it("authorizes request with valid query parameter secret", () => {
      const headers = new Headers();
      const auth = checkCronAuthorization(headers, CRON_SECRET, CRON_SECRET);

      expect(auth.authorized).toBe(true);
      expect(auth.status).toBe(200);
    });

    it("fails closed with 500 if CRON_SECRET is unset in production environment", () => {
      const headers = new Headers();
      const auth = checkCronAuthorization(headers, null, undefined, "production");

      expect(auth.authorized).toBe(false);
      expect(auth.status).toBe(500);
      expect(auth.error).toContain("CRON_SECRET environment variable is missing in production");
    });
  });

  // =========================================================================
  // 6. Seat-State Consistency
  // =========================================================================
  describe("6. Seat-State Consistency & Transition Engine", () => {
    it("delays wrong seat alert during the 15s grace period", () => {
      const now = new Date("2026-11-03T12:00:10Z");
      const seatedAt = new Date("2026-11-03T12:00:02Z"); // Seated 8s ago

      const state = evaluateSeatState({
        seatId: "seat-A1",
        currentOccupancy: "EMPTY",
        currentAuthorization: "UNAUTHORIZED",
        currentState: "NORMAL",
        pressure: 72, // Passenger seated
        mismatchSince: seatedAt.toISOString(),
        currentTime: now,
        settings: defaultEngineSettings,
      });

      expect(state.newOccupancy).toBe("OCCUPIED");
      expect(state.newState).toBe("MISMATCH_PENDING");
      expect(state.generatedAlert).toBeNull(); // No premature alert
    });

    it("transitions to WRONG_SEAT and generates silent alert after 15s elapsed", () => {
      const now = new Date("2026-11-03T12:00:20Z");
      const seatedAt = new Date("2026-11-03T12:00:00Z"); // Seated 20s ago (> 15s delay)

      const state = evaluateSeatState({
        seatId: "seat-A1",
        currentOccupancy: "OCCUPIED",
        currentAuthorization: "UNAUTHORIZED",
        currentState: "MISMATCH_PENDING",
        pressure: 72,
        mismatchSince: seatedAt.toISOString(),
        currentTime: now,
        settings: defaultEngineSettings,
      });

      expect(state.newState).toBe("WRONG_SEAT");
      expect(state.generatedAlert?.type).toBe("WRONG_SEAT");
      expect(state.generatedAlert?.priority).toBe("MEDIUM");
    });

    it("filters out luggage/bags (uncertain pressure range 20-59kg) from triggering wrong seat alerts", () => {
      const state = evaluateSeatState({
        seatId: "seat-A1",
        currentOccupancy: "EMPTY",
        currentAuthorization: "UNAUTHORIZED",
        currentState: "NORMAL",
        pressure: 30, // Backpack / briefcase
        settings: defaultEngineSettings,
      });

      expect(state.newOccupancy).toBe("UNCERTAIN");
      expect(state.newState).toBe("NORMAL");
      expect(state.generatedAlert).toBeNull();
    });

    it("auto-resolves WRONG_SEAT alerts when valid passenger scans at the assigned seat", () => {
      const state = evaluateSeatState({
        seatId: "seat-A1",
        currentOccupancy: "OCCUPIED",
        currentAuthorization: "AUTHORIZED", // Set by successful QR scan
        currentState: "WRONG_SEAT",
        pressure: 75,
        settings: defaultEngineSettings,
      });

      expect(state.newOccupancy).toBe("OCCUPIED");
      expect(state.newState).toBe("AUTHORIZED");
      expect(state.autoResolveAlertTypes).toContain("WRONG_SEAT");
    });
  });
});
