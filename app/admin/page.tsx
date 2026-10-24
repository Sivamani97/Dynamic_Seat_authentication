"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Tv,
  FileCheck,
  BarChart3,
  Settings,
  Users,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Activity,
  Lock,
} from "lucide-react";

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState({
    checkedIn: 28,
    authorizedSeats: 26,
    activeAlerts: 1,
    sosIncidents: 1,
    faultyUnits: 0,
    avgResponseSec: 42,
  });

  const adminLinks = [
    {
      title: "Tamper-Evident Audit Chain",
      description: "Cryptographically linked SHA-256 event logs with one-click mathematical integrity proof.",
      href: "/admin/audit",
      icon: FileCheck,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    },
    {
      title: "Seat-Unit Hardware Health",
      description: "Live sensor, scanner, power, comms, and tamper telemetry for every virtual seat unit.",
      href: "/admin/units",
      icon: Tv,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
    },
    {
      title: "Analytics & Telemetry",
      description: "Wrong-seat occurrences over time, response times, repeat-problem seats, fault frequency.",
      href: "/admin/analytics",
      icon: BarChart3,
      color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
    },
    {
      title: "System Threshold Settings",
      description: "Configure token lifetime (30s), mismatch delay (15s), bag pressure range, and heartbeat timeouts.",
      href: "/admin/settings",
      icon: Settings,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-3xl border border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Executive Governance Command</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">
            System Administration & Audit
          </h1>
          <p className="text-xs text-slate-400">
            Complete governance over venues, virtual seat health, cryptographic verification, and tamper logs.
          </p>
        </div>

        <Link
          href="/admin/audit"
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20"
        >
          <Lock className="w-4 h-4" />
          <span>Verify Cryptographic Audit Chain</span>
        </Link>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">Checked-In</span>
          <div className="text-2xl font-black text-white">{kpis.checkedIn}</div>
          <span className="text-[10px] text-slate-500">At entry gates</span>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">Authorized Seats</span>
          <div className="text-2xl font-black text-emerald-400">{kpis.authorizedSeats}</div>
          <span className="text-[10px] text-emerald-500/80">Occupancy confirmed</span>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">Active Alerts</span>
          <div className="text-2xl font-black text-amber-400">{kpis.activeAlerts}</div>
          <span className="text-[10px] text-amber-500/80">Silent & SOS</span>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">SOS Incidents</span>
          <div className="text-2xl font-black text-rose-400">{kpis.sosIncidents}</div>
          <span className="text-[10px] text-rose-500/80">Immediate priority</span>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">Faulty Units</span>
          <div className="text-2xl font-black text-purple-400">{kpis.faultyUnits}</div>
          <span className="text-[10px] text-slate-500">100% nominal</span>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400">Avg Response</span>
          <div className="text-2xl font-black text-indigo-400">{kpis.avgResponseSec}s</div>
          <span className="text-[10px] text-slate-500">Staff acknowledge</span>
        </div>
      </div>

      {/* Admin Modules Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {adminLinks.map((mod, idx) => {
          const Icon = mod.icon;
          return (
            <Link
              key={idx}
              href={mod.href}
              className="glass-card p-6 rounded-3xl border border-slate-800 hover:border-slate-700 transition-all flex items-start gap-4 group"
            >
              <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${mod.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-base group-hover:text-indigo-300 transition-colors">
                    {mod.title}
                  </h3>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {mod.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
