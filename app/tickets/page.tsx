"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ticket, Clock, CheckCircle2, QrCode, XCircle, ArrowRight, RefreshCw } from "lucide-react";
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
    </div>
  );
}
