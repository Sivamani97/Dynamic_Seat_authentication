import crypto from "crypto";
import { DynamicTokenPayload } from "./types";

const DEFAULT_SERVER_SECRET =
  process.env.TOKEN_SIGNING_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Base64URL encode a buffer or string
 */
function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Base64URL decode
 */
function base64UrlDecode(input: string): string {
  let str = input.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  return Buffer.from(str, "base64").toString("utf8");
}

/**
 * Generates a 128-bit random nonce in hex (32 hex characters)
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export interface GenerateTokenOptions {
  bookingId: string;
  seatId: string;
  eventId: string;
  bookingSecret: string;
  lifetimeSec?: number;
  serverSecret?: string;
  customNonce?: string;
  customIat?: number;
}

/**
 * Generates an opaque signed dynamic QR token
 * Form: base64url(payload) + "." + base64url(hmac-sha256(payload, serverSecret + ":" + bookingSecret))
 */
export function generateDynamicToken(opts: GenerateTokenOptions): {
  token: string;
  expiresAt: number;
  payload: DynamicTokenPayload;
} {
  const lifetime = opts.lifetimeSec || 30;
  const now = opts.customIat ?? Math.floor(Date.now() / 1000);
  const exp = now + lifetime;
  const nonce = opts.customNonce || generateNonce();

  const payload: DynamicTokenPayload = {
    bid: opts.bookingId,
    sid: opts.seatId,
    eid: opts.eventId,
    iat: now,
    exp: exp,
    nonce: nonce,
  };

  const payloadString = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadString);

  const secretCombined = (opts.serverSecret || DEFAULT_SERVER_SECRET) + ":" + opts.bookingSecret;
  const hmac = crypto.createHmac("sha256", secretCombined);
  hmac.update(payloadB64);
  const sigB64 = base64UrlEncode(hmac.digest());

  return {
    token: `${payloadB64}.${sigB64}`,
    expiresAt: exp,
    payload,
  };
}

export interface VerifyTokenResult {
  valid: boolean;
  reasonCode?:
    | "INVALID_FORMAT"
    | "INVALID_SIGNATURE"
    | "TOKEN_EXPIRED"
    | "TOKEN_PREMATURE"
    | "CORRUPT_PAYLOAD";
  reasonMessage?: string;
  payload?: DynamicTokenPayload;
}

/**
 * Cryptographically verifies a dynamic token
 * Allows +-clockSkewSec (default 5s) for network transmission skew
 */
export function verifyDynamicToken(
  tokenString: string,
  bookingSecret: string,
  options?: {
    clockSkewSec?: number;
    currentTimeSec?: number;
    serverSecret?: string;
  }
): VerifyTokenResult {
  if (!tokenString || typeof tokenString !== "string") {
    return {
      valid: false,
      reasonCode: "INVALID_FORMAT",
      reasonMessage: "Token is empty or invalid format",
    };
  }

  const parts = tokenString.split(".");
  if (parts.length !== 2) {
    return {
      valid: false,
      reasonCode: "INVALID_FORMAT",
      reasonMessage: "Token must contain payload and signature segments",
    };
  }

  const [payloadB64, sigB64] = parts;
  let payload: DynamicTokenPayload;

  try {
    const jsonStr = base64UrlDecode(payloadB64);
    payload = JSON.parse(jsonStr);
  } catch (err) {
    return {
      valid: false,
      reasonCode: "CORRUPT_PAYLOAD",
      reasonMessage: "Unable to parse token payload JSON",
    };
  }

  if (
    !payload.bid ||
    !payload.sid ||
    !payload.eid ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    !payload.nonce
  ) {
    return {
      valid: false,
      reasonCode: "CORRUPT_PAYLOAD",
      reasonMessage: "Token payload missing required fields",
    };
  }

  // 1. Verify HMAC Signature
  const secretCombined =
    (options?.serverSecret || DEFAULT_SERVER_SECRET) + ":" + bookingSecret;
  const hmac = crypto.createHmac("sha256", secretCombined);
  hmac.update(payloadB64);
  const expectedSigB64 = base64UrlEncode(hmac.digest());

  // Timing safe comparison to prevent timing attacks
  const sigBuf = Buffer.from(sigB64);
  const expectedBuf = Buffer.from(expectedSigB64);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return {
      valid: false,
      reasonCode: "INVALID_SIGNATURE",
      reasonMessage: "HMAC signature verification failed",
    };
  }

  // 2. Check Expiry with clock skew
  const clockSkew = options?.clockSkewSec ?? 5;
  const now = options?.currentTimeSec ?? Math.floor(Date.now() / 1000);

  if (now > payload.exp + clockSkew) {
    return {
      valid: false,
      reasonCode: "TOKEN_EXPIRED",
      reasonMessage: `Token expired at ${payload.exp} (skew allowed +${clockSkew}s, current time ${now})`,
      payload,
    };
  }

  if (now < payload.iat - clockSkew) {
    return {
      valid: false,
      reasonCode: "TOKEN_PREMATURE",
      reasonMessage: "Token used before issuance timestamp",
      payload,
    };
  }

  return {
    valid: true,
    payload,
  };
}
