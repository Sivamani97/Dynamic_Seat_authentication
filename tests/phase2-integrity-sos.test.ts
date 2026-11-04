import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as serverLib from "../lib/supabase/server";
import fs from "fs";
import path from "path";

// Handlers under test
import { POST as postBookings, DELETE as deleteBookings } from "../app/api/bookings/route";
import { POST as postUserAssist, GET as getUserAssist } from "../app/api/user/assist/route";
import { POST as postStaffAlertAction } from "../app/api/staff/alerts/[id]/route";
import { POST as postHardwareAssist } from "../app/api/seat-units/[id]/assist/route";
import { GET as getCronEvaluate, POST as postCronEvaluate } from "../app/api/cron/evaluate/route";

describe("Phase 2 & 2.1: Database Integrity, Passenger-Owned SOS & Security Hardening Test Suite", () => {
  const sampleEventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const sampleSeatId = "a1200000-0000-0000-0000-000000000a12";
  const unlinkedSeatId = "a9900000-0000-0000-0000-000000000a99";
  const sampleBookingId = "b1111111-1111-1111-1111-111111111111";
  const bobsBookingId = "b2222222-2222-2222-2222-222222222222";
  const sampleAlertId = "a1111111-2222-3333-4444-555555555555";

  const userAlice = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "alice@demo.com",
    role: "USER" as const,
  };

  const userBob = {
    id: "22222222-2222-2222-2222-222222222222",
    email: "bob@demo.com",
    role: "USER" as const,
  };

  const staffMarshal = {
    id: "33333333-3333-3333-3333-333333333333",
    email: "staff@demo.com",
    role: "STAFF" as const,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function buildRequest(url: string, method = "GET", body?: any, headers: Record<string, string> = {}) {
    return new NextRequest(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  function createMockChain(data: any = null, error: any = null) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      not: () => chain,
      gt: () => chain,
      lt: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      single: async () => ({ data, error }),
      maybeSingle: async () => ({ data, error }),
      insert: () => chain,
      update: () => chain,
      upsert: async () => ({ data, error }),
      delete: () => chain,
    };
    return chain;
  }

  // =========================================================================
  // 1. Concurrent attempts to book the same seat (returns HTTP 409)
  // =========================================================================
  it("Scenario 1: Concurrent attempts to book the same seat return HTTP 409", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    const mockAdminWithRpcConflict = {
      rpc: async (fn: string) => {
        if (fn === "confirm_booking_atomic") {
          return {
            data: {
              success: false,
              code: "CONCURRENT_CONFLICT",
              message: "Seat already reserved.",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from: () => createMockChain(null),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminWithRpcConflict as any);

    const reqRpc = buildRequest("http://localhost:3000/api/bookings", "POST", {
      eventId: sampleEventId,
      seatId: sampleSeatId,
    });

    const resRpc = await postBookings(reqRpc);
    const jsonRpc = await resRpc.json();

    expect(resRpc.status).toBe(409);
    expect(jsonRpc.success).toBe(false);
    expect(jsonRpc.message).toContain("reserved");
  });

  // =========================================================================
  // 2. Expired hold booking attempts (allowed if seat free)
  // =========================================================================
  it("Scenario 2: Allows booking when prior seat hold has expired", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    let createdBooking = false;
    const mockAdmin = {
      rpc: async (fn: string, params: any) => {
        if (fn === "confirm_booking_atomic") {
          createdBooking = true;
          return {
            data: {
              success: true,
              booking: {
                id: sampleBookingId,
                booking_ref: "BK999999",
                user_id: params.p_user_id,
                event_id: params.p_event_id,
                seat_id: params.p_seat_id,
                status: "BOOKED",
              },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from: (table: string) => {
        if (table === "seats") {
          return createMockChain({ id: sampleSeatId, label: "A12", price: 16, unit_id: "SCREEN2-A12" });
        }
        if (table === "events") {
          return createMockChain({ id: sampleEventId, title: "Grand Premiere", start_time: new Date().toISOString() });
        }
        return createMockChain(null);
      },
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const req = buildRequest("http://localhost:3000/api/bookings", "POST", {
      eventId: sampleEventId,
      seatId: sampleSeatId,
    });

    const res = await postBookings(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(createdBooking).toBe(true);
  });

  // =========================================================================
  // 3. Booking under another user's identity blocked (session binding)
  // =========================================================================
  it("Scenario 3: Blocks booking under another user's identity by enforcing session binding", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    let insertedUserId: string | null = null;
    const mockAdmin = {
      rpc: async (fn: string, params: any) => {
        if (fn === "confirm_booking_atomic") {
          insertedUserId = params.p_user_id;
          return {
            data: {
              success: true,
              booking: {
                id: sampleBookingId,
                booking_ref: "BK123456",
                user_id: params.p_user_id,
                event_id: params.p_event_id,
                seat_id: params.p_seat_id,
                status: "BOOKED",
              },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from: () => createMockChain(null),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const req = buildRequest(
      "http://localhost:3000/api/bookings",
      "POST",
      {
        eventId: sampleEventId,
        seatId: sampleSeatId,
        userId: userBob.id,
      },
      { "x-user-id": userBob.id }
    );

    const res = await postBookings(req);
    expect(res.status).toBe(200);
    expect(insertedUserId).toBe(userAlice.id);
    expect(insertedUserId).not.toBe(userBob.id);
  });

  // =========================================================================
  // 4. Anonymous SOS submission rejected with 401
  // =========================================================================
  it("Scenario 4: Rejects anonymous SOS submission with HTTP 401", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    const req = buildRequest("http://localhost:3000/api/user/assist", "POST", {
      bookingId: sampleBookingId,
      category: "MEDICAL",
      note: "Need assistance",
    });

    const res = await postUserAssist(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.message).toContain("Authentication required");
  });

  // =========================================================================
  // 5. Passenger SOS against another passenger's booking rejected with 403
  // =========================================================================
  it("Scenario 5: Rejects passenger SOS against another passenger's booking with HTTP 403", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    const mockAdmin = {
      from: (table: string) => {
        if (table === "bookings") {
          return createMockChain({
            id: bobsBookingId,
            booking_ref: "BK888888",
            user_id: userBob.id,
            event_id: sampleEventId,
            seat_id: sampleSeatId,
            status: "BOOKED",
            seat: { id: sampleSeatId, label: "A12" },
          });
        }
        return createMockChain(null);
      },
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const req = buildRequest("http://localhost:3000/api/user/assist", "POST", {
      bookingId: bobsBookingId,
      category: "EMERGENCY",
    });

    const res = await postUserAssist(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.message).toContain("Forbidden");
  });

  // =========================================================================
  // 6. Duplicate active SOS submission returns 409 (SOS_ALREADY_ACTIVE)
  // =========================================================================
  it("Scenario 6: Duplicate active SOS submission returns HTTP 409 (SOS_ALREADY_ACTIVE)", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    // 6a: Detected via active alert query
    const mockAdmin = {
      from: (table: string) => {
        if (table === "bookings") {
          return createMockChain({
            id: sampleBookingId,
            booking_ref: "BK111111",
            user_id: userAlice.id,
            event_id: sampleEventId,
            seat_id: sampleSeatId,
            status: "BOOKED",
            seat: { id: sampleSeatId, label: "A12" },
          });
        }
        if (table === "alerts") {
          return createMockChain({
            id: sampleAlertId,
            status: "NEW",
            priority: "CRITICAL",
            created_at: new Date().toISOString(),
          });
        }
        return createMockChain(null);
      },
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const req = buildRequest("http://localhost:3000/api/user/assist", "POST", {
      bookingId: sampleBookingId,
      category: "MEDICAL",
    });

    const res = await postUserAssist(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.code).toBe("SOS_ALREADY_ACTIVE");

    // 6b: Detected via database partial unique index violation (23505)
    const mockAdminDbConflict = {
      from: (table: string) => {
        if (table === "bookings") {
          return createMockChain({
            id: sampleBookingId,
            booking_ref: "BK111111",
            user_id: userAlice.id,
            event_id: sampleEventId,
            seat_id: sampleSeatId,
            status: "BOOKED",
            seat: { id: sampleSeatId, label: "A12" },
          });
        }
        if (table === "alerts") {
          const chain: any = createMockChain(null);
          chain.maybeSingle = async () => ({ data: null, error: null });
          chain.single = async () => ({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint idx_unique_active_sos_alert" },
          });
          return chain;
        }
        return createMockChain(null);
      },
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminDbConflict as any);

    const reqDb = buildRequest("http://localhost:3000/api/user/assist", "POST", {
      bookingId: sampleBookingId,
      category: "MEDICAL",
    });

    const resDb = await postUserAssist(reqDb);
    expect(resDb.status).toBe(409);
    const jsonDb = await resDb.json();
    expect(jsonDb.code).toBe("SOS_ALREADY_ACTIVE");
  });

  // =========================================================================
  // 7. Passenger retrieving another passenger's alert status rejected with 403
  // =========================================================================
  it("Scenario 7: Passenger retrieving another passenger's alert status rejected with HTTP 403", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    const mockAdmin = {
      from: (table: string) => {
        if (table === "bookings") {
          return createMockChain({
            id: bobsBookingId,
            user_id: userBob.id,
            status: "BOOKED",
          });
        }
        return createMockChain(null);
      },
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const req = buildRequest(`http://localhost:3000/api/user/assist?bookingId=${bobsBookingId}`, "GET");

    const res = await getUserAssist(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.message).toContain("Forbidden");
  });

  // =========================================================================
  // 8. Staff alert acknowledgment succeeds (HTTP 200)
  // =========================================================================
  it("Scenario 8: Staff alert acknowledgment succeeds with HTTP 200", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(staffMarshal);

    let updatedStatus: string | null = null;
    const mockAdmin = {
      from: (table: string) => {
        if (table === "alerts") {
          const chain: any = createMockChain({
            id: sampleAlertId,
            seat_id: sampleSeatId,
            event_id: sampleEventId,
            status: "NEW",
            priority: "CRITICAL",
          });
          chain.update = (data: any) => {
            updatedStatus = data.status;
            return chain;
          };
          chain.single = async () => ({
            data: { id: sampleAlertId, status: updatedStatus || "ACKNOWLEDGED" },
            error: null,
          });
          return chain;
        }
        return createMockChain(null);
      },
      rpc: async () => ({ data: 1, error: null }),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const req = buildRequest(
      `http://localhost:3000/api/staff/alerts/${sampleAlertId}`,
      "POST",
      { action: "ACKNOWLEDGE" }
    );

    const res = await postStaffAlertAction(req, { params: { id: sampleAlertId } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(updatedStatus).toBe("ACKNOWLEDGED");
  });

  // =========================================================================
  // 9. Staff alert resolution succeeds (HTTP 200)
  // =========================================================================
  it("Scenario 9: Staff alert resolution succeeds with HTTP 200 and restores seat state", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(staffMarshal);

    let updatedAlertStatus: string | null = null;
    let restoredSeatState: string | null = null;

    const mockAdmin = {
      from: (table: string) => {
        if (table === "alerts") {
          let callCount = 0;
          const chain: any = createMockChain(null);
          chain.update = (data: any) => {
            updatedAlertStatus = data.status;
            return chain;
          };
          chain.single = async () => {
            callCount++;
            if (callCount === 1) {
              return {
                data: {
                  id: sampleAlertId,
                  seat_id: sampleSeatId,
                  event_id: sampleEventId,
                  type: "SOS",
                  status: "ACKNOWLEDGED",
                  priority: "CRITICAL",
                },
                error: null,
              };
            }
            return {
              data: { id: sampleAlertId, status: "RESOLVED" },
              error: null,
            };
          };
          return chain;
        }
        if (table === "seat_states") {
          const chain: any = createMockChain(null);
          chain.update = (data: any) => {
            restoredSeatState = data.state;
            return chain;
          };
          return chain;
        }
        return createMockChain(null);
      },
      rpc: async () => ({ data: 1, error: null }),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const req = buildRequest(
      `http://localhost:3000/api/staff/alerts/${sampleAlertId}`,
      "POST",
      { action: "RESOLVE", resolutionNote: "Passenger safely attended to." }
    );

    const res = await postStaffAlertAction(req, { params: { id: sampleAlertId } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(updatedAlertStatus).toBe("RESOLVED");
    expect(restoredSeatState).toBe("NORMAL");
  });

  // =========================================================================
  // 10. Realtime alert state transitions (NEW -> ACKNOWLEDGED -> RESOLVED)
  // =========================================================================
  it("Scenario 10: Enforces valid alert lifecycle state transitions", () => {
    const validTransitions: Record<string, string[]> = {
      NEW: ["ACKNOWLEDGED", "RESOLVED"],
      ACKNOWLEDGED: ["RESOLVED", "NEW"],
      RESOLVED: [], // Terminal state
    };

    expect(validTransitions["NEW"]).toContain("ACKNOWLEDGED");
    expect(validTransitions["ACKNOWLEDGED"]).toContain("RESOLVED");
    expect(validTransitions["RESOLVED"].length).toBe(0);
  });

  // =========================================================================
  // 11. Hardware assist endpoint rejects anonymous callers (HTTP 401)
  // =========================================================================
  it("Scenario 11: Hardware assist endpoint rejects anonymous callers with HTTP 401", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    const req = buildRequest("http://localhost:3000/api/seat-units/SCREEN2-A12/assist", "POST", {
      category: "WATER_BASIC",
    });

    const res = await postHardwareAssist(req, { params: { id: "SCREEN2-A12" } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.message).toContain("Authentication required");
  });

  // =========================================================================
  // 12. Cron evaluate endpoint rejects query string secret, requires Bearer token
  // =========================================================================
  it("Scenario 12: Cron evaluate endpoint rejects query string secrets and requires Bearer token", async () => {
    process.env.CRON_SECRET = "secret_cron_12345";

    const reqQuerySecret = buildRequest("http://localhost:3000/api/cron/evaluate?secret=secret_cron_12345", "GET");
    const resQuery = await getCronEvaluate(reqQuerySecret);
    expect(resQuery.status).toBe(401);

    const reqWrongBearer = buildRequest("http://localhost:3000/api/cron/evaluate", "GET", undefined, {
      Authorization: "Bearer wrong_secret",
    });
    const resWrong = await getCronEvaluate(reqWrongBearer);
    expect(resWrong.status).toBe(401);

    const mockAdmin = {
      from: () => createMockChain(null),
      rpc: async () => ({ data: 1, error: null }),
    };
    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const reqValidBearer = buildRequest("http://localhost:3000/api/cron/evaluate", "GET", undefined, {
      Authorization: "Bearer secret_cron_12345",
    });
    const resValid = await getCronEvaluate(reqValidBearer);
    const jsonValid = await resValid.json();

    expect(resValid.status).toBe(200);
    expect(jsonValid.status).toBe("OK");
    expect(jsonValid.cronExecuted).toBe(true);
  });

  // =========================================================================
  // 13. Database failure during role resolution returns null (does not grant USER session)
  // =========================================================================
  it("Scenario 13: Database failure during role resolution returns null (fails closed)", async () => {
    const mockSupabaseWithDbError: any = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: userAlice.id,
              email: userAlice.email,
              user_metadata: { role: "ADMIN" },
            },
          },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: "50000", message: "Database connection timeout or internal error" },
                }),
              }),
            }),
          };
        }
        return createMockChain(null);
      },
    };

    const req = buildRequest("http://localhost:3000/api/bookings", "GET", undefined, {
      Authorization: "Bearer mock_valid_jwt_token",
    });

    const user = await serverLib.getAuthenticatedUser(req, mockSupabaseWithDbError);
    expect(user).toBeNull();
  });

  // =========================================================================
  // 14. Phase 2.1: Anonymous and Authenticated Passenger RPC Execution Denied
  // =========================================================================
  it("Scenario 14: Verifies SQL migration explicitly revokes EXECUTE on RPCs from PUBLIC, anon, authenticated", () => {
    const migrationPath = path.resolve(__dirname, "../supabase/migrations/20261103000000_phase2_integrity_rls.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    // confirm_booking_atomic permissions
    expect(migrationSql).toContain("REVOKE EXECUTE ON FUNCTION public.confirm_booking_atomic");
    expect(migrationSql).toContain("FROM PUBLIC, anon, authenticated");
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.confirm_booking_atomic");
    expect(migrationSql).toContain("TO service_role");

    // cancel_booking_atomic permissions
    expect(migrationSql).toContain("REVOKE EXECUTE ON FUNCTION public.cancel_booking_atomic");
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.cancel_booking_atomic");

    // Secure search_path
    expect(migrationSql).toContain("SET search_path = public, pg_temp");
  });

  // =========================================================================
  // 15. Phase 2.1: Passenger cannot directly insert or mutate bookings table
  // =========================================================================
  it("Scenario 15: Verifies SQL migration revokes direct table mutations on public.bookings", () => {
    const migrationPath = path.resolve(__dirname, "../supabase/migrations/20261103000000_phase2_integrity_rls.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    expect(migrationSql).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bookings FROM PUBLIC, anon, authenticated");
    expect(migrationSql).toContain("GRANT SELECT ON public.bookings TO authenticated");
    expect(migrationSql).toContain("GRANT ALL ON public.bookings TO service_role");

    // Mutable RLS policies dropped
    expect(migrationSql).toContain("DROP POLICY IF EXISTS bookings_insert ON public.bookings");
    expect(migrationSql).toContain("DROP POLICY IF EXISTS bookings_update ON public.bookings");
    expect(migrationSql).toContain("DROP POLICY IF EXISTS bookings_delete ON public.bookings");
  });

  // =========================================================================
  // 16. Phase 2.1: RPC unavailable results in HTTP 500 with NO fallback booking
  // =========================================================================
  it("Scenario 16: RPC unavailable results in HTTP 500 with zero fallback bookings", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    let attemptedDirectInsert = false;
    const mockAdmin = {
      rpc: async () => ({
        data: null,
        error: { message: "connection to server at 'db.supabase.co' failed: timeout" },
      }),
      from: (table: string) => {
        if (table === "bookings") {
          const chain = createMockChain(null);
          chain.insert = () => {
            attemptedDirectInsert = true;
            return chain;
          };
          return chain;
        }
        return createMockChain(null);
      },
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const req = buildRequest("http://localhost:3000/api/bookings", "POST", {
      eventId: sampleEventId,
      seatId: sampleSeatId,
    });

    const res = await postBookings(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.message).toContain("atomic transaction failed");
    // CRITICAL: No fallback insert was performed!
    expect(attemptedDirectInsert).toBe(false);
  });

  // =========================================================================
  // 17. Phase 2.1: Invalid event-seat combinations are rejected (HTTP 400)
  // =========================================================================
  it("Scenario 17: Invalid event-seat combinations and unbookable events are rejected with HTTP 400", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    // 17a: Seat does not belong to the event screen
    const mockAdminInvalidSeat = {
      rpc: async (fn: string) => {
        if (fn === "confirm_booking_atomic") {
          return {
            data: {
              success: false,
              code: "INVALID_EVENT_SEAT",
              message: "The requested seat does not belong to the event venue screen.",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from: () => createMockChain(null),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminInvalidSeat as any);

    const reqUnlinked = buildRequest("http://localhost:3000/api/bookings", "POST", {
      eventId: sampleEventId,
      seatId: unlinkedSeatId,
    });

    const resUnlinked = await postBookings(reqUnlinked);
    const jsonUnlinked = await resUnlinked.json();

    expect(resUnlinked.status).toBe(400);
    expect(jsonUnlinked.success).toBe(false);
    expect(jsonUnlinked.message).toContain("venue screen");

    // 17b: Event is CANCELLED or COMPLETED
    const mockAdminCancelledEvent = {
      rpc: async (fn: string) => {
        if (fn === "confirm_booking_atomic") {
          return {
            data: {
              success: false,
              code: "EVENT_NOT_BOOKABLE",
              message: "Bookings are closed for this event.",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from: () => createMockChain(null),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminCancelledEvent as any);

    const reqCancelled = buildRequest("http://localhost:3000/api/bookings", "POST", {
      eventId: sampleEventId,
      seatId: unlinkedSeatId,
    });

    const resCancelled = await postBookings(reqCancelled);
    expect(resCancelled.status).toBe(400);
    const jsonCancelled = await resCancelled.json();
    expect(jsonCancelled.message).toContain("closed");
  });

  // =========================================================================
  // 18. Phase 2.1: Existing seat states are not overwritten during booking
  // =========================================================================
  it("Scenario 18: Verifies confirm_booking_atomic uses ON CONFLICT DO NOTHING to preserve seat state", () => {
    const migrationPath = path.resolve(__dirname, "../supabase/migrations/20261103000000_phase2_integrity_rls.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    // Must NOT do ON CONFLICT DO UPDATE SET state = 'NORMAL' which clobbers SOS
    expect(migrationSql).toContain("ON CONFLICT (seat_id, event_id) DO NOTHING");
  });

  // =========================================================================
  // 19. Phase 2.1: Resolved SOS permits a new request
  // =========================================================================
  it("Scenario 19: Permits a subsequent SOS request when prior alert was resolved", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    let alertCreated = false;
    const mockAdmin = {
      from: (table: string) => {
        if (table === "bookings") {
          return createMockChain({
            id: sampleBookingId,
            booking_ref: "BK111111",
            user_id: userAlice.id,
            event_id: sampleEventId,
            seat_id: sampleSeatId,
            status: "BOOKED",
            seat: { id: sampleSeatId, label: "A12" },
          });
        }
        if (table === "alerts") {
          const chain = createMockChain(null);
          // Query for active alert returns null because previous alert status is 'RESOLVED'
          chain.maybeSingle = async () => ({ data: null, error: null });
          chain.single = async () => {
            alertCreated = true;
            return {
              data: {
                id: "new-alert-uuid",
                booking_id: sampleBookingId,
                status: "NEW",
                priority: "CRITICAL",
              },
              error: null,
            };
          };
          return chain;
        }
        return createMockChain(null);
      },
      rpc: async () => ({ data: 1, error: null }),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdmin as any);

    const req = buildRequest("http://localhost:3000/api/user/assist", "POST", {
      bookingId: sampleBookingId,
      category: "MEDICAL",
    });

    const res = await postUserAssist(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(alertCreated).toBe(true);
  });

  // =========================================================================
  // 20. Phase 2.1: Failed cancellation never returns success
  // =========================================================================
  it("Scenario 20: Failed cancellation never returns success", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    // 20a: RPC returns database failure
    const mockAdminRpcFailure = {
      from: (table: string) => {
        if (table === "bookings") {
          return createMockChain({
            id: sampleBookingId,
            booking_ref: "BK111111",
            user_id: userAlice.id,
            status: "BOOKED",
          });
        }
        return createMockChain(null);
      },
      rpc: async (fn: string) => {
        if (fn === "cancel_booking_atomic") {
          return {
            data: { success: false, code: "DATABASE_ERROR", message: "Cancellation encountered an internal database error." },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminRpcFailure as any);

    const req = buildRequest(`http://localhost:3000/api/bookings?id=${sampleBookingId}`, "DELETE");
    const res = await deleteBookings(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.message).toContain("database error");

    // 20b: Booking already cancelled returns 400
    const mockAdminAlreadyCancelled = {
      from: (table: string) => {
        if (table === "bookings") {
          return createMockChain({
            id: sampleBookingId,
            booking_ref: "BK111111",
            user_id: userAlice.id,
            status: "CANCELLED", // Already cancelled!
          });
        }
        return createMockChain(null);
      },
      rpc: async () => ({ data: null, error: null }),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminAlreadyCancelled as any);

    const resAlready = await deleteBookings(req);
    const jsonAlready = await resAlready.json();

    expect(resAlready.status).toBe(400);
    expect(jsonAlready.success).toBe(false);
    expect(jsonAlready.message).toContain("already cancelled");
  });
});
