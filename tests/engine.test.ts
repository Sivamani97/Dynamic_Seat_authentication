import { describe, it, expect } from "vitest";
import { evaluateSeatState } from "../lib/engine";

describe("SmartSeat Verification Engine", () => {
  const defaultSettings = {
    mismatchDelaySec: 15,
    pressureEmptyMax: 19,
    pressureUncertainMax: 59,
    pressureOccupiedMin: 60,
  };

  it("handles empty and unauthorized seat normally without alerts", () => {
    const result = evaluateSeatState({
      seatId: "seat-1",
      currentOccupancy: "EMPTY",
      currentAuthorization: "UNAUTHORIZED",
      currentState: "NORMAL",
      pressure: 0,
      settings: defaultSettings,
    });

    expect(result.newOccupancy).toBe("EMPTY");
    expect(result.newAuthorization).toBe("UNAUTHORIZED");
    expect(result.newState).toBe("NORMAL");
    expect(result.generatedAlert).toBeUndefined();
  });

  it("confirms occupancy when seat is authorized and passenger is seated", () => {
    const result = evaluateSeatState({
      seatId: "seat-1",
      currentOccupancy: "EMPTY",
      currentAuthorization: "AUTHORIZED",
      currentState: "NORMAL",
      pressure: 75, // Human weight
      settings: defaultSettings,
    });

    expect(result.newOccupancy).toBe("OCCUPIED");
    expect(result.newAuthorization).toBe("AUTHORIZED");
    expect(result.newState).toBe("AUTHORIZED");
    expect(result.seatDisplayMessage).toContain("Occupancy Confirmed");
    expect(result.generatedAlert).toBeUndefined();
    expect(result.autoResolveAlertTypes).toContain("WRONG_SEAT");
  });

  it("does NOT trigger wrong seat alert when an object/bag is placed (uncertain pressure)", () => {
    const result = evaluateSeatState({
      seatId: "seat-1",
      currentOccupancy: "EMPTY",
      currentAuthorization: "UNAUTHORIZED",
      currentState: "NORMAL",
      pressure: 35, // Bag/purse: 20..59 range
      settings: defaultSettings,
    });

    expect(result.newOccupancy).toBe("UNCERTAIN");
    expect(result.newState).toBe("NORMAL");
    expect(result.seatDisplayMessage).toContain("Luggage");
    expect(result.generatedAlert).toBeNull();
  });

  it("delays wrong seat alert during the 15s grace period for unauthorized seating", () => {
    const now = new Date("2026-10-24T12:00:10Z");
    const satDownAt = new Date("2026-10-24T12:00:05Z"); // Sat down 5s ago (delay is 15s)

    const result = evaluateSeatState({
      seatId: "seat-1",
      currentOccupancy: "EMPTY",
      currentAuthorization: "UNAUTHORIZED",
      currentState: "NORMAL",
      pressure: 75,
      mismatchSince: satDownAt.toISOString(),
      currentTime: now,
      settings: defaultSettings,
    });

    expect(result.newOccupancy).toBe("OCCUPIED");
    expect(result.newState).toBe("MISMATCH_PENDING");
    expect(result.generatedAlert).toBeNull(); // No alert yet!
    expect(result.seatDisplayMessage).toContain("Please Scan");
  });

  it("triggers silent WRONG_SEAT alert after 15s delay expires", () => {
    const now = new Date("2026-10-24T12:00:20Z");
    const satDownAt = new Date("2026-10-24T12:00:00Z"); // Sat down 20s ago (> 15s)

    const result = evaluateSeatState({
      seatId: "seat-1",
      currentOccupancy: "OCCUPIED",
      currentAuthorization: "UNAUTHORIZED",
      currentState: "MISMATCH_PENDING",
      pressure: 75,
      mismatchSince: satDownAt.toISOString(),
      currentTime: now,
      settings: defaultSettings,
    });

    expect(result.newOccupancy).toBe("OCCUPIED");
    expect(result.newState).toBe("WRONG_SEAT");
    expect(result.generatedAlert).toBeDefined();
    expect(result.generatedAlert?.type).toBe("WRONG_SEAT");
    expect(result.generatedAlert?.priority).toBe("MEDIUM");
    expect(result.privateUserMessage).toContain(
      "This seat is not associated with your booking. Please verify your assigned seat."
    );
  });

  it("marks seat as claimed and temporarily vacated when authorized passenger stands up", () => {
    const result = evaluateSeatState({
      seatId: "seat-1",
      currentOccupancy: "OCCUPIED",
      currentAuthorization: "AUTHORIZED",
      currentState: "AUTHORIZED",
      pressure: 0, // Passenger stood up to stretch or get water
      settings: defaultSettings,
    });

    expect(result.newOccupancy).toBe("TEMPORARILY_VACATED");
    expect(result.newAuthorization).toBe("AUTHORIZED");
    expect(result.newState).toBe("CLAIMED_VACATED");
    expect(result.seatDisplayMessage).toContain("Temporarily Vacated");
    expect(result.generatedAlert).toBeUndefined();
  });

  it("handles sensor fault and suppresses occupancy-based false alerts", () => {
    const result = evaluateSeatState({
      seatId: "seat-1",
      currentOccupancy: "EMPTY",
      currentAuthorization: "UNAUTHORIZED",
      currentState: "NORMAL",
      pressure: 95, // Hardware glitch sending 95
      unitStatus: {
        sensor: "OFFLINE",
        scanner: "OK",
        power: "OK",
        comms: "OK",
        tamper: false,
      },
      settings: defaultSettings,
    });

    expect(result.newState).toBe("FAULT");
    expect(result.seatDisplayMessage).toContain("Maintenance Required");
    expect(result.generatedAlert?.type).toBe("SENSOR_FAILURE");
    expect(result.generatedAlert?.message).toContain("Occupancy Sensor OFFLINE");
  });
});
