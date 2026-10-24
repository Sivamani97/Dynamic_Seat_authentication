"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Film,
  MapPin,
  Clock,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface SeatModel {
  id: string;
  label: string;
  row: string;
  col: number;
  type: string;
  price: number;
  unit_id: string;
  isBooked?: boolean;
  isHeld?: boolean;
}

export default function EventSeatMapPage({
  params,
}: {
  params: { id: string };
}) {
  const eventId = params.id;
  const router = useRouter();

  const [selectedSeat, setSelectedSeat] = useState<SeatModel | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<number | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [bookingInProgress, setBookingInProgress] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generate 5 rows (A to E) x 12 columns
  const [seats, setSeats] = useState<SeatModel[]>([]);

  const targetEventId =
    eventId && eventId.length === 36 ? eventId : "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

  useEffect(() => {
    let isMounted = true;
    async function loadSeats() {
      try {
        const res = await fetch(`/api/events/${targetEventId}/seats`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.seats && data.seats.length > 0) {
            setSeats(data.seats);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to fetch seats from API, using deterministic seats", e);
      }

      // Deterministic valid UUID fallback
      const generatedSeats: SeatModel[] = [];
      const rows = ["A", "B", "C", "D", "E"];

      rows.forEach((r) => {
        for (let c = 1; c <= 12; c++) {
          const label = `${r}${c}`;
          const unitId = `SCREEN2-${label}`;
          const isVip = r === "D" || r === "E";
          const isPrebooked = label === "A12" || label === "B4";
          const rHex = r.charCodeAt(0).toString(16).padStart(4, "0");
          const cHex = c.toString(16).padStart(12, "0");
          const deterministicId =
            label === "A12"
              ? "a1200000-0000-0000-0000-000000000a12"
              : label === "A13"
              ? "a1300000-0000-0000-0000-000000000a13"
              : label === "B4"
              ? "b0400000-0000-0000-0000-000000000b04"
              : `00000000-${rHex}-0000-0000-${cHex}`;

          generatedSeats.push({
            id: deterministicId,
            label,
            row: r,
            col: c,
            type: isVip ? "VIP" : "STANDARD",
            price: isVip ? 22.5 : 16.0,
            unit_id: unitId,
            isBooked: isPrebooked,
          });
        }
      });

      if (isMounted) {
        setSeats(generatedSeats);
        setLoading(false);
      }
    }

    loadSeats();
    return () => {
      isMounted = false;
    };
  }, [targetEventId]);

  // 120s Hold Timer countdown
  useEffect(() => {
    if (!holdExpiresAt) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((holdExpiresAt - Date.now()) / 1000));
      setHoldSecondsLeft(remaining);

      if (remaining <= 0) {
        setHoldExpiresAt(null);
        setSelectedSeat(null);
        setErrorMessage("Seat hold expired. Please reselect your seat.");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  // Request 2-minute Seat Hold
  const handleSelectSeat = async (seat: SeatModel) => {
    if (seat.isBooked) return;
    setErrorMessage(null);

    try {
      const res = await fetch("/api/bookings/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: targetEventId,
          seatId: seat.id,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        setErrorMessage(resJson.message || "Unable to hold seat.");
        return;
      }

      setSelectedSeat(seat);
      const expiresEpoch = Date.now() + 120 * 1000;
      setHoldExpiresAt(expiresEpoch);
      setHoldSecondsLeft(120);
    } catch {
      // Fallback local hold simulation
      setSelectedSeat(seat);
      const expiresEpoch = Date.now() + 120 * 1000;
      setHoldExpiresAt(expiresEpoch);
      setHoldSecondsLeft(120);
    }
  };

  // Confirm Booking & Seat Reservation
  const handleConfirmBooking = async () => {
    if (!selectedSeat) return;
    setBookingInProgress(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: targetEventId,
          seatId: selectedSeat.id,
          userEmail: "user1@demo.com",
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        setErrorMessage(resJson.message || "Failed to confirm booking");
        setBookingInProgress(false);
        return;
      }

      // Successfully booked! Redirect directly to dynamic ticket view!
      router.push(`/t/${resJson.ticketLinkToken}`);
    } catch (err: any) {
      setErrorMessage(err.message || "Network error while completing booking.");
      setBookingInProgress(false);
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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Event Details Header */}
      <div className="glass-panel rounded-3xl border border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Film className="w-3.5 h-3.5" />
            <span>Grand Cinema Multiplex • Screen 2</span>
          </div>
          <h1 className="text-2xl font-black text-white">
            Movie XYZ: The Quantum Paradox
          </h1>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>7:30 PM Today</span>
            <span>•</span>
            <span>Dolby Atmos 4K Auditorium</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-md bg-slate-800 border border-slate-700"></div>
            <span className="text-slate-400">Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-md bg-indigo-600 border border-indigo-400"></div>
            <span className="text-indigo-300">Selected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-md bg-slate-900 border border-slate-800 opacity-40"></div>
            <span className="text-slate-500">Booked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-md bg-purple-950 border border-purple-500/50"></div>
            <span className="text-purple-300">VIP Row</span>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2D Interactive Seat Map */}
      <div className="glass-card rounded-3xl border border-slate-800 p-6 sm:p-10 space-y-8 text-center overflow-x-auto">
        {/* Cinema Projection Screen Curve */}
        <div className="max-w-md mx-auto space-y-2">
          <div className="h-2 w-full rounded-full bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent shadow-lg shadow-indigo-500/40" />
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            Auditorium Screen
          </div>
        </div>

        {/* Seat Rows Grid */}
        <div className="inline-block min-w-[620px] space-y-3">
          {["A", "B", "C", "D", "E"].map((rowLetter) => (
            <div key={rowLetter} className="flex items-center justify-center gap-2">
              <span className="w-6 text-xs font-bold text-slate-400 text-right">
                {rowLetter}
              </span>

              <div className="flex items-center gap-1.5">
                {seats
                  .filter((s) => s.row === rowLetter)
                  .map((seat) => {
                    const isSelected = selectedSeat?.id === seat.id;
                    const isVip = seat.type === "VIP";

                    return (
                      <button
                        key={seat.id}
                        disabled={seat.isBooked}
                        onClick={() => handleSelectSeat(seat)}
                        className={`w-9 h-9 rounded-xl text-xs font-bold transition-all relative group flex items-center justify-center ${
                          seat.isBooked
                            ? "bg-slate-900 border border-slate-800/80 text-slate-600 cursor-not-allowed opacity-40"
                            : isSelected
                            ? "bg-indigo-600 text-white border-2 border-indigo-300 shadow-lg shadow-indigo-600/50 scale-110 z-10"
                            : isVip
                            ? "bg-purple-950/70 border border-purple-500/40 text-purple-200 hover:border-purple-400 hover:bg-purple-900"
                            : "bg-slate-800/90 border border-slate-700/80 text-slate-300 hover:border-slate-500 hover:bg-slate-700"
                        }`}
                        title={`Seat ${seat.label} - ${formatCurrency(seat.price)}`}
                      >
                        {seat.label}
                        {/* Aisle gap indicator after column 4 and 8 */}
                        {(seat.col === 4 || seat.col === 8) && (
                          <div className="absolute -right-3 top-0 bottom-0 w-2 pointer-events-none" />
                        )}
                      </button>
                    );
                  })}
              </div>

              <span className="w-6 text-xs font-bold text-slate-400 text-left">
                {rowLetter}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Checkout Hold Bar */}
      {selectedSeat && (
        <div className="glass-panel fixed bottom-6 left-1/2 -translate-x-1/2 max-w-xl w-[92%] rounded-2xl border border-indigo-500/50 p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 z-40 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-white text-lg">
              {selectedSeat.label}
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Seat {selectedSeat.label} Held</span>
                <span className="text-indigo-400 font-extrabold">
                  {formatCurrency(selectedSeat.price)}
                </span>
              </div>
              <div className="text-[11px] text-amber-400 flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Hold expires in: <strong>{holdSecondsLeft}s</strong>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleConfirmBooking}
            disabled={bookingInProgress}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
          >
            {bookingInProgress ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Securing Seat...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Confirm & Get Dynamic Ticket</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
