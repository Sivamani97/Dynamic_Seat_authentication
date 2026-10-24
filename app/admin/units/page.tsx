"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tv, Activity, CheckCircle2, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";

interface UnitHealthRow {
  unitId: string;
  seatLabel: string;
  screenName: string;
  sensor: string;
  scanner: string;
  power: string;
  comms: string;
  tamper: boolean;
  lastHeartbeat: string;
}

export default function SeatUnitsHealthPage() {
  const [units, setUnits] = useState<UnitHealthRow[]>([]);

  useEffect(() => {
    // Populate unit health list for Screen 2 seats
    const rows = ["A", "B", "C", "D", "E"];
    const list: UnitHealthRow[] = [];

    rows.forEach((r) => {
      for (let c = 1; c <= 12; c++) {
        const label = `${r}${c}`;
        const unitId = `SCREEN2-${label}`;
        list.push({
          unitId,
          seatLabel: label,
          screenName: "Screen 2",
          sensor: "OK",
          scanner: "OK",
          power: "OK",
          comms: "OK",
          tamper: false,
          lastHeartbeat: "Within 10s",
        });
      }
    });

    setUnits(list);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-3xl border border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Activity className="w-3.5 h-3.5" />
            <span>Hardware Telemetry Fleet</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">
            Seat-Unit Hardware Health Table
          </h1>
          <p className="text-xs text-slate-400">
            Monitors real-time sensor, scanner, power, communications, and tamper status for all 60 virtual seat units.
          </p>
        </div>

        <Link
          href="/seat-unit/SCREEN2-A12"
          target="_blank"
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2"
        >
          <Tv className="w-4 h-4" />
          <span>Launch Unit A12 Emulator</span>
        </Link>
      </div>

      <div className="glass-card rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="py-3.5 px-4">Seat</th>
                <th className="py-3.5 px-4">Unit ID</th>
                <th className="py-3.5 px-4">Occupancy Sensor</th>
                <th className="py-3.5 px-4">Seat Scanner</th>
                <th className="py-3.5 px-4">Power Status</th>
                <th className="py-3.5 px-4">Comms Link</th>
                <th className="py-3.5 px-4">Tamper Switch</th>
                <th className="py-3.5 px-4">Heartbeat</th>
                <th className="py-3.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {units.map((u) => (
                <tr key={u.unitId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-black text-white text-sm">{u.seatLabel}</td>
                  <td className="py-3 px-4 font-mono text-indigo-400">{u.unitId}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {u.sensor}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {u.scanner}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {u.power}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {u.comms}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-bold text-slate-400">NORMAL (UNTRIPPED)</span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                    {u.lastHeartbeat}
                  </td>
                  <td className="py-3 px-4">
                    <Link
                      href={`/seat-unit/${u.unitId}`}
                      target="_blank"
                      className="text-xs text-indigo-400 hover:text-white flex items-center gap-1 font-semibold"
                    >
                      <span>Simulate</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
