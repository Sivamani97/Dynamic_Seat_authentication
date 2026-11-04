"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ticket, Clock, CheckCircle2, QrCode, XCircle, ArrowRight, RefreshCw, LifeBuoy, Info, AlertTriangle } from "lucide-react";
import { getStatusBadge, formatDate } from "@/lib/utils";

interface BookingModel {
  id: string;
  booking_ref: string;
  status: "BOOKED" | "CHECKED_IN" | "SEAT_AUTHORIZED" | "COMPLETED" | "CANCELLED";
  ticket_link_token: string;
  created_at: string;
  seat?: {
    label: string;
    unit_id: string;
    price: number;
  };
  event?: {
    title: string;
    start_time: string;
    screen?: {
      name: string;
      venue?: {
        name: string;
      };
    };
  };
}

export default function MyTicketsPage() {
  const [bookings, setBookings] = useState<BookingModel[]>([]);
  const [loading, setLoading] = useState(true);

  // Assistance modal state
  const [selectedBookingForAssist, setSelectedBookingForAssist] = useState<BookingModel | null>(null);
  const [assistCategory, setAssistCategory] = useState<string>("WATER_BASIC");
  const [assistNote, setAssistNote] = useState<string>("");
  const [assistStatus, setAssistStatus] = useState<string | null>(null);
  const [assistSubmitting, setAssistSubmitting] = useState<boolean>(false);
  const [confirmUnderstood, setConfirmUnderstood] = useState<boolean>(false);
  const [existingAlert, setExistingAlert] = useState<{ id: string; status: string; priority: string } | null>(null);

  const openAssistModal = async (booking: BookingModel) => {
    setSelectedBookingForAssist(booking);
    setAssistStatus(null);
    setConfirmUnderstood(false);
    setExistingAlert(null);
    try {
      const res = await fetch(`/api/user/assist?bookingId=${booking.id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.hasActiveAlert && json.alert) {
          setExistingAlert(json.alert);
          setAssistStatus(`Active request already registered (${json.alert.status}). Venue staff has been alerted.`);
        }
      }
    } catch {
      // Ignore background check errors
    }
  };

  const submitAssistance = async () => {
    if (!selectedBookingForAssist) return;
    setAssistSubmitting(true);
    try {
      const res = await fetch("/api/user/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: selectedBookingForAssist.id,
          category: assistCategory,
          note: assistNote,
        }),
      });
      const resJson = await res.json();
      if (res.ok) {
        setAssistStatus("Assistance request registered! Venue staff has been alerted.");
        setExistingAlert({
          id: resJson.alertId,
          status: resJson.status || "NEW",
          priority: resJson.priority || "HIGH",
        });
        setTimeout(() => setSelectedBookingForAssist(null), 2500);
      } else {
        setAssistStatus(resJson.message || "Failed to submit assistance request.");
      }
    } catch {
      setAssistStatus("Network error registering assistance.");
    } finally {
      setAssistSubmitting(false);
    }
  };

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bookings");
      const json = await res.json();
      if (res.ok && json.bookings) {
        setBookings(json.bookings);
      }
    } catch {
      // Fallback pre-seeded ticket for demo
      setBookings([
        {
          id: "b0000000-0000-0000-0000-000000000a12",
          booking_ref: "BK829173",
          status: "BOOKED",
          ticket_link_token: "tok_bk829173_secure_demo_link",
          created_at: new Date().toISOString(),
          seat: {
            label: "A12",
            unit_id: "SCREEN2-A12",
            price: 16.0,
          },
          event: {
            title: "Movie XYZ: The Quantum Paradox (Dolby Cinema)",
            start_time: new Date(Date.now() + 60 * 60000).toISOString(),
            screen: {
              name: "Screen 2",
              venue: {
                name: "Grand Cinema Multiplex",
              },
            },
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const cancelTicket = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this booking and release the seat?")) return;
    try {
      const res = await fetch(`/api/bookings?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchBookings();
      }
    } catch {
      alert("Error cancelling booking");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">My Tickets</h1>
          <p className="text-sm text-slate-400">
            Cryptographically bound dynamic credentials with real-time seat awareness.
          </p>
        </div>
        <Link
          href="/events"
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20"
        >
          <Ticket className="w-4 h-4" />
          Book Another Seat
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-slate-800 p-12 text-center space-y-4">
          <Ticket className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">No Bookings Yet</h3>
          <p className="text-sm text-slate-400">Browse events and reserve your first seat.</p>
          <Link
            href="/events"
            className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs"
          >
            Browse Events
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const badge = getStatusBadge(booking.status);
            return (
              <div
                key={booking.id}
                className="glass-card rounded-2xl border border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-slate-700 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {booking.booking_ref}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white">
                    {booking.event?.title || "Event Reservation"}
                  </h3>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <span>
                      {booking.event?.screen?.venue?.name} • {booking.event?.screen?.name}
                    </span>
                    <span>•</span>
                    <span>{formatDate(booking.event?.start_time || booking.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 border-t md:border-t-0 pt-4 md:pt-0 border-slate-800">
                  <div className="text-center md:text-right pr-4 md:border-r border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Assigned Seat
                    </span>
                    <span className="text-2xl font-black text-white">
                      {booking.seat?.label || "A12"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/t/${booking.ticket_link_token}`}
                      className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Open Dynamic QR</span>
                    </Link>

                    {["BOOKED", "CHECKED_IN", "SEAT_AUTHORIZED"].includes(booking.status) && (
                      <button
                        onClick={() => openAssistModal(booking)}
                        className="py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <LifeBuoy className="w-3.5 h-3.5 text-rose-400" />
                        <span>Request SOS</span>
                      </button>
                    )}

                    {booking.status !== "CANCELLED" && (
                      <button
                        onClick={() => cancelTicket(booking.id)}
                        className="text-[11px] text-slate-500 hover:text-rose-400 text-center"
                      >
                        Cancel Ticket
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Passenger Assistance Modal */}
      {selectedBookingForAssist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-sm w-full rounded-2xl border border-slate-700 p-6 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <LifeBuoy className="w-5 h-5 text-rose-500" />
                  Request Assistance
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Seat {selectedBookingForAssist.seat?.label || "Assigned"} • Ref: {selectedBookingForAssist.booking_ref}
                </p>
              </div>
              <button
                onClick={() => setSelectedBookingForAssist(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Demonstration Only Warning */}
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>
                <strong>Demonstration only:</strong> This application simulates in-venue staff assistance dispatch and does not contact 911/112 emergency services.
              </span>
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

            {/* Explicit Confirmation Checkbox */}
            {!existingAlert && (
              <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={confirmUnderstood}
                  onChange={(e) => setConfirmUnderstood(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500"
                />
                <span>I confirm this is an intentional request for venue staff assistance.</span>
              </label>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={submitAssistance}
                disabled={assistSubmitting || (!existingAlert && !confirmUnderstood)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs shadow-md shadow-rose-600/30 transition-all"
              >
                {assistSubmitting
                  ? "Dispatching..."
                  : existingAlert
                  ? "Update Request"
                  : "Send to Venue Staff"}
              </button>
              <button
                onClick={() => setSelectedBookingForAssist(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
