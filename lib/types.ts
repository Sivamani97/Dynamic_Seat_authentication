export type UserRole = "USER" | "STAFF" | "ADMIN";

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type VenueType = "THEATRE" | "BUS" | "TRAIN" | "STADIUM";

export interface Venue {
  id: string;
  name: string;
  type: VenueType;
  address?: string;
  created_at: string;
}

export interface ScreenLayout {
  aisles?: number[];
  vip_rows?: string[];
  description?: string;
  [key: string]: any;
}

export interface Screen {
  id: string;
  venue_id: string;
  name: string;
  rows: number;
  cols: number;
  layout_json: ScreenLayout;
  created_at: string;
  venue?: Venue;
}

export type SeatType = "STANDARD" | "VIP" | "ACCESSIBLE";

export interface Seat {
  id: string;
  screen_id: string;
  label: string;
  row: string;
  col: number;
  unit_id: string;
  type: SeatType;
  price: number;
  created_at: string;
}

export interface SeatUnitStatus {
  sensor: "OK" | "OFFLINE" | "ERROR";
  scanner: "OK" | "OFFLINE" | "ERROR";
  power: "OK" | "LOW_BATTERY" | "OUTAGE";
  comms: "OK" | "DISCONNECTED" | "DEGRADED";
  tamper: boolean;
  [key: string]: any;
}

export interface SeatUnit {
  id: string;
  seat_id: string;
  secret_hash: string;
  status_json: SeatUnitStatus;
  last_heartbeat: string;
  created_at: string;
  seat?: Seat;
}

export type EventStatus = "UPCOMING" | "LIVE" | "COMPLETED" | "CANCELLED";

export interface EventItem {
  id: string;
  screen_id: string;
  title: string;
  type: string;
  start_time: string;
  end_time: string;
  status: EventStatus;
  created_at: string;
  screen?: Screen;
}

export type BookingStatus =
  | "BOOKED"
  | "CHECKED_IN"
  | "SEAT_AUTHORIZED"
  | "COMPLETED"
  | "CANCELLED";

export interface Booking {
  id: string;
  booking_ref: string;
  user_id: string;
  event_id: string;
  seat_id: string;
  status: BookingStatus;
  ticket_link_token: string;
  booking_secret: string;
  checked_in_at?: string | null;
  seat_authorized_at?: string | null;
  created_at: string;
  updated_at: string;
  seat?: Seat;
  event?: EventItem;
  user_profile?: Profile;
}

export interface SeatHold {
  id: string;
  event_id: string;
  seat_id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export type OccupancyType = "EMPTY" | "OCCUPIED" | "UNCERTAIN" | "TEMPORARILY_VACATED";
export type AuthorizationType = "UNAUTHORIZED" | "AUTHORIZED";
export type SeatStateKind =
  | "NORMAL"
  | "AUTHORIZED"
  | "MISMATCH_PENDING"
  | "WRONG_SEAT"
  | "SOS"
  | "FAULT"
  | "CLAIMED_VACATED";

export interface SeatState {
  id: string;
  seat_id: string;
  event_id: string;
  occupancy: OccupancyType;
  authorization: AuthorizationType;
  state: SeatStateKind;
  pressure: number;
  mismatch_since?: string | null;
  updated_at: string;
  seat?: Seat;
}

export type AlertType =
  | "WRONG_SEAT"
  | "SOS"
  | "UNCERTAIN_PROLONGED"
  | "SENSOR_FAILURE"
  | "SCANNER_FAILURE"
  | "COMM_FAILURE"
  | "TAMPER"
  | "POWER_FAILURE";

export type AlertPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertStatus = "NEW" | "ACKNOWLEDGED" | "RESOLVED";

export interface Alert {
  id: string;
  event_id?: string | null;
  seat_id?: string | null;
  unit_id?: string | null;
  booking_id?: string | null;
  type: AlertType;
  priority: AlertPriority;
  status: AlertStatus;
  message: string;
  meta: Record<string, any>;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  created_at: string;
  seat?: Seat;
  event?: EventItem;
}

export interface AuditRecord {
  id: number;
  ts: string;
  event_type: string;
  booking_id?: string | null;
  booking_ref?: string | null;
  seat_id?: string | null;
  seat_label?: string | null;
  unit_id?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  status: string;
  meta: Record<string, any>;
  prev_hash: string;
  hash: string;
}

export interface DynamicTokenPayload {
  bid: string;       // Booking ID
  sid: string;       // Seat ID
  eid: string;       // Event ID
  iat: number;       // Issued At (sec)
  exp: number;       // Expiry (sec)
  nonce: string;     // 128-bit random hex string
}

export interface EmailOutboxRecord {
  id: string;
  user_id: string;
  booking_id?: string | null;
  recipient_email: string;
  subject: string;
  body_html: string;
  ticket_link: string;
  sent_at: string;
}
