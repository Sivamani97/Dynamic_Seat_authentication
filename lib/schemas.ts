import { z } from "zod";

export const ScanEntrySchema = z.object({
  token: z.string().min(1, "Token is required"),
  eventId: z.string().uuid("Invalid event ID format"),
});

export const ScanSeatSchema = z.object({
  token: z.string().min(1, "Token is required"),
  unitId: z.string().min(1, "Unit ID is required"),
  unitSecret: z.string().min(1, "Unit secret is required"),
});

export const SeatOccupancyUpdateSchema = z.object({
  unitId: z.string().min(1, "Unit ID is required"),
  unitSecret: z.string().min(1, "Unit secret is required"),
  pressure: z.number().min(0).max(100),
  eventId: z.string().uuid("Invalid event ID"),
});

export const SeatAssistSchema = z.object({
  unitId: z.string().min(1, "Unit ID is required"),
  category: z
    .enum(["WATER_BASIC", "SEAT_ISSUE", "DISTURBANCE", "MEDICAL", "EMERGENCY"])
    .default("WATER_BASIC"),
  note: z.string().optional(),
});

export const UserInAppAssistSchema = z.object({
  bookingId: z.string().uuid("Invalid booking ID"),
  category: z
    .enum(["WATER_BASIC", "SEAT_ISSUE", "DISTURBANCE", "MEDICAL", "EMERGENCY"])
    .default("WATER_BASIC"),
  note: z.string().optional(),
});

export const SeatHeartbeatSchema = z.object({
  unitId: z.string().min(1, "Unit ID is required"),
  unitSecret: z.string().min(1, "Unit secret is required"),
  status: z.object({
    sensor: z.enum(["OK", "OFFLINE", "ERROR"]),
    scanner: z.enum(["OK", "OFFLINE", "ERROR"]),
    power: z.enum(["OK", "LOW_BATTERY", "OUTAGE"]),
    comms: z.enum(["OK", "DISCONNECTED", "DEGRADED"]),
    tamper: z.boolean(),
  }),
});

export const CreateHoldSchema = z.object({
  eventId: z.string().uuid(),
  seatId: z.string().uuid(),
});

export const ConfirmBookingSchema = z.object({
  eventId: z.string().uuid(),
  seatId: z.string().uuid(),
});

export const AlertActionSchema = z.object({
  alertId: z.string().uuid(),
  action: z.enum(["ACKNOWLEDGE", "RESOLVE", "ESCALATE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  resolutionNote: z.string().optional(),
});

export const ManualOverrideSchema = z.object({
  seatId: z.string().uuid(),
  eventId: z.string().uuid(),
  action: z.enum(["AUTHORIZE_SEAT", "REASSIGN_SEAT", "RESET_STATE"]),
  newSeatId: z.string().uuid().optional(),
  reason: z.string().min(3, "Override reason must be provided"),
});
