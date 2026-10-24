"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import QRCode from "qrcode";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Ticket,
  LifeBuoy,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Info,
} from "lucide-react";
import { soundManager } from "@/lib/audio";
import { createClient } from "@/lib/supabase/client";

interface TicketData {
  token: string;
  expiresAt: number;
  lifetimeSec: number;
  booking: {
    id: string;
    bookingRef: string;
    status: string;
    seatLabel: string;
    seatUnitId: string;
    eventTitle: string;
    eventStartTime: string;
  };
}

export default function SecureTicketPage({
  params,
}: {
  params: { token: string };
}) {
  const ticketLinkToken = params.token;
  const [data, setData] = useState<TicketData | null>(null);
  const [qrSvg, setQrSvg] = useState<string>("");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Assistance modal state
  const [showAssistModal, setShowAssistModal] = useState<boolean>(false);
  const [assistCategory, setAssistCategory] = useState<string>("WATER_BASIC");
  const [assistNote, setAssistNote] = useState<string>("");
  const [assistStatus, setAssistStatus] = useState<string | null>(null);
  const [assistSubmitting, setAssistSubmitting] = useState<boolean>(false);

  // Realtime Seat State & Awareness
  const [seatOccupancy, setSeatOccupancy] = useState<string>("EMPTY");
  const [seatAuth, setSeatAuth] = useState<string>("UNAUTHORIZED");
  const [seatStateKind, setSeatStateKind] = useState<string>("NORMAL");
  const [privateMessage, setPrivateMessage] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch fresh dynamic token from /api/ticket/[token]/qr
  const fetchFreshToken = useCallback(async () => {
    try {
      const res = await fetch(`/api/ticket/${ticketLinkToken}/qr`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (res.status === 410) {
          setError("This ticket has been cancelled.");
        } else {
          setError(errJson.error || "Failed to load dynamic ticket");
        }
        setLoading(false);
        return;
      }

      const ticketJson: TicketData = await res.json();
      setData(ticketJson);
      setError(null);

      // Render QR code as SVG data URL
      const svg = await QRCode.toString(ticketJson.token, {
        type: "svg",
        margin: 1,
        color: {
          dark: "#ffffff",
          light: "#00000000", // transparent
        },
      });
      setQrSvg(svg);

      // Calculate time remaining based on exp timestamp
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, ticketJson.expiresAt - nowSec);
      setSecondsRemaining(remaining);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Network error loading dynamic ticket");
      setLoading(false);
    }
  }, [ticketLinkToken]);

  // Initial fetch and token refresh loop
  useEffect(() => {
    fetchFreshToken();

    // Refresh token every 28 seconds (lifetime is 30s)
    timerRef.current = setInterval(() => {
      fetchFreshToken();
    }, 28000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchFreshToken]);

  // Smooth 1-second countdown clock
  useEffect(() => {
    countdownIntervalRef.current = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // Supabase Realtime subscription on seat_states & alerts for instant seat awareness
  useEffect(() => {
    if (!data?.booking?.id) return;
    const supabase = createClient();

    // Subscribe to alerts table for staff acknowledgment feedback
    const alertChannel = supabase
      .channel(`ticket_alerts_${data.booking.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "alerts",
          filter: `booking_id=eq.${data.booking.id}`,
        },
        (payload: any) => {
          if (payload.new.status === "ACKNOWLEDGED") {
            setAssistStatus("Help is on the way! Staff acknowledged your request.");
            soundManager.triggerVibration([200, 100, 200]);
          } else if (payload.new.status === "RESOLVED") {
            setAssistStatus("Assistance resolved. Thank you!");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(alertChannel);
    };
  }, [data?.booking?.id]);

  // Copy raw token fallback
  const copyToken = () => {
    if (!data?.token) return;
    navigator.clipboard.writeText(data.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Assistance button click: Instant vibration + register
  const handleAssistClick = async () => {
    soundManager.triggerVibration([150, 80, 150]);
    setShowAssistModal(true);
    setAssistStatus("Request registered. Please confirm category below.");
  };

  const submitAssistance = async () => {
    if (!data?.booking?.id) return;
    setAssistSubmitting(true);
    try {
      const res = await fetch("/api/user/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: data.booking.id,
          category: assistCategory,
          note: assistNote,
        }),
      });
      const resJson = await res.json();
      if (res.ok) {
        setAssistStatus("Request registered with staff. Help is on the way!");
        soundManager.triggerVibration([300]);
        setTimeout(() => setShowAssistModal(false), 2500);
      } else {
        setAssistStatus(resJson.message || "Failed to submit request.");
      }
    } catch {
      setAssistStatus("Network error registering assistance.");
    } finally {
      setAssistSubmitting(false);
    }
  };

  // Cancel booking
  const cancelTicket = async () => {
    if (!confirm("Are you sure you want to cancel this booking and release your seat?")) return;
    try {
      const res = await fetch(`/api/bookings?id=${data?.booking?.id}`, { method: "DELETE" });
      if (res.ok) {
        alert("Booking cancelled.");
        window.location.reload();
      }
    } catch {
      alert("Error cancelling booking.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading secure dynamic ticket...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 glass-panel rounded-2xl border border-rose-500/30 text-center space-y-4">
        <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-white">Ticket Notice</h2>
        <p className="text-sm text-slate-300">{error || "Unable to load ticket."}</p>
        <button
          onClick={fetchFreshToken}
          className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // Calculate countdown SVG circle progress
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (secondsRemaining / 30) * circumference;

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      {/* Ticket Header Card */}
      <div className="glass-panel rounded-3xl border border-slate-800 p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
              SmartSeat Dynamic Credential
            </div>
            <h1 className="text-lg font-black text-white mt-0.5">
              {data.booking.eventTitle}
            </h1>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              {data.booking.bookingRef}
            </span>
          </div>
        </div>

        {/* Seat Highlight Banner */}
        <div className="my-5 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-semibold block uppercase">
              Assigned Seat
            </span>
            <span className="text-3xl font-black text-white tracking-tight">
              {data.booking.seatLabel}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 font-semibold block uppercase">
              Unit ID
            </span>
            <span className="text-xs font-mono text-slate-300">
              {data.booking.seatUnitId}
            </span>
          </div>
        </div>

        {/* Dynamic QR Presentation with Countdown Ring */}
        <div className="relative flex flex-col items-center justify-center p-6 rounded-2xl bg-black/60 border border-slate-800 space-y-4">
          <div className="relative w-56 h-56 flex items-center justify-center bg-slate-950 rounded-2xl border border-slate-800 p-3 shadow-inner">
            {qrSvg ? (
              <div
                className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            )}
          </div>

          {/* Refresh Countdown Ring */}
          <div className="flex items-center gap-3 bg-slate-900/90 px-4 py-2 rounded-full border border-slate-700/80">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <svg className="w-8 h-8 transform -rotate-90">
                <circle
                  cx="16"
                  cy="16"
                  r={12}
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-slate-800"
                  fill="transparent"
                />
                <circle
                  cx="16"
                  cy="16"
                  r={12}
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-indigo-400 transition-all duration-1000 ease-linear"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 12}
                  strokeDashoffset={2 * Math.PI * 12 * (1 - secondsRemaining / 30)}
                />
              </svg>
              <span className="absolute text-[10px] font-mono font-bold text-white">
                {secondsRemaining}
              </span>
            </div>

            <div className="text-left">
              <div className="text-xs font-bold text-slate-200">
                Refreshes in {secondsRemaining}s
              </div>
              <div className="text-[10px] text-slate-400">
                HMAC Signed • Opaque Nonce
              </div>
            </div>

            <button
              onClick={fetchFreshToken}
              className="ml-2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              title="Force Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 text-center max-w-xs">
            Scan this dynamic code at the entrance gate and again upon sitting at Seat{" "}
            <strong>{data.booking.seatLabel}</strong>. Screenshots expire after 30 seconds.
          </p>
        </div>

        {/* Seat Awareness Card */}
        <div className="mt-5 space-y-3">
          {data.booking.status === "SEAT_AUTHORIZED" ? (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-emerald-300">
                  Seat Verified & Occupancy Confirmed
                </div>
                <div className="text-[11px] text-emerald-400/80">
                  Authentication active for Seat {data.booking.seatLabel}.
                </div>
              </div>
            </div>
          ) : data.booking.status === "CHECKED_IN" ? (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-amber-300">
                  Checked In at Entry Gate
                </div>
                <div className="text-[11px] text-amber-400/80">
                  Please proceed to Seat {data.booking.seatLabel} and scan the seat unit.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center gap-3">
              <Ticket className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-blue-300">
                  Ready for Gate Verification
                </div>
                <div className="text-[11px] text-blue-400/80">
                  Present this QR to staff scanner at the entrance.
                </div>
              </div>
            </div>
          )}

          {/* Low-Key Wrong Seat Warning (displayed silently if mismatch happens) */}
          {privateMessage && (
            <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{privateMessage}</span>
            </div>
          )}
        </div>

        {/* Single Assistance / SOS Button */}
        <div className="mt-5 pt-4 border-t border-slate-800">
          <button
            onClick={handleAssistClick}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 via-rose-700 to-amber-700 text-white font-bold text-sm shadow-lg shadow-rose-600/30 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            <LifeBuoy className="w-4 h-4" />
            Request Assistance / SOS
          </button>
        </div>

        {/* Fallback Token Copy Button */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-2">
          <span>Camera not working?</span>
          <button
            onClick={copyToken}
            className="flex items-center gap-1 text-slate-400 hover:text-white underline"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" /> Copied!
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" /> Copy signed token
              </>
            )}
          </button>
        </div>
      </div>

      {/* Assistance Category Modal */}
      {showAssistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-sm w-full rounded-2xl border border-slate-700 p-6 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-rose-500" />
                Assistance Request
              </h3>
              <button
                onClick={() => setShowAssistModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {assistStatus && (
              <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300">
                {assistStatus}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Select Request Category:
              </label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: "WATER_BASIC", label: "Water / Basic Assistance", pri: "LOW" },
                  { id: "SEAT_ISSUE", label: "Seat Recline / Mechanical Issue", pri: "MEDIUM" },
                  { id: "DISTURBANCE", label: "Passenger Disturbance / Noise", pri: "HIGH" },
                  { id: "MEDICAL", label: "Medical Emergency", pri: "CRITICAL" },
                  { id: "EMERGENCY", label: "Immediate Security SOS", pri: "CRITICAL" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setAssistCategory(cat.id)}
                    className={`p-2.5 rounded-xl text-xs font-semibold text-left transition-all border flex items-center justify-between ${
                      assistCategory === cat.id
                        ? "bg-rose-600 text-white border-rose-400 shadow-md"
                        : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        cat.pri === "CRITICAL"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {cat.pri}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Optional Note for Staff:
              </label>
              <input
                type="text"
                value={assistNote}
                onChange={(e) => setAssistNote(e.target.value)}
                placeholder="E.g., Spill in aisle, elderly passenger"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={submitAssistance}
                disabled={assistSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/30 transition-all"
              >
                {assistSubmitting ? "Dispatching..." : "Send to Venue Staff"}
              </button>
              <button
                onClick={() => setShowAssistModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Management Actions */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-2">
        <button
          onClick={cancelTicket}
          className="hover:text-rose-400 transition-colors underline"
        >
          Cancel Booking & Release Seat
        </button>
        <span className="text-[11px]">Seat Verified v1.0</span>
      </div>
    </div>
  );
}
