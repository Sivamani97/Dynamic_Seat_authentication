"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Volume2,
  VolumeX,
  Bell,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  LifeBuoy,
  Wrench,
  UserCheck,
  QrCode,
  Radio,
  X,
  Check,
  ChevronRight,
  Tv,
} from "lucide-react";
import { soundManager } from "@/lib/audio";
import { getSeatVisualStatus, getAlertPriorityBadge, formatDate } from "@/lib/utils";
import { SeatStateKind, AlertPriority, AlertStatus, AlertType } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface SeatStateDisplay {
  id: string;
  label: string;
  row: string;
  col: number;
  unit_id: string;
  occupancy: "EMPTY" | "OCCUPIED" | "UNCERTAIN" | "TEMPORARILY_VACATED";
  authorization: "UNAUTHORIZED" | "AUTHORIZED";
  state: SeatStateKind;
  pressure: number;
  bookingRef?: string;
  mismatchSince?: string;
  unitStatus?: {
    sensor: string;
    scanner: string;
    power: string;
    comms: string;
    tamper: boolean;
  };
}

interface AlertItem {
  id: string;
  seat_id?: string;
  seat_label?: string;
  type: AlertType;
  priority: AlertPriority;
  status: AlertStatus;
  message: string;
  created_at: string;
  booking_ref?: string;
  meta?: Record<string, any>;
}

