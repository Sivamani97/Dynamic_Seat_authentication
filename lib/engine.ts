import {
  OccupancyType,
  AuthorizationType,
  SeatStateKind,
  SeatUnitStatus,
  AlertType,
  AlertPriority,
} from "./types";

export interface EngineSeatInput {
  seatId: string;
  unitId?: string;
  currentOccupancy: OccupancyType;
  currentAuthorization: AuthorizationType;
  currentState: SeatStateKind;
  pressure: number;
  mismatchSince?: string | null; // ISO timestamp string or null
  unitStatus?: SeatUnitStatus;
  currentTime?: Date;
  // Threshold settings
  settings?: {
    mismatchDelaySec?: number;       // default 15s
    pressureEmptyMax?: number;       // default 19
    pressureUncertainMax?: number;   // default 59
    pressureOccupiedMin?: number;    // default 60
    prolongedUncertainSec?: number;  // default 300s (5 min)
  };
}

export interface EngineGeneratedAlert {
  type: AlertType;
  priority: AlertPriority;
  message: string;
  meta: Record<string, any>;
}

export interface EngineResult {
  seatId: string;
  newOccupancy: OccupancyType;
  newAuthorization: AuthorizationType;
  newState: SeatStateKind;
  newMismatchSince: string | null;
  seatDisplayMessage: string;
  privateUserMessage?: string;
  generatedAlert?: EngineGeneratedAlert | null;
  autoResolveAlertTypes?: AlertType[];
}

/**
 * Pure state evaluation engine.
 * Deterministic and free of side effects.
 */
