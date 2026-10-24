import { describe, it, expect } from "vitest";
import { computeAuditHash, verifyAuditChain } from "../lib/audit";
import { AuditRecord } from "../lib/types";

describe("SmartSeat Tamper-Evident Audit Log Hash Chain", () => {
  it("computes reproducible canonical SHA-256 hash", () => {
    const hash1 = computeAuditHash(
      "GENESIS_000000000000000000000000000000000000000000000000000000000000",
      1700000000,
      "BOOKING_CREATED",
      "BK829173",
      "A12",
      "SCREEN2-A12",
      "USER",
      "SUCCESS",
      { price: 16 }
    );

    const hash2 = computeAuditHash(
      "GENESIS_000000000000000000000000000000000000000000000000000000000000",
      1700000000,
      "BOOKING_CREATED",
      "BK829173",
      "A12",
      "SCREEN2-A12",
      "USER",
      "SUCCESS",
      { price: 16 }
    );

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // 256-bit hex
  });

  it("verifies an intact sequential cryptographic hash chain", () => {
    const records: AuditRecord[] = [
      {
        id: 0,
        ts: "2026-10-24T12:00:00Z",
        event_type: "SYSTEM_GENESIS",
        status: "SUCCESS",
        meta: {},
        prev_hash: "0000000000000000000000000000000000000000000000000000000000000000",
        hash: "GENESIS_000000000000000000000000000000000000000000000000000000000000",
      },
      {
        id: 1,
        ts: "2026-10-24T12:01:00Z",
        event_type: "BOOKING_CREATED",
        booking_ref: "BK829173",
        seat_label: "A12",
        status: "SUCCESS",
        meta: {},
        prev_hash: "GENESIS_000000000000000000000000000000000000000000000000000000000000",
        hash: "hash_row_1_abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
      },
      {
        id: 2,
        ts: "2026-10-24T12:02:00Z",
        event_type: "ENTRY_VERIFIED",
        booking_ref: "BK829173",
        seat_label: "A12",
        status: "SUCCESS",
        meta: {},
        prev_hash: "hash_row_1_abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
        hash: "hash_row_2_1111222233334444555566667777888899990000aaaabbbbccccddddeeee",
      },
      {
        id: 3,
        ts: "2026-10-24T12:03:00Z",
        event_type: "SEAT_AUTHORIZED",
        booking_ref: "BK829173",
        seat_label: "A12",
        status: "SUCCESS",
        meta: {},
        prev_hash: "hash_row_2_1111222233334444555566667777888899990000aaaabbbbccccddddeeee",
        hash: "hash_row_3_fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987",
      },
    ];

    const result = verifyAuditChain(records);
    expect(result.valid).toBe(true);
    expect(result.totalChecked).toBe(4);
    expect(result.corruptedRowId).toBeUndefined();
  });

  it("detects tampering when an adversary modifies a record in the chain", () => {
    const tamperedRecords: AuditRecord[] = [
      {
        id: 0,
        ts: "2026-10-24T12:00:00Z",
        event_type: "SYSTEM_GENESIS",
        status: "SUCCESS",
        meta: {},
        prev_hash: "0000000000000000000000000000000000000000000000000000000000000000",
        hash: "GENESIS_HASH",
      },
      {
        id: 1,
        ts: "2026-10-24T12:01:00Z",
        event_type: "BOOKING_CREATED",
        status: "SUCCESS",
        meta: {},
        prev_hash: "GENESIS_HASH",
        hash: "ORIGINAL_ROW_1_HASH",
      },
      {
        id: 2,
        ts: "2026-10-24T12:02:00Z",
        event_type: "ENTRY_VERIFIED",
        status: "SUCCESS",
        meta: {},
        // Adversary tampered with prev_hash or swapped row 1
        prev_hash: "FORGED_PREV_HASH",
        hash: "ROW_2_HASH",
      },
    ];

    const result = verifyAuditChain(tamperedRecords);
    expect(result.valid).toBe(false);
    expect(result.corruptedRowId).toBe(2);
    expect(result.failureReason).toContain("Hash link broken");
  });
});