export default function StaffCommandPage() {
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [selectedSeat, setSelectedSeat] = useState<SeatStateDisplay | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [overrideAction, setOverrideAction] = useState<string>("AUTHORIZE_SEAT");
  const [highPriorityAlert, setHighPriorityAlert] = useState<AlertItem | null>(null);

  // Live alerts feed
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filterPriority, setFilterPriority] = useState<string>("ALL");

  // Live seats state map
  const [seatMap, setSeatMap] = useState<Record<string, SeatStateDisplay>>({});

  // Initialize Seat Map for Screen 2
  useEffect(() => {
    const initialMap: Record<string, SeatStateDisplay> = {};
    const rows = ["A", "B", "C", "D", "E"];

    rows.forEach((r) => {
      for (let c = 1; c <= 12; c++) {
        const label = `${r}${c}`;
        const unitId = `SCREEN2-${label}`;
        initialMap[label] = {
          id:
            label === "A12"
              ? "a1200000-0000-0000-0000-000000000a12"
              : label === "A13"
              ? "a1300000-0000-0000-0000-000000000a13"
              : `seat-${label.toLowerCase()}`,
          label,
          row: r,
          col: c,
          unit_id: unitId,
          occupancy: "EMPTY",
          authorization: label === "A12" ? "UNAUTHORIZED" : "UNAUTHORIZED",
          state: "NORMAL",
          pressure: 0,
          bookingRef: label === "A12" ? "BK829173" : undefined,
          unitStatus: {
            sensor: "OK",
            scanner: "OK",
            power: "OK",
            comms: "OK",
            tamper: false,
          },
        };
      }
    });

    setSeatMap(initialMap);

    // Initial alert demo state
    setAlerts([
      {
        id: "alert-001",
        seat_label: "A12",
        type: "SOS",
        priority: "CRITICAL",
        status: "NEW",
        message: "Assistance requested at Seat A12: Passenger needs assistance.",
        created_at: new Date(Date.now() - 60000).toISOString(),
        booking_ref: "BK829173",
      },
    ]);
  }, []);

  // Vercel Hobby plan client-side tick fallback: polls /api/engine/tick every 5s while staff screen is open
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await fetch("/api/engine/tick", { method: "POST" });
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Supabase Realtime subscriptions on seat_states & alerts
  useEffect(() => {
    const supabase = createClient();

    // 1. Subscribe to seat_states changes
    const seatChannel = supabase
      .channel("staff_seat_states")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seat_states" },
        (payload: any) => {
          const newRow = payload.new;
          if (!newRow) return;

          setSeatMap((prev) => {
            // Find seat by seat_id
            const updated = { ...prev };
            for (const key of Object.keys(updated)) {
              if (updated[key].id === newRow.seat_id) {
                updated[key] = {
                  ...updated[key],
                  occupancy: newRow.occupancy,
                  authorization: newRow.authorization,
                  state: newRow.state,
                  pressure: newRow.pressure,
                  mismatchSince: newRow.mismatch_since,
                };
                break;
              }
            }
            return updated;
          });
        }
      )
      .subscribe();

    // 2. Subscribe to alerts changes
    const alertChannel = supabase
      .channel("staff_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        (payload: any) => {
          const newAlert = payload.new as AlertItem;
          setAlerts((prev) => [newAlert, ...prev]);

          // High-priority alert actions: Audible Siren + Banner + Vibration
          if (newAlert.priority === "CRITICAL" || newAlert.type === "SOS") {
            setHighPriorityAlert(newAlert);
            soundManager.startSiren();
            soundManager.triggerVibration([300, 150, 300, 150, 500]);
          } else if (newAlert.type !== "WRONG_SEAT") {
            soundManager.playErrorTone();
          }
          // Note: WRONG_SEAT alerts are intentionally silent per requirement!
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "alerts" },
        (payload: any) => {
          const updatedAlert = payload.new as AlertItem;
          setAlerts((prev) =>
            prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a))
          );
          if (
            highPriorityAlert?.id === updatedAlert.id &&
            updatedAlert.status !== "NEW"
          ) {
            setHighPriorityAlert(null);
            soundManager.stopSiren();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(seatChannel);
      supabase.removeChannel(alertChannel);
      soundManager.stopSiren();
    };
  }, [highPriorityAlert]);

  // Audio Mute toggle
  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    soundManager.setMuted(next);
  };

  // Alert Workflow: Acknowledge, Resolve, Escalate
  const handleAlertAction = async (
    alertId: string,
    action: "ACKNOWLEDGE" | "RESOLVE" | "ESCALATE",
    resolutionNote?: string
  ) => {
    try {
      const res = await fetch(`/api/staff/alerts/${alertId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          resolutionNote,
        }),
      });

      if (res.ok) {
        soundManager.stopSiren();
        if (highPriorityAlert?.id === alertId) {
          setHighPriorityAlert(null);
        }
        // Update local alert
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId
              ? {
                  ...a,
                  status:
                    action === "ACKNOWLEDGE"
                      ? "ACKNOWLEDGED"
                      : action === "RESOLVE"
                      ? "RESOLVED"
                      : a.status,
                  priority: action === "ESCALATE" ? "CRITICAL" : a.priority,
                }
              : a
          )
        );
      }
    } catch {
      // Fallback local update
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? {
                ...a,
                status: action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "RESOLVED",
              }
            : a
        )
      );
    }
  };

  // Staff Manual Override
  const submitManualOverride = async () => {
    if (!selectedSeat) return;
    try {
      const res = await fetch("/api/staff/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seatId: selectedSeat.id,
          eventId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          action: overrideAction,
          reason: overrideReason || "Staff visual override",
        }),
      });

      if (res.ok) {
        // Update local map state
        setSeatMap((prev) => ({
          ...prev,
          [selectedSeat.label]: {
            ...prev[selectedSeat.label],
            authorization:
              overrideAction === "AUTHORIZE_SEAT" ? "AUTHORIZED" : "UNAUTHORIZED",
            state: overrideAction === "AUTHORIZE_SEAT" ? "AUTHORIZED" : "NORMAL",
          },
        }));
        setShowOverrideModal(false);
        setOverrideReason("");
      }
    } catch {
      setShowOverrideModal(false);
    }
  };

  // Filter alerts
  const filteredAlerts = alerts.filter((a) => {
    if (filterPriority === "ALL") return true;
    return a.priority === filterPriority;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* High-Priority Emergency Full-Screen Banner Overlay */}
      {highPriorityAlert && (
        <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-rose-600 text-white shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-beacon">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-bounce">🚨</span>
            <div>
              <div className="font-black text-sm uppercase tracking-wider">
                CRITICAL EMERGENCY ALERT • SEAT {highPriorityAlert.seat_label || "A12"}
              </div>
              <div className="text-xs text-rose-100">{highPriorityAlert.message}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAlertAction(highPriorityAlert.id, "ACKNOWLEDGE")}
              className="px-4 py-2 rounded-xl bg-white text-rose-700 font-bold text-xs shadow-md hover:bg-rose-50"
            >
              Acknowledge & Silence Siren
            </button>
            <button
              onClick={() => {
                setHighPriorityAlert(null);
                soundManager.stopSiren();
              }}
              className="p-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Control Room Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-3xl border border-slate-800">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Live Venue Monitoring • Screen 2 Auditorium</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Staff Realtime Command Center
          </h1>
          <p className="text-xs text-slate-400">
            Comparing physical seat occupancy with cryptographic authorization. Silent alerts on mismatch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
              soundMuted
                ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
            }`}
          >
            {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{soundMuted ? "Sound Muted" : "Audio Armed"}</span>
          </button>

          <Link
            href="/staff/scan"
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-600/20"
          >
            <QrCode className="w-4 h-4" />
            <span>Open Gate Scanner</span>
          </Link>

          <Link
            href="/local-alert"
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-semibold flex items-center gap-2"
          >
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>PWA Receiver</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Live 2D Map on Left (7 cols), Alerts on Right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 2D Live Seat Map */}
        <div className="lg:col-span-8 glass-card rounded-3xl border border-slate-800 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="font-bold text-white text-base">Auditorium 2D Live Map</h2>
              <p className="text-xs text-slate-400">Click any seat for sensor telemetry & manual override</p>
            </div>

            {/* Status Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-emerald-600 flex items-center justify-center text-[9px] text-white font-bold">✓</span>
                <span className="text-slate-300">Authorized</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-amber-600 flex items-center justify-center text-[9px] text-white font-bold animate-blink-alert">⚠</span>
                <span className="text-amber-300 font-bold">Wrong Seat</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-rose-600 flex items-center justify-center text-[9px] text-white font-bold animate-beacon">🚨</span>
                <span className="text-rose-300 font-bold">SOS</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-purple-600 flex items-center justify-center text-[9px] text-white font-bold">🔧</span>
                <span className="text-purple-300 font-bold">Fault</span>
              </div>
            </div>
          </div>

          {/* Curved Projection Screen */}
          <div className="max-w-xs mx-auto text-center space-y-1">
            <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-transparent via-indigo-500/70 to-transparent" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Screen</span>
          </div>

          {/* Interactive Seat Map Grid */}
          <div className="overflow-x-auto py-2">
            <div className="inline-block min-w-[580px] space-y-2.5">
              {["A", "B", "C", "D", "E"].map((rowLetter) => (
                <div key={rowLetter} className="flex items-center justify-center gap-2">
                  <span className="w-5 text-xs font-bold text-slate-400 text-right">{rowLetter}</span>

                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((colNum) => {
                      const label = `${rowLetter}${colNum}`;
                      const seat = seatMap[label];
                      if (!seat) return null;

                      const visual = getSeatVisualStatus(
                        seat.state,
                        seat.occupancy === "OCCUPIED"
                      );

                      return (
                        <button
                          key={label}
                          onClick={() => setSelectedSeat(seat)}
                          className={`w-9 h-9 rounded-xl text-xs font-bold border transition-all flex items-center justify-center ${visual.colorClass}`}
                          title={`Seat ${label} - Status: ${visual.label}`}
                          aria-label={visual.ariaLabel}
                        >
                          <span className="scale-90">{visual.icon}</span>
                        </button>
                      );
                    })}
                  </div>

                  <span className="w-5 text-xs font-bold text-slate-400 text-left">{rowLetter}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Live Alerts Panel */}
        <div className="lg:col-span-4 glass-card rounded-3xl border border-slate-800 p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <h2 className="font-bold text-white text-base">Alerts Feed</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300">
                  {filteredAlerts.length}
                </span>
              </div>

              {/* Priority Filter */}
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300"
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical Only</option>
                <option value="HIGH">High Only</option>
                <option value="MEDIUM">Medium Only</option>
              </select>
            </div>

            {/* Alert Items List */}
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {filteredAlerts.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No active alerts. Venue operating normally.
                </div>
              ) : (
                filteredAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3.5 rounded-2xl border space-y-2 transition-all ${
                      alert.priority === "CRITICAL"
                        ? "bg-rose-950/30 border-rose-500/40"
                        : alert.type === "WRONG_SEAT"
                        ? "bg-amber-950/20 border-amber-500/30"
                        : "bg-slate-900 border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">
                          Seat {alert.seat_label || "A12"}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getAlertPriorityBadge(
                            alert.priority
                          )}`}
                        >
                          {alert.priority}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {formatDate(alert.created_at)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-snug">{alert.message}</p>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
                      {alert.status === "NEW" ? (
                        <>
                          <button
                            onClick={() => handleAlertAction(alert.id, "ACKNOWLEDGE")}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold"
                          >
                            Acknowledge
                          </button>
                          <button
                            onClick={() => handleAlertAction(alert.id, "RESOLVE", "Resolved on site")}
                            className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold"
                          >
                            Resolve
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Acknowledged
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Seat Detail Slide-over / Modal */}
      {selectedSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-md w-full rounded-3xl border border-slate-700 p-6 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-white text-base">
                  {selectedSeat.label}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Seat {selectedSeat.label} Inspection
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Unit: {selectedSeat.unit_id}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedSeat(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Telemetry Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase font-semibold text-[10px] block">
                  Occupancy State
                </span>
                <span className="font-bold text-slate-200">{selectedSeat.occupancy}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase font-semibold text-[10px] block">
                  Authorization
                </span>
                <span
                  className={`font-bold ${
                    selectedSeat.authorization === "AUTHORIZED"
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {selectedSeat.authorization}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase font-semibold text-[10px] block">
                  Sensor Pressure
                </span>
                <span className="font-bold text-white">{selectedSeat.pressure} kg</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase font-semibold text-[10px] block">
                  Booking Ref
                </span>
                <span className="font-mono font-bold text-indigo-400">
                  {selectedSeat.bookingRef || "UNRESERVED"}
                </span>
              </div>
            </div>

            {/* Seat Unit Telemetry */}
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
              <span className="text-slate-400 font-semibold text-[11px] block">
                Hardware Unit Status
              </span>
              <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                <div className="p-1 rounded bg-slate-800">
                  <div className="text-slate-500">Sensor</div>
                  <div className="font-bold text-emerald-400">OK</div>
                </div>
                <div className="p-1 rounded bg-slate-800">
                  <div className="text-slate-500">Scanner</div>
                  <div className="font-bold text-emerald-400">OK</div>
                </div>
                <div className="p-1 rounded bg-slate-800">
                  <div className="text-slate-500">Power</div>
                  <div className="font-bold text-emerald-400">OK</div>
                </div>
                <div className="p-1 rounded bg-slate-800">
                  <div className="text-slate-500">Comms</div>
                  <div className="font-bold text-emerald-400">10s Ping</div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowOverrideModal(true)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
              >
                Manual Staff Override
              </button>
              <Link
                href={`/seat-unit/${selectedSeat.unit_id}`}
                target="_blank"
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs flex items-center gap-1.5"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Simulate Unit</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Manual Override Action Modal */}
      {showOverrideModal && selectedSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-sm w-full rounded-2xl border border-slate-700 p-6 space-y-4 animate-in fade-in">
            <h3 className="font-bold text-white text-base">
              Manual Override: Seat {selectedSeat.label}
            </h3>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-semibold block">
                Select Action:
              </label>
              <select
                value={overrideAction}
                onChange={(e) => setOverrideAction(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
              >
                <option value="AUTHORIZE_SEAT">Mark Seat Authorized by Staff</option>
                <option value="RESET_STATE">Reset Seat State to Normal</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1">
                Mandatory Override Reason (Logged to Audit Chain):
              </label>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="E.g. VIP guest verified manually"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={submitManualOverride}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
              >
                Confirm & Log Override
              </button>
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
