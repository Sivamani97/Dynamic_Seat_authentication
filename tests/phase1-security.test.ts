import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as serverLib from "../lib/supabase/server";

// Handlers under test
import { GET as getBookings, POST as postBookings, DELETE as deleteBookings } from "../app/api/bookings/route";
import { POST as postStaffOverride } from "../app/api/staff/override/route";
import { POST as postAlertAction } from "../app/api/staff/alerts/[id]/route";
import { GET as getAdminAuditVerify } from "../app/api/admin/audit/verify/route";
import { POST as postScanEntry } from "../app/api/scan/entry/route";
import { POST as postScanSeat } from "../app/api/scan/seat/route";
import { POST as postEngineTick } from "../app/api/engine/tick/route";

describe("Phase 1: Authentication & API Security Hardening Test Suite", () => {
  const sampleEventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const sampleSeatId = "a1200000-0000-0000-0000-000000000a12";
  const sampleBookingId = "b1111111-1111-1111-1111-111111111111";

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

  const adminUser = {
    id: "44444444-4444-4444-4444-444444444444",
    email: "admin@demo.com",
    role: "ADMIN" as const,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to build NextRequest
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

  // =========================================================================
  // 1. Booking Creation: Anonymous caller rejected with HTTP 401
  // =========================================================================
  it("Scenario 1: Rejects unauthenticated booking creation with HTTP 401", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    const req = buildRequest("http://localhost:3000/api/bookings", "POST", {
      eventId: sampleEventId,
      seatId: sampleSeatId,
    });

    const res = await postBookings(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.message).toContain("Authentication required");
  });

  // =========================================================================
  // 2. Booking Creation: Identity spoofing blocked (ignores x-user-id & body.userId)
  // =========================================================================
  it("Scenario 2: Prevents identity spoofing by binding booking to verified session user ID", async () => {
    // Authenticated as Alice
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    let insertedUserId: string | null = null;
    const mockAdminClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              gt: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
            maybeSingle: async () => ({
              data: {
                id: sampleSeatId,
                label: "A12",
                price: 16.0,
                unit_id: "SCREEN2-A12",
                screen: { name: "Screen 2", venue: { name: "Grand Cinema" } },
              },
              error: null,
            }),
          }),
        }),
        insert: (data: any) => {
          if (table === "bookings") {
            insertedUserId = data.user_id;
          }
          return {
            select: () => ({
              single: async () => ({
                data: { id: sampleBookingId, booking_ref: "BK123456", ...data },
                error: null,
              }),
            }),
          };
        },
        delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        upsert: async () => ({ error: null }),
      }),
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
        return { data: 1, error: null };
      },
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

    // Caller attempts to spoof user ID in header AND body to userBob
    const req = buildRequest(
      "http://localhost:3000/api/bookings",
      "POST",
      {
        eventId: sampleEventId,
        seatId: sampleSeatId,
        userId: userBob.id, // Attacker payload
      },
      { "x-user-id": userBob.id } // Attacker header
    );

    const res = await postBookings(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // Verified: The booking was bound to Alice, NOT Bob!
    expect(insertedUserId).toBe(userAlice.id);
  });

  // =========================================================================
  // 3. Booking Listing: Cross-user booking listing blocked for passengers
  // =========================================================================
  it("Scenario 3: Enforces passenger isolation so passengers only see their own bookings", async () => {
    // Authenticated as Alice
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    let queryUserIdFilter: string | null = null;
    const mockAdminClient = {
      from: (table: string) => ({
        select: () => ({
          eq: (field: string, val: string) => {
            if (field === "user_id") queryUserIdFilter = val;
            return {
              order: async () => ({
                data: [
                  { id: sampleBookingId, booking_ref: "BK829173", user_id: userAlice.id, status: "BOOKED" },
                ],
                error: null,
              }),
            };
          },
        }),
      }),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

    // Alice tries to query Bob's bookings by passing ?userId=bob
    const req = buildRequest(`http://localhost:3000/api/bookings?userId=${userBob.id}`, "GET");

    const res = await getBookings(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    // Unconditionally filtered by Alice's authenticated ID
    expect(queryUserIdFilter).toBe(userAlice.id);
    expect(json.bookings).toHaveLength(1);
    expect(json.bookings[0].user_id).toBe(userAlice.id);
  });

  // =========================================================================
  // 4. Booking Listing: Anonymous caller rejected with HTTP 401
  // =========================================================================
  it("Scenario 4: Rejects unauthenticated booking listing with HTTP 401", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    const req = buildRequest("http://localhost:3000/api/bookings", "GET");
    const res = await getBookings(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  // =========================================================================
  // 5. Booking Cancellation: Unauthorized cancellation blocked
  // =========================================================================
  it("Scenario 5: Rejects cancellation if unauthenticated (401) or non-owner passenger (403)", async () => {
    // 5a: Unauthenticated caller
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);
    const reqUnauth = buildRequest(`http://localhost:3000/api/bookings?id=${sampleBookingId}`, "DELETE");
    const resUnauth = await deleteBookings(reqUnauth);
    expect(resUnauth.status).toBe(401);

    // 5b: Bob attempts to cancel Alice's booking
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userBob);

    const mockAdminClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: sampleBookingId,
                booking_ref: "BK829173",
                user_id: userAlice.id, // Owned by Alice
                seat_id: sampleSeatId,
                event_id: sampleEventId,
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

    const reqForbidden = buildRequest(`http://localhost:3000/api/bookings?id=${sampleBookingId}`, "DELETE");
    const resForbidden = await deleteBookings(reqForbidden);
    const jsonForbidden = await resForbidden.json();

    expect(resForbidden.status).toBe(403);
    expect(jsonForbidden.success).toBe(false);
    expect(jsonForbidden.message).toContain("Forbidden");
  });

  // =========================================================================
  // 6. Staff Override: Rejects unauthenticated callers with HTTP 401
  // =========================================================================
  it("Scenario 6: Rejects unauthenticated staff override requests with HTTP 401", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    const req = buildRequest("http://localhost:3000/api/staff/override", "POST", {
      seatId: sampleSeatId,
      eventId: sampleEventId,
      action: "AUTHORIZE_SEAT",
      reason: "Manual verification",
    });

    const res = await postStaffOverride(req);
    expect(res.status).toBe(401);
  });

  // =========================================================================
  // 7. Staff Override: Rejects passenger (USER) role with HTTP 403
  // =========================================================================
  it("Scenario 7: Rejects passenger (USER) attempting staff override with HTTP 403", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    const req = buildRequest("http://localhost:3000/api/staff/override", "POST", {
      seatId: sampleSeatId,
      eventId: sampleEventId,
      action: "AUTHORIZE_SEAT",
      reason: "Malicious override attempt",
    });

    const res = await postStaffOverride(req);
    expect(res.status).toBe(403);
  });

  // =========================================================================
  // 8. Staff Override: Permits authorized STAFF or ADMIN with HTTP 200
  // =========================================================================
  it("Scenario 8: Permits authorized STAFF to execute manual override", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(staffMarshal);

    const mockAdminClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: sampleSeatId, label: "A12", unit_id: "SCREEN2-A12" },
              error: null,
            }),
          }),
        }),
        upsert: async () => ({ error: null }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              in: async () => ({ error: null }),
            }),
          }),
        }),
      }),
      rpc: async () => ({ data: 1, error: null }),
    };
    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

    const req = buildRequest("http://localhost:3000/api/staff/override", "POST", {
      seatId: sampleSeatId,
      eventId: sampleEventId,
      action: "AUTHORIZE_SEAT",
      reason: "Passenger showed physical boarding pass",
    });

    const res = await postStaffOverride(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain("manually authorized by staff");
  });

  // =========================================================================
  // 9. Alert Resolution: Rejects unauthenticated callers with HTTP 401
  // =========================================================================
  it("Scenario 9: Rejects unauthenticated alert action with HTTP 401", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    const req = buildRequest("http://localhost:3000/api/staff/alerts/alt-1", "POST", {
      action: "RESOLVE",
      resolutionNote: "Verified",
    });

    const res = await postAlertAction(req, { params: { id: "alt-1" } });
    expect(res.status).toBe(401);
  });

  // =========================================================================
  // 10. Alert Resolution: Rejects passenger (USER) role with HTTP 403
  // =========================================================================
  it("Scenario 10: Rejects passenger (USER) attempting to resolve alert with HTTP 403", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    const req = buildRequest("http://localhost:3000/api/staff/alerts/alt-1", "POST", {
      action: "RESOLVE",
      resolutionNote: "User self-clearing alert",
    });

    const res = await postAlertAction(req, { params: { id: "alt-1" } });
    expect(res.status).toBe(403);
  });

  // =========================================================================
  // 11. Admin Audit Verification: Rejects non-admin callers (401 / 403)
  // =========================================================================
  it("Scenario 11: Rejects unauthenticated (401), passenger (403), and staff (403) from admin audit verify", async () => {
    // 11a: Unauthenticated -> 401
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);
    const resUnauth = await getAdminAuditVerify(buildRequest("http://localhost:3000/api/admin/audit/verify", "GET"));
    expect(resUnauth.status).toBe(401);

    // 11b: Passenger USER -> 403
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);
    const resUser = await getAdminAuditVerify(buildRequest("http://localhost:3000/api/admin/audit/verify", "GET"));
    expect(resUser.status).toBe(403);

    // 11c: Staff -> 403 (Admin only)
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(staffMarshal);
    const resStaff = await getAdminAuditVerify(buildRequest("http://localhost:3000/api/admin/audit/verify", "GET"));
    expect(resStaff.status).toBe(403);

    // 11d: Admin -> 200 OK
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(adminUser);
    const mockAdminClient = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: [], error: null }),
        }),
      }),
    };
    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

    const resAdmin = await getAdminAuditVerify(buildRequest("http://localhost:3000/api/admin/audit/verify", "GET"));
    const jsonAdmin = await resAdmin.json();

    expect(resAdmin.status).toBe(200);
    expect(jsonAdmin.success).toBe(true);
    expect(jsonAdmin.integrityVerified).toBe(true);
  });

  // =========================================================================
  // 12. Entry Scanner: Rejects unauthenticated callers with HTTP 401
  // =========================================================================
  it("Scenario 12: Rejects unauthenticated callers (401) and passenger USER (403) from entry gate scanner", async () => {
    // 12a: Unauthenticated -> 401
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);
    const reqUnauth = buildRequest("http://localhost:3000/api/scan/entry", "POST", {
      token: "dummy.token",
      eventId: sampleEventId,
    });
    const resUnauth = await postScanEntry(reqUnauth);
    const jsonUnauth = await resUnauth.json();

    expect(resUnauth.status).toBe(401);
    expect(jsonUnauth.reasonCode).toBe("UNAUTHORIZED");

    // 12b: Passenger USER attempting gate scan -> 403
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);
    const reqUser = buildRequest("http://localhost:3000/api/scan/entry", "POST", {
      token: "dummy.token",
      eventId: sampleEventId,
    });
    const resUser = await postScanEntry(reqUser);
    const jsonUser = await resUser.json();

    expect(resUser.status).toBe(403);
    expect(jsonUser.reasonCode).toBe("FORBIDDEN");
  });

  // =========================================================================
  // 13. Role Resolution: Missing profile does not grant ADMIN (fails closed to USER)
  // =========================================================================
  it("Scenario 13: Missing profile fails closed to USER and never grants ADMIN even if user_metadata claims ADMIN", async () => {
    // Attacker token has user_metadata claiming ADMIN, but no record in public.profiles
    const mockAdminClient = {
      auth: {
        getUser: async (token: string) => {
          if (token === "attacker-admin-jwt") {
            return {
              data: {
                user: {
                  id: "attacker-uuid-9999",
                  email: "attacker@malicious.com",
                  user_metadata: { role: "ADMIN" }, // Forged in browser signup/metadata
                },
              },
              error: null,
            };
          }
          return { data: { user: null }, error: { message: "Invalid" } };
        },
      },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            // Profile lookup returns null (profile missing)
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };

    const req = buildRequest("http://localhost:3000/api/admin/audit/verify", "GET", undefined, {
      authorization: "Bearer attacker-admin-jwt",
    });

    const resolvedUser = await serverLib.getAuthenticatedUser(req, mockAdminClient as any);

    // Assert: Must fail closed to USER, NEVER granting ADMIN!
    expect(resolvedUser).not.toBeNull();
    expect(resolvedUser?.role).toBe("USER");
    expect(resolvedUser?.role).not.toBe("ADMIN");

    // Further assert: Accessing admin route with this resolved identity returns 403 Forbidden
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(resolvedUser);
    const resVerify = await getAdminAuditVerify(req);
    expect(resVerify.status).toBe(403);
  });

  // =========================================================================
  // 14. Role Resolution: Forged user_metadata.role cannot grant STAFF
  // =========================================================================
  it("Scenario 14: Forged user_metadata.role cannot grant STAFF when authoritative profile role is USER", async () => {
    const mockAdminClient = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: userAlice.id,
              email: "alice@demo.com",
              user_metadata: { role: "STAFF" }, // User attempts to forge STAFF metadata
            },
          },
          error: null,
        }),
      },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            // Authoritative profile record in PostgreSQL holds USER
            maybeSingle: async () => ({ data: { role: "USER" }, error: null }),
          }),
        }),
      }),
    };

    const req = buildRequest("http://localhost:3000/api/staff/override", "POST", undefined, {
      authorization: "Bearer forged-staff-token",
    });

    const resolvedUser = await serverLib.getAuthenticatedUser(req, mockAdminClient as any);
    expect(resolvedUser?.role).toBe("USER");
    expect(resolvedUser?.role).not.toBe("STAFF");

    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(resolvedUser);
    const resOverride = await postStaffOverride(req);
    expect(resOverride.status).toBe(403);
  });

  // =========================================================================
  // 15. Role Resolution: Forged user_metadata.role cannot grant ADMIN
  // =========================================================================
  it("Scenario 15: Forged user_metadata.role cannot grant ADMIN when authoritative profile role is USER", async () => {
    const mockAdminClient = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: userAlice.id,
              email: "alice@demo.com",
              user_metadata: { role: "ADMIN" }, // User attempts to forge ADMIN metadata
            },
          },
          error: null,
        }),
      },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: "USER" }, error: null }),
          }),
        }),
      }),
    };

    const req = buildRequest("http://localhost:3000/api/admin/audit/verify", "GET", undefined, {
      authorization: "Bearer forged-admin-token",
    });

    const resolvedUser = await serverLib.getAuthenticatedUser(req, mockAdminClient as any);
    expect(resolvedUser?.role).toBe("USER");
    expect(resolvedUser?.role).not.toBe("ADMIN");

    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(resolvedUser);
    const resAdmin = await getAdminAuditVerify(req);
    expect(resAdmin.status).toBe(403);
  });

  // =========================================================================
  // 16. Simulated Seat Scanner: Anonymous scanning rejected (401)
  // =========================================================================
  it("Scenario 16: Anonymous seat scanning is rejected with HTTP 401 even when client supplies predictable secret", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    // Caller passes client-derived predictable secret attempting bypass
    const req = buildRequest("http://localhost:3000/api/scan/seat", "POST", {
      token: "dummy.token",
      unitId: "SCREEN2-A12",
      unitSecret: "smartseat_secret_SCREEN2-A12",
    });

    const res = await postScanSeat(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.reasonCode).toBe("UNAUTHORIZED");
  });

  // =========================================================================
  // 17. Simulated Seat Scanner: Passenger scanning rejected (403)
  // =========================================================================
  it("Scenario 17: Passenger (USER) seat scanning is rejected with HTTP 403", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    const req = buildRequest("http://localhost:3000/api/scan/seat", "POST", {
      token: "dummy.token",
      unitId: "SCREEN2-A12",
    });

    const res = await postScanSeat(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.reasonCode).toBe("FORBIDDEN");
  });

  // =========================================================================
  // 18. Simulated Seat Scanner: Authorized STAFF scanning succeeds authorization
  // =========================================================================
  it("Scenario 18: Authorized STAFF caller passes seat scanning authorization check", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(staffMarshal);

    const createChain = (data: any = null) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gt: () => chain,
        lt: () => chain,
        in: () => chain,
        order: () => chain,
        single: async () => ({ data, error: null }),
        maybeSingle: async () => ({ data, error: null }),
        insert: () => chain,
        update: () => chain,
        upsert: async () => ({ data, error: null }),
        delete: () => chain,
      };
      return chain;
    };

    const mockAdminClient = {
      from: (table: string) => {
        if (table === "seat_units") {
          return createChain({
            id: "SCREEN2-A12",
            seat_id: sampleSeatId,
            secret_hash: "hash",
            seat: { id: sampleSeatId, label: "A12" },
          });
        }
        return createChain(null);
      },
      rpc: async () => ({ data: 1, error: null }),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

    const req = buildRequest("http://localhost:3000/api/scan/seat", "POST", {
      token: "malformed.payload",
      unitId: "SCREEN2-A12",
    });

    const res = await postScanSeat(req);
    const json = await res.json();

    // Caller was NOT rejected with 401 Unauthorized or 403 Forbidden!
    // They passed auth and proceeded to token validation (which returned 400 for malformed token format)
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(400);
    expect(json.reasonCode).toBe("INVALID_FORMAT");
  });

  // =========================================================================
  // 19. Privileged Engine Tick: Rejects unauthenticated (401) and USER (403)
  // =========================================================================
  it("Scenario 19: Privileged engine tick rejects unauthenticated callers (401) and passengers (403)", async () => {
    // 19a: Unauthenticated -> 401
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);
    const resUnauth = await postEngineTick(buildRequest("http://localhost:3000/api/engine/tick", "POST"));
    expect(resUnauth.status).toBe(401);

    // 19b: Passenger USER -> 403
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);
    const resUser = await postEngineTick(buildRequest("http://localhost:3000/api/engine/tick", "POST"));
    expect(resUser.status).toBe(403);

    // 19c: Staff -> 200 OK
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(staffMarshal);
    const createChain = () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        gt: () => chain,
        lt: () => chain,
        in: () => chain,
        order: () => chain,
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        insert: () => chain,
        update: () => chain,
        upsert: async () => ({ error: null }),
        delete: () => chain,
      };
      return chain;
    };

    const mockAdminClient = {
      from: () => createChain(),
      rpc: async () => ({ data: 1, error: null }),
    };
    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);

    const resStaff = await postEngineTick(buildRequest("http://localhost:3000/api/engine/tick", "POST"));
    const jsonStaff = await resStaff.json();
    expect(resStaff.status).toBe(200);
    expect(jsonStaff.status).toBe("OK");
  });
});

