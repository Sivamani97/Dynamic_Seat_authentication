"use client";

import { useState } from "react";
import { BarChart3, TrendingUp, AlertTriangle, Clock, Wrench, ShieldAlert } from "lucide-react";

export default function AnalyticsDashboardPage() {
  const [timeRange, setTimeRange] = useState("7D");

  // Sample data for wrong-seat mismatches over time
  const mismatchTrend = [
    { hour: "14:00", count: 1 },
    { hour: "15:00", count: 3 },
    { hour: "16:00", count: 0 },
    { hour: "17:00", count: 2 },
    { hour: "18:00", count: 5 },
    { hour: "19:00", count: 4 },
    { hour: "20:00", count: 1 },
  ];

  // Repeat problem seats
  const repeatProblemSeats = [
    { seat: "A13", incidents: 6, reason: "Aisle seat confusion (adjacent to A12)" },
    { seat: "B4", incidents: 4, reason: "Aisle gap boundary" },
    { seat: "C8", incidents: 3, reason: "VIP row boundary" },
    { seat: "D1", incidents: 2, reason: "Front row seat misdirection" },
  ];

  // Hardware fault frequencies
  const faultFrequency = [
    { type: "Sensor Glitch", count: 2, pct: 40 },
    { type: "Heartbeat Timeout", count: 1, pct: 20 },
    { type: "Low Battery", count: 1, pct: 20 },
    { type: "Tamper Switch", count: 1, pct: 20 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Operational Telemetry & Insights</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">
            System Analytics & Trends
          </h1>
          <p className="text-xs text-slate-400">
            Wrong-seat events over time, staff response times, repeat-problem seats, and hardware fault frequencies.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {["24H", "7D", "30D"].map((t) => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timeRange === t ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Grid: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Wrong-Seat Mismatch Occurrences Over Time */}
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <h2 className="font-bold text-white text-base">Wrong-Seat Mismatches Over Time</h2>
            </div>
            <span className="text-xs font-mono text-amber-400 font-bold">16 total events</span>
          </div>

          {/* SVG Bar Chart */}
          <div className="h-56 flex items-end justify-between gap-4 pt-6 px-2">
            {mismatchTrend.map((d, i) => {
              const heightPct = Math.max(12, (d.count / 6) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className="text-[10px] font-mono text-slate-400 group-hover:text-white transition-colors">
                    {d.count}
                  </span>
                  <div className="w-full bg-slate-800/80 rounded-t-xl h-44 flex items-end p-1">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full rounded-lg bg-gradient-to-t from-amber-600 to-amber-400 group-hover:from-amber-500 group-hover:to-amber-300 transition-all shadow-md shadow-amber-500/20"
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{d.hour}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Staff Response Times */}
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h2 className="font-bold text-white text-base">Emergency Response Time Distribution</h2>
            </div>
            <span className="text-xs font-mono text-indigo-400 font-bold">42s median</span>
          </div>

          <div className="space-y-4 pt-2">
            {[
              { bracket: "< 30 seconds (Immediate)", count: 18, pct: 60, color: "bg-emerald-500" },
              { bracket: "30 - 60 seconds (Nominal)", count: 9, pct: 30, color: "bg-indigo-500" },
              { bracket: "60 - 120 seconds (Delayed)", count: 2, pct: 7, color: "bg-amber-500" },
              { bracket: "> 120 seconds (Critical)", count: 1, pct: 3, color: "bg-rose-500" },
            ].map((b, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">{b.bracket}</span>
                  <span className="font-mono font-bold text-white">
                    {b.count} ({b.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${b.pct}%` }}
                    className={`h-full rounded-full ${b.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Second Row: Repeat-Problem Seats & Fault Frequency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Repeat Problem Seats Table */}
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <h2 className="font-bold text-white text-base">Repeat-Problem Seats</h2>
            </div>
            <span className="text-xs text-slate-400">Identifies confusing layout zones</span>
          </div>

          <div className="space-y-3">
            {repeatProblemSeats.map((s, i) => (
              <div
                key={i}
                className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 font-black text-sm flex items-center justify-center">
                    {s.seat}
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs">Seat {s.seat}</div>
                    <div className="text-[11px] text-slate-400">{s.reason}</div>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-rose-400 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                  {s.incidents} incidents
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Fault Frequency Breakdown */}
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-purple-400" />
              <h2 className="font-bold text-white text-base">Seat-Unit Fault Frequency</h2>
            </div>
            <span className="text-xs text-slate-400">Hardware reliability breakdown</span>
          </div>

          <div className="space-y-3 pt-2">
            {faultFrequency.map((f, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">{f.type}</span>
                  <span className="font-mono font-bold text-purple-400">
                    {f.count} ({f.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${f.pct}%` }}
                    className="h-full rounded-full bg-purple-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