export function evaluateSeatState(input: EngineSeatInput): EngineResult {
  const now = input.currentTime || new Date();
  const settings = {
    mismatchDelaySec: input.settings?.mismatchDelaySec ?? 15,
    pressureEmptyMax: input.settings?.pressureEmptyMax ?? 19,
    pressureUncertainMax: input.settings?.pressureUncertainMax ?? 59,
    pressureOccupiedMin: input.settings?.pressureOccupiedMin ?? 60,
    prolongedUncertainSec: input.settings?.prolongedUncertainSec ?? 300,
  };

  const unitStatus = input.unitStatus || {
    sensor: "OK",
    scanner: "OK",
    power: "OK",
    comms: "OK",
    tamper: false,
  };

  // 1. Check Hardware Unit Faults
  // If sensor is faulty or comms down, suppress occupancy alerts and show fault
  if (unitStatus.sensor !== "OK" || unitStatus.power === "OUTAGE" || unitStatus.comms === "DISCONNECTED") {
    let failureMsg = "Seat unit hardware degraded";
    let alertType: AlertType = "SENSOR_FAILURE";

    if (unitStatus.sensor !== "OK") {
      failureMsg = "Occupancy Sensor OFFLINE. Please inspect the seat.";
      alertType = "SENSOR_FAILURE";
    } else if (unitStatus.power === "OUTAGE") {
      failureMsg = "Seat Unit Power Failure. Operating offline.";
      alertType = "POWER_FAILURE";
    } else if (unitStatus.comms === "DISCONNECTED") {
      failureMsg = "Seat Unit Comms Link Lost.";
      alertType = "COMM_FAILURE";
    }

    return {
      seatId: input.seatId,
      newOccupancy: input.currentOccupancy,
      newAuthorization: input.currentAuthorization,
      newState: "FAULT",
      newMismatchSince: null,
      seatDisplayMessage: "🔧 Unit Maintenance Required",
      generatedAlert: {
        type: alertType,
        priority: "MEDIUM",
        message: failureMsg,
        meta: { unitStatus },
      },
    };
  }

  // 2. Classify raw pressure into OccupancyType
  let derivedOccupancy: OccupancyType;
  if (input.pressure <= settings.pressureEmptyMax) {
    // If the seat was authorized and now empty, passenger stood up temporarily
    if (input.currentAuthorization === "AUTHORIZED") {
      derivedOccupancy = "TEMPORARILY_VACATED";
    } else {
      derivedOccupancy = "EMPTY";
    }
  } else if (input.pressure <= settings.pressureUncertainMax) {
    // Between 20 and 59: bag, coat, light object
    derivedOccupancy = "UNCERTAIN";
  } else {
    // >= 60: Human occupancy detected
    derivedOccupancy = "OCCUPIED";
  }

  // Preserve existing authorization unless reset
  const authorization = input.currentAuthorization;

  // 3. Rule Evaluation
  // Case A: EMPTY and UNAUTHORIZED -> Normal idle seat
  if (derivedOccupancy === "EMPTY" && authorization === "UNAUTHORIZED") {
    return {
      seatId: input.seatId,
      newOccupancy: "EMPTY",
      newAuthorization: "UNAUTHORIZED",
      newState: "NORMAL",
      newMismatchSince: null,
      seatDisplayMessage: "Ready for Passenger",
      autoResolveAlertTypes: ["WRONG_SEAT", "UNCERTAIN_PROLONGED"],
    };
  }

  // Case B: TEMPORARILY_VACATED (Authorized passenger stood up)
  if (derivedOccupancy === "TEMPORARILY_VACATED" && authorization === "AUTHORIZED") {
    return {
      seatId: input.seatId,
      newOccupancy: "TEMPORARILY_VACATED",
      newAuthorization: "AUTHORIZED",
      newState: "CLAIMED_VACATED",
      newMismatchSince: null,
      seatDisplayMessage: "✓ Seat Reserved - Temporarily Vacated",
      privateUserMessage: "Your seat remains confirmed.",
      autoResolveAlertTypes: ["WRONG_SEAT"],
    };
  }

  // Case C: OCCUPIED and AUTHORIZED -> Correct passenger seated
  if (derivedOccupancy === "OCCUPIED" && authorization === "AUTHORIZED") {
    return {
      seatId: input.seatId,
      newOccupancy: "OCCUPIED",
      newAuthorization: "AUTHORIZED",
      newState: "AUTHORIZED",
      newMismatchSince: null, // Clear any pending mismatch timer
      seatDisplayMessage: "✓ Seat Verified - Occupancy Confirmed",
      privateUserMessage: "Seat verified and confirmed.",
      autoResolveAlertTypes: ["WRONG_SEAT"],
    };
  }

  // Case D: UNCERTAIN pressure (Luggage, backpack, child seat, coat)
  // Bags must NOT trigger unauthorized occupancy alerts!
  if (derivedOccupancy === "UNCERTAIN") {
    // If prolonged beyond threshold (e.g. 5 minutes), note for staff
    let alert: EngineGeneratedAlert | null = null;
    let mismatchSince = input.mismatchSince;

    if (!mismatchSince) {
      mismatchSince = now.toISOString();
    } else {
      const msElapsed = now.getTime() - new Date(mismatchSince).getTime();
      if (msElapsed >= settings.prolongedUncertainSec * 1000) {
        alert = {
          type: "UNCERTAIN_PROLONGED",
          priority: "LOW",
          message: "Uncertain weight detected on seat for over 5 minutes (possible unattended bag)",
          meta: { pressure: input.pressure, durationSeconds: Math.floor(msElapsed / 1000) },
        };
      }
    }

    return {
      seatId: input.seatId,
      newOccupancy: "UNCERTAIN",
      newAuthorization: authorization,
      newState: authorization === "AUTHORIZED" ? "AUTHORIZED" : "NORMAL",
      newMismatchSince: mismatchSince,
      seatDisplayMessage: "Luggage / Object Detected",
      generatedAlert: alert,
    };
  }

  // Case E: OCCUPIED and UNAUTHORIZED -> Potential Wrong Seat Mismatch
  if (derivedOccupancy === "OCCUPIED" && authorization === "UNAUTHORIZED") {
    let mismatchSince = input.mismatchSince;
    let isMismatchTriggered = false;

    if (!mismatchSince) {
      // Start the mismatch timer
      mismatchSince = now.toISOString();
    }

    const elapsedSeconds =
      (now.getTime() - new Date(mismatchSince).getTime()) / 1000;

    if (elapsedSeconds >= settings.mismatchDelaySec) {
      isMismatchTriggered = true;
    }

    if (isMismatchTriggered) {
      return {
        seatId: input.seatId,
        newOccupancy: "OCCUPIED",
        newAuthorization: "UNAUTHORIZED",
        newState: "WRONG_SEAT",
        newMismatchSince: mismatchSince,
        seatDisplayMessage: "⚠ Please Verify Your Seat",
        privateUserMessage:
          "This seat is not associated with your booking. Please verify your assigned seat.",
        generatedAlert: {
          type: "WRONG_SEAT",
          priority: "MEDIUM",
          message: `Unauthorized occupancy detected at seat. Seated for ${Math.floor(
            elapsedSeconds
          )}s without valid authorization token.`,
          meta: {
            pressure: input.pressure,
            mismatchSince,
            elapsedSeconds: Math.floor(elapsedSeconds),
          },
        },
      };
    } else {
      // Still in grace period delay (e.g. passenger just sat down and is opening their QR)
      return {
        seatId: input.seatId,
        newOccupancy: "OCCUPIED",
        newAuthorization: "UNAUTHORIZED",
        newState: "MISMATCH_PENDING",
        newMismatchSince: mismatchSince,
        seatDisplayMessage: "Please Scan Seat QR",
        privateUserMessage: "Please scan your ticket to verify this seat.",
        generatedAlert: null,
      };
    }
  }

  // Fallback
  return {
    seatId: input.seatId,
    newOccupancy: derivedOccupancy,
    newAuthorization: authorization,
    newState: "NORMAL",
    newMismatchSince: null,
    seatDisplayMessage: "Ready",
  };
}
