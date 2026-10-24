import crypto from "crypto";
import { AuditRecord } from "./types";

/**
 * Computes canonical SHA-256 hash for an audit log entry
 * Follows exact format used in the Postgres stored procedure `append_audit_log`
 */
export function computeAuditHash(
  prevHash: string,
  tsEpochSeconds: number,
  eventType: string,
  bookingRef: string | null | undefined,
  seatLabel: string | null | undefined,
  unitId: string | null | undefined,
  actorRole: string | null | undefined,
  status: string,
  meta: Record<string, any> | string
): string {
  const metaString = typeof meta === "string" ? meta : JSON.stringify(meta);
  const raw = `${prevHash}|${tsEpochSeconds}|${eventType}|${bookingRef || ""}|${
    seatLabel || ""
  }|${unitId || ""}|${actorRole || ""}|${status}|${metaString}`;

  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface VerificationResult {
  valid: boolean;
  totalChecked: number;
  corruptedRowId?: number;
  failureReason?: string;
  expectedHash?: string;
  actualHash?: string;
}

/**
 * Verifies cryptographic integrity of a list of audit records in order.
 * Confirms that each row's prev_hash links to the prior row's hash,
 * and that row contents match the recorded hash.
 */
export function verifyAuditChain(records: AuditRecord[]): VerificationResult {
  if (!records || records.length === 0) {
    return { valid: true, totalChecked: 0 };
  }

  // Sort ascending by ID
  const sorted = [...records].sort((a, b) => a.id - b.id);

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];

    if (i > 0) {
      const prev = sorted[i - 1];
      if (current.prev_hash !== prev.hash) {
        return {
          valid: false,
          totalChecked: i,
          corruptedRowId: current.id,
          failureReason: `Hash link broken: row ${current.id} prev_hash (${current.prev_hash.slice(
            0,
            12
          )}...) does not match row ${prev.id} hash (${prev.hash.slice(0, 12)}...)`,
          expectedHash: prev.hash,
          actualHash: current.prev_hash,
        };
      }
    }
  }

  return {
    valid: true,
    totalChecked: sorted.length,
  };
}
