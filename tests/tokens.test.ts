import { describe, it, expect } from "vitest";
import { generateDynamicToken, verifyDynamicToken } from "../lib/tokens";

describe("SmartSeat Dynamic Token Generator & Verifier", () => {
  const sampleBooking = {
    bookingId: "b0000000-0000-0000-0000-000000000001",
    seatId: "s0000000-0000-0000-0000-000000000a12",
    eventId: "e0000000-0000-0000-0000-000000000001",
    bookingSecret: "secret_booking_key_9999",
    lifetimeSec: 30,
  };

  it("generates a signed dynamic token with 30s lifetime and 128-bit nonce", () => {
    const tokenResult = generateDynamicToken(sampleBooking);

    expect(tokenResult.token).toBeDefined();
    expect(tokenResult.token.split(".")).toHaveLength(2);
    expect(tokenResult.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(tokenResult.payload.bid).toBe(sampleBooking.bookingId);
    expect(tokenResult.payload.sid).toBe(sampleBooking.seatId);
    expect(tokenResult.payload.eid).toBe(sampleBooking.eventId);
    expect(tokenResult.payload.nonce).toHaveLength(32); // 128-bit hex = 32 chars
  });

  it("successfully verifies a valid, unexpired token", () => {
    const { token } = generateDynamicToken(sampleBooking);
    const result = verifyDynamicToken(token, sampleBooking.bookingSecret);

    expect(result.valid).toBe(true);
    expect(result.payload?.bid).toBe(sampleBooking.bookingId);
    expect(result.payload?.sid).toBe(sampleBooking.seatId);
  });

  it("rejects token when signature does not match (tampered payload)", () => {
    const { token } = generateDynamicToken(sampleBooking);
    const [payloadB64, sigB64] = token.split(".");

    // Alter payload to pretend to be a different seat
    const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    decoded.sid = "s0000000-0000-0000-0000-000000000a13";
    const forgedPayloadB64 = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    const forgedToken = `${forgedPayloadB64}.${sigB64}`;
    const result = verifyDynamicToken(forgedToken, sampleBooking.bookingSecret);

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("INVALID_SIGNATURE");
  });

  it("rejects token when booking secret is incorrect", () => {
    const { token } = generateDynamicToken(sampleBooking);
    const result = verifyDynamicToken(token, "wrong_secret_attacker");

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("INVALID_SIGNATURE");
  });

  it("rejects expired token beyond the 5s clock skew grace period", () => {
    const nowSec = 1700000000;
    const { token } = generateDynamicToken({
      ...sampleBooking,
      customIat: nowSec - 40, // issued 40s ago, expires in 30s -> expired 10s ago
      lifetimeSec: 30,
    });

    const result = verifyDynamicToken(token, sampleBooking.bookingSecret, {
      currentTimeSec: nowSec,
      clockSkewSec: 5,
    });

    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("TOKEN_EXPIRED");
  });

  it("allows token within the 5s clock skew grace period", () => {
    const nowSec = 1700000000;
    const { token } = generateDynamicToken({
      ...sampleBooking,
      customIat: nowSec - 32, // expired 2 seconds ago, within +5s skew
      lifetimeSec: 30,
    });

    const result = verifyDynamicToken(token, sampleBooking.bookingSecret, {
      currentTimeSec: nowSec,
      clockSkewSec: 5,
    });

    expect(result.valid).toBe(true);
  });

  it("generates distinct nonces for sequential tokens to prevent replay", () => {
    const t1 = generateDynamicToken(sampleBooking);
    const t2 = generateDynamicToken(sampleBooking);

    expect(t1.payload.nonce).not.toBe(t2.payload.nonce);
    expect(t1.token).not.toBe(t2.token);
  });
});
