import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/bookings/hold/route";
import * as serverLib from "../lib/supabase/server";

describe("Seat Hold Authorization & Concurrency Suite", () => {
  const sampleEventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const sampleSeatId = "a1200000-0000-0000-0000-000000000a12";

  const userAlice = { id: "11111111-1111-1111-1111-111111111111", email: "alice@demo.com" };
  const userBob = { id: "22222222-2222-2222-2222-222222222222", email: "bob@demo.com" };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to build NextRequest
  function buildHoldRequest(body: any, headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost:3000/api/bookings/hold", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  // =========================================================================
  // 1. Missing Authentication -> 401
  // =========================================================================
  it("returns HTTP 401 Unauthorized when request has no authentication credentials", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    const req = buildHoldRequest({
      eventId: sampleEventId,
      seatId: sampleSeatId,
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.message).toContain("Authentication required");
  });

  // =========================================================================
  // 2. Invalid Identity / Client-provided x-user-id rejection -> 401
  // =========================================================================
  it("rejects client-provided x-user-id header without verified session, returning HTTP 401", async () => {
    // Client sends an unverified x-user-id header attempting to impersonate Alice
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    const req = buildHoldRequest(
      { eventId: sampleEventId, seatId: sampleSeatId },
      { "x-user-id": userAlice.id }
    );

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.message).toContain("Authentication required");
  });

  it("returns HTTP 401 when Bearer token is invalid or expired", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(null);

    const req = buildHoldRequest(
      { eventId: sampleEventId, seatId: sampleSeatId },
      { authorization: "Bearer invalid_or_expired_jwt_token" }
    );

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  // =========================================================================
  // 3. Different Owner on Active Hold -> 409
  // =========================================================================
  it("returns HTTP 409 Conflict when another user owns the active hold", async () => {
    // Authenticated as Bob
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userBob);

    const now = new Date();
    const activeHoldAlice = {
      id: "hold-alice-1",
      event_id: sampleEventId,
      seat_id: sampleSeatId,
      user_id: userAlice.id, // Owned by Alice
      expires_at: new Date(now.getTime() + 60 * 1000).toISOString(), // Active for 60s
    };

    const mockAdminClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({ maybeSingle: async () => ({ data: null }) }), // No existing confirmed booking
              gt: () => ({ maybeSingle: async () => ({ data: activeHoldAlice }) }), // Alice's active hold
              maybeSingle: async () => ({ data: { id: sampleSeatId } }),
            }),
          }),
        }),
        delete: () => ({ eq: () => ({ eq: () => ({ lte: async () => ({}) }) }), lt: async () => ({}) }),
      }),
    } as any;

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient);

    const req = buildHoldRequest(
      { eventId: sampleEventId, seatId: sampleSeatId },
      { authorization: "Bearer valid_bob_token" }
    );

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.message).toContain("temporarily held by another passenger");
  });

  // =========================================================================
  // 4. Same Owner on Active Hold -> 200 (Refreshed)
  // =========================================================================
  it("allows only the authenticated owner to refresh their own active hold", async () => {
    // Authenticated as Alice
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userAlice);

    const now = new Date();
    const activeHoldAlice = {
      id: "hold-alice-1",
      event_id: sampleEventId,
      seat_id: sampleSeatId,
      user_id: userAlice.id, // Alice owns the hold
      expires_at: new Date(now.getTime() + 30 * 1000).toISOString(),
    };

    let updatedExpiresAt = "";
    const mockAdminClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({ maybeSingle: async () => ({ data: null }) }),
              gt: () => ({ maybeSingle: async () => ({ data: activeHoldAlice }) }),
              maybeSingle: async () => ({ data: { id: sampleSeatId } }),
            }),
          }),
        }),
        update: (updates: any) => {
          updatedExpiresAt = updates.expires_at;
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { ...activeHoldAlice, expires_at: updatedExpiresAt },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
    } as any;

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient);

    const req = buildHoldRequest(
      { eventId: sampleEventId, seatId: sampleSeatId },
      { authorization: "Bearer valid_alice_token" }
    );

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain("refreshed");
    expect(new Date(json.expiresAt).getTime()).toBeGreaterThan(now.getTime());
  });

  // =========================================================================
  // 5. Expired Hold Ignored & Successfully Acquired by New User -> 200
  // =========================================================================
  it("ignores expired hold using server-side timestamps and allows new user to acquire seat", async () => {
    // Authenticated as Bob
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userBob);

    let expiredHoldPruned = false;
    let newHoldInserted: any = null;

    const mockAdminClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({ maybeSingle: async () => ({ data: null }) }), // No booking
              gt: () => ({ maybeSingle: async () => ({ data: null }) }), // Server timestamp query: expired hold returns null!
            }),
            maybeSingle: async () => ({ data: { id: sampleSeatId } }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: () => ({
              lte: async () => {
                expiredHoldPruned = true;
                return { count: 1 };
              },
            }),
          }),
          lt: async () => ({ count: 0 }),
        }),
        insert: (data: any) => {
          newHoldInserted = data;
          return {
            select: () => ({
              single: async () => ({
                data: { id: "hold-bob-new", ...data },
                error: null,
              }),
            }),
          };
        },
      }),
    } as any;

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient);

    const req = buildHoldRequest(
      { eventId: sampleEventId, seatId: sampleSeatId },
      { authorization: "Bearer valid_bob_token" }
    );

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(expiredHoldPruned).toBe(true);
    expect(newHoldInserted.user_id).toBe(userBob.id);
  });

  // =========================================================================
  // 6. Concurrency / Unique Constraint Conflict (Postgres 23505) -> 409
  // =========================================================================
  it("prevents race condition when two concurrent requests attempt to hold same seat, returning HTTP 409", async () => {
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(userBob);

    const mockAdminClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({ maybeSingle: async () => ({ data: null }) }),
              gt: () => ({ maybeSingle: async () => ({ data: null }) }),
            }),
            maybeSingle: async () => ({ data: { id: sampleSeatId } }),
          }),
        }),
        delete: () => ({
          eq: () => ({ eq: () => ({ lte: async () => ({}) }) }),
          lt: async () => ({ count: 0 }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: {
                code: "23505",
                message: 'duplicate key value violates unique constraint "seat_holds_event_id_seat_id_key"',
              },
            }),
          }),
        }),
      }),
    } as any;

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient);

    const req = buildHoldRequest(
      { eventId: sampleEventId, seatId: sampleSeatId },
      { authorization: "Bearer valid_bob_token" }
    );

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.message).toContain("just held by another passenger");
  });
});
