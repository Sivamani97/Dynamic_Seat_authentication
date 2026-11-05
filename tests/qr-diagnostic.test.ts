import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { generateDynamicToken, verifyDynamicToken } from "../lib/tokens";
import { POST as postScanEntry } from "../app/api/scan/entry/route";
import * as serverLib from "../lib/supabase/server";

describe("QR Scanner Root-Cause Diagnostic & Validation Test Suite", () => {
  const sampleBookingId = "b0000000-0000-0000-0000-000000000a12";
  const sampleSeatId = "a1200000-0000-0000-0000-000000000a12";
  const sampleEventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const sampleBookingSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const staffMarshal = {
    id: "33333333-3333-3333-3333-333333333333",
    email: "marshal@smartseat.internal",
    role: "STAFF" as const,
  };

  function buildRequest(url: string, method: string, body?: any, headers?: Record<string, string>): NextRequest {
    return new NextRequest(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  const createMockChain = (data: any = null) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      single: async () => ({ data, error: null }),
      maybeSingle: async () => ({ data, error: null }),
      insert: async () => ({ data: [data], error: null }),
      update: () => chain,
      upsert: async () => ({ data, error: null }),
      delete: () => chain,
    };
    return chain;
  };

  it("Diagnostic Test 1: Plain text QR 'HELLO123' generates valid SVG with quiet zone", async () => {
    const svg = await QRCode.toString("HELLO123", {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
    });
    expect(svg).toBeDefined();
    expect(svg).toContain("<svg");
  });

  it("Diagnostic Test 2: Real Passenger Dynamic Token generates valid HMAC token and QR SVG", async () => {
    const dynamic = generateDynamicToken({
      bookingId: sampleBookingId,
      seatId: sampleSeatId,
      eventId: sampleEventId,
      bookingSecret: sampleBookingSecret,
      lifetimeSec: 30,
    });

    expect(dynamic.token).toContain(".");
    expect(dynamic.payload.bid).toBe(sampleBookingId);
    expect(dynamic.payload.sid).toBe(sampleSeatId);

    const verify = verifyDynamicToken(dynamic.token, sampleBookingSecret, { clockSkewSec: 180 });
    expect(verify.valid).toBe(true);

    const svg = await QRCode.toString(dynamic.token, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
    });
    expect(svg).toBeDefined();
    expect(svg.length).toBeGreaterThan(1000);
  });

  it("Diagnostic Test 3: Backend response when plain QR 'HELLO123' is submitted", async () => {
    const mockAdminClient = {
      from: (table: string) => {
        if (table === "bookings") return createMockChain(null); // not found
        return createMockChain(null);
      },
      rpc: async () => ({ data: 1, error: null }),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(staffMarshal);

    const req = buildRequest("http://localhost:3000/api/scan/entry", "POST", {
      token: "HELLO123",
      eventId: sampleEventId,
    }, {
      "x-turnstile-scanner": "smartseat-gate-scanner-v1",
    });

    const res = await postScanEntry(req);
    const json = await res.json();

    // Plain text is NOT a valid dot-separated HMAC token or recognized link
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.reasonCode).toBe("INVALID_FORMAT");
    expect(json.message).toContain("invalid format");
  });

  it("Diagnostic Test 4: Real passenger QR token validates and checks in passenger", async () => {
    const dynamic = generateDynamicToken({
      bookingId: sampleBookingId,
      seatId: sampleSeatId,
      eventId: sampleEventId,
      bookingSecret: sampleBookingSecret,
      lifetimeSec: 30,
    });

    const mockBooking = {
      id: sampleBookingId,
      booking_ref: "BK829173",
      user_id: "11111111-1111-1111-1111-111111111111",
      event_id: sampleEventId,
      seat_id: sampleSeatId,
      status: "BOOKED",
      booking_secret: sampleBookingSecret,
      checked_in_at: null,
      seat: { id: sampleSeatId, label: "A12", row: "A", col: 12, screen: { name: "Screen 2", venue: { name: "Grand Cinema" } } },
      event: { id: sampleEventId, title: "Movie XYZ", start_time: new Date().toISOString() },
    };

    const mockAdminClient = {
      from: (table: string) => {
        if (table === "bookings") return createMockChain(mockBooking);
        if (table === "profiles") return createMockChain({ name: "Alice Wonderland" });
        if (table === "used_tokens") return createMockChain({ nonce: dynamic.payload.nonce });
        if (table === "seat_states") return createMockChain({});
        return createMockChain(null);
      },
      rpc: async () => ({ data: 1, error: null }),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(staffMarshal);

    const req = buildRequest("http://localhost:3000/api/scan/entry", "POST", {
      token: dynamic.token,
      eventId: sampleEventId,
    }, {
      "x-turnstile-scanner": "smartseat-gate-scanner-v1",
    });

    const res = await postScanEntry(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.status).toBe("CHECKED_IN");
    expect(json.bookingRef).toBe("BK829173");
    expect(json.seatLabel).toBe("A12");
  });

  it("Diagnostic Test 5: Re-scan of already checked-in ticket returns 200 with entry authorized", async () => {
    const dynamic = generateDynamicToken({
      bookingId: sampleBookingId,
      seatId: sampleSeatId,
      eventId: sampleEventId,
      bookingSecret: sampleBookingSecret,
      lifetimeSec: 30,
    });

    const mockAlreadyCheckedInBooking = {
      id: sampleBookingId,
      booking_ref: "BK829173",
      user_id: "11111111-1111-1111-1111-111111111111",
      event_id: sampleEventId,
      seat_id: sampleSeatId,
      status: "CHECKED_IN",
      booking_secret: sampleBookingSecret,
      checked_in_at: new Date().toISOString(),
      seat: { id: sampleSeatId, label: "A12", row: "A", col: 12, screen: { name: "Screen 2", venue: { name: "Grand Cinema" } } },
      event: { id: sampleEventId, title: "Movie XYZ", start_time: new Date().toISOString() },
    };

    const mockAdminClient = {
      from: (table: string) => {
        if (table === "bookings") return createMockChain(mockAlreadyCheckedInBooking);
        if (table === "profiles") return createMockChain({ name: "Alice Wonderland" });
        return createMockChain(null);
      },
      rpc: async () => ({ data: 1, error: null }),
    };

    vi.spyOn(serverLib, "getAdminClient").mockReturnValue(mockAdminClient as any);
    vi.spyOn(serverLib, "getAuthenticatedUser").mockResolvedValue(staffMarshal);

    const req = buildRequest("http://localhost:3000/api/scan/entry", "POST", {
      token: dynamic.token,
    }, {
      "x-turnstile-scanner": "smartseat-gate-scanner-v1",
    });

    const res = await postScanEntry(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe("ENTRY AUTHORIZED");
    expect(json.displayMessage).toContain("Already Checked In");
  });
});
