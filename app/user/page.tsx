"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Smartphone,
  Ticket,
  Clock,
  ShieldCheck,
  ArrowRight,
  Flame,
  Radio,
  Mail,
  QrCode,
  AlertCircle,
  Tv,
} from "lucide-react";

export default function UserPortalPage() {
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(30);

  // Poll 30s countdown for visual demonstration to project guide
  useEffect(() => {
    const interval = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = 30 - (nowSec % 30);
      setSecondsLeft(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="glass-panel rounded-3xl border border-slate-800 p-6 md:p-8 space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <Smartphone className="w-3.5 h-3.5" />
          <span>Passenger Mobile Interface (Display 1 of 4)</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Passenger & User Portal
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
          This dedicated passenger interface allows users to reserve seats, view their cryptographically signed 30-second regenerating dynamic ticket, and request emergency assistance.
        </p>

        {/* Quick Links for Guide */}
        <div className="pt-2 flex flex-wrap gap-2 text-xs">
          <span className="text-slate-500 font-semibold py-1">Quick Navigate:</span>
          <Link
            href="/reader"
            className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-indigo-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            Go to QR Reader &rarr;
          </Link>
          <Link
            href="/user/staff"
            className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-amber-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            Go to Staff Portal &rarr;
          </Link>
          <Link
            href="/admin"
            className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-purple-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            Go to Admin Module &rarr;
          </Link>
        </div>
      </div>

      {/* Active Ticket Hero Card (Seat A12) */}
      <div className="rounded-3xl glass-card border border-indigo-500/30 p-6 md:p-8 bg-gradient-to-br from-indigo-950/40 via-slate-900/80 to-purple-950/20 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
              Active Booking Credential
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Movie XYZ: The Quantum Paradox
            </h2>
            <p className="text-xs text-slate-400">
              Screen 2 (Dolby Cinema) • Booking Ref: <span className="text-indigo-300 font-mono font-bold">BK829173</span>
            </p>
          </div>

          {/* 30s Dynamic Countdown Widget */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800 self-start sm:self-auto">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  className="text-slate-800 stroke-current"
                  strokeWidth="3"
                  fill="none"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  className="text-indigo-500 stroke-current transition-all duration-1000"
                  strokeWidth="3"
                  strokeDasharray={94.2}
                  strokeDashoffset={94.2 - (94.2 * secondsLeft) / 30}
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute font-mono text-xs font-bold text-white">
                {secondsLeft}s
              </span>
            </div>
            <div className="text-[11px] leading-tight">
              <span className="font-bold text-white block">Dynamic QR</span>
              <span className="text-slate-400">Auto-regenerates every 30s</span>
            </div>
          </div>
        </div>

        {/* Seat & Status Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Seat</span>
            <span className="text-2xl font-black text-emerald-400">A12</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Seat Row</span>
            <span className="text-2xl font-black text-white">Row A</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Ticket Security</span>
            <span className="text-xs font-bold text-indigo-300 mt-1 block">HMAC-SHA256</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Status</span>
            <span className="text-xs font-bold text-teal-400 mt-1 block">CHECKED_IN</span>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href="/t/tok_bk829173_secure_demo_link"
            className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white font-bold text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
          >
            <QrCode className="w-4 h-4" />
            <span>Open Dynamic 30s Ticket Screen</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/reader"
            className="py-3 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-sm flex items-center justify-center gap-2"
          >
            <QrCode className="w-4 h-4 text-purple-400" />
            <span>Present to Reader Page</span>
          </Link>
        </div>
      </div>

      {/* Passenger Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Interactive Seat Selection */}
        <div className="p-6 rounded-2xl glass-card border border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Ticket className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Seat Booking Map</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Browse available auditorium seats (A1–E14), place a 2-minute checkout hold, and confirm ticket reservation.
            </p>
          </div>
          <Link
            href="/events/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-indigo-600 text-xs font-semibold text-white flex items-center justify-between"
          >
            <span>Book Other Seats</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Card 2: My Bookings & Tickets */}
        <div className="p-6 rounded-2xl glass-card border border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">My Tickets</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Access all tickets booked by your user profile, view check-in history, and launch dynamic credentials.
            </p>
          </div>
          <Link
            href="/tickets"
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-purple-600 text-xs font-semibold text-white flex items-center justify-between"
          >
            <span>View All Tickets</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Card 3: Simulated Email Outbox */}
        <div className="p-6 rounded-2xl glass-card border border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Mail className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Email Outbox</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Zero-cost in-app email dispatcher. Review confirmation emails, magic ticket links, and booking summaries.
            </p>
          </div>
          <Link
            href="/outbox"
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-amber-600 text-xs font-semibold text-white flex items-center justify-between"
          >
            <span>Open Email Outbox</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Guide Note */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs text-slate-400 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white block">Project Guide Presentation Workflow:</strong>
          <span>
            Open <strong>/user</strong> on a mobile phone or left browser window to act as the passenger showing the 30s dynamic QR. Open <strong>/reader</strong> on another window to scan or validate the ticket, and observe the live seat status change on <strong>/user/staff</strong> in real time.
          </span>
        </div>
      </div>
    </div>
  );
}
