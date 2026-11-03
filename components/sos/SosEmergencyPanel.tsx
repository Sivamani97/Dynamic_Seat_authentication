"use client";

import { useEffect, useState, useRef } from "react";
import {
  ShieldAlert,
  AlertOctagon,
  HeartPulse,
  Flame,
  UserX,
  LifeBuoy,
  CheckCircle2,
  Volume2,
  VolumeX,
  PhoneCall,
  Clock,
  Radio,
  X,
  Send,
  Loader2,
  MapPin,
} from "lucide-react";
import { soundManager } from "@/lib/audio";
import { createClient } from "@/lib/supabase/client";

interface SosEmergencyPanelProps {
  defaultSeatUnit?: string;
  defaultSeatLabel?: string;
  showHeader?: boolean;
  className?: string;
}

export function SosEmergencyPanel({
  defaultSeatUnit = "SCREEN2-A12",
  defaultSeatLabel = "A12",
  showHeader = true,
  className = "",
}: SosEmergencyPanelProps) {
  const [selectedUnit, setSelectedUnit] = useState<string>(defaultSeatUnit);
  const [seatLabel, setSeatLabel] = useState<string>(defaultSeatLabel);
  const [category, setCategory] = useState<
    "MEDICAL" | "EMERGENCY" | "DISTURBANCE" | "SEAT_ISSUE" | "WATER_BASIC"
  >("MEDICAL");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeAlert, setActiveAlert] = useState<{
    id?: string;
    status: "DISPATCHED" | "ACKNOWLEDGED" | "RESOLVED";
    category: string;
    seatLabel: string;
    time: string;
  } | null>(null);
  const [soundActive, setSoundActive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to Realtime Alert Updates via Supabase
  useEffect(() => {
    if (!activeAlert?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`sos_alert_listener_${activeAlert.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "alerts",
          filter: `id=eq.${activeAlert.id}`,
        },
        (payload: any) => {
          if (payload.new.status === "ACKNOWLEDGED") {
            setActiveAlert((prev) =>
              prev ? { ...prev, status: "ACKNOWLEDGED" } : null
            );
            soundManager.stopSiren();
            setSoundActive(false);
            soundManager.triggerVibration([200, 100, 200]);
          } else if (payload.new.status === "RESOLVED") {
            setActiveAlert(null);
            soundManager.stopSiren();
            setSoundActive(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeAlert?.id]);

  // Handle SOS Emergency Trigger
  const handleTriggerSos = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/seat-units/${selectedUnit}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          note: note.trim() || `SOS Emergency Triggered for Seat ${seatLabel}`,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setActiveAlert({
          id: json.alertId,
          status: "DISPATCHED",
          category,
          seatLabel,
          time: new Date().toLocaleTimeString(),
        });

        // Trigger local audible siren & haptic buzz
        soundManager.startSiren();
        setSoundActive(true);
        soundManager.triggerVibration([500, 200, 500, 200, 800]);
      } else {
        setError(json.message || "Failed to trigger SOS alert");
        soundManager.playErrorTone();
      }
    } catch {
      setError("Network failure sending SOS signal. Retry immediately.");
      soundManager.playErrorTone();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSilenceAlarm = () => {
    soundManager.stopSiren();
    setSoundActive(false);
  };

  const handleCancelSos = () => {
    soundManager.stopSiren();
    setSoundActive(false);
    setActiveAlert(null);
    setNote("");
  };

  const categories = [
    {
      id: "MEDICAL",
      label: "Medical Emergency",
      desc: "Severe pain, unconsciousness, heart attack",
      icon: HeartPulse,
      color: "border-rose-500/60 bg-rose-500/10 text-rose-300",
      activeColor: "ring-2 ring-rose-500 bg-rose-500/25 text-rose-200",
    },
    {
      id: "EMERGENCY",
      label: "Life Safety & Hazard",
      desc: "Fire, smoke, structural danger, immediate evacuation",
      icon: Flame,
      color: "border-orange-500/60 bg-orange-500/10 text-orange-300",
      activeColor: "ring-2 ring-orange-500 bg-orange-500/25 text-orange-200",
    },
    {
      id: "DISTURBANCE",
      label: "Security & Threat",
      desc: "Physical confrontation, harassment, unruly passenger",
      icon: AlertOctagon,
      color: "border-amber-500/60 bg-amber-500/10 text-amber-300",
      activeColor: "ring-2 ring-amber-500 bg-amber-500/25 text-amber-200",
    },
    {
      id: "WATER_BASIC",
      label: "Urgent Staff Assistance",
      desc: "Mobility aid, elderly support, urgent assistance",
      icon: LifeBuoy,
      color: "border-blue-500/60 bg-blue-500/10 text-blue-300",
      activeColor: "ring-2 ring-blue-500 bg-blue-500/25 text-blue-200",
    },
  ];

  return (
    <div className={`w-full max-w-md mx-auto space-y-4 ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Radio className="w-3.5 h-3.5 animate-pulse text-rose-400" />
            <span>High-Priority Emergency Response</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Emergency SOS Portal</h2>
          <p className="text-xs text-slate-400">
            Instantly alerts auditorium staff, command center, and on-duty responders
          </p>
        </div>
      )}

      {/* Active Incident Broadcast Banner */}
      {activeAlert && (
        <div className="p-4 rounded-3xl bg-rose-600/20 border-2 border-rose-500/80 shadow-2xl space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
              <span className="font-extrabold text-white text-sm">
                {activeAlert.status === "ACKNOWLEDGED"
                  ? "HELP EN ROUTE • STAFF ACKNOWLEDGED"
                  : "EMERGENCY SOS TRANSMITTED"}
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800">
              {activeAlert.time}
            </span>
          </div>

          <div className="bg-slate-950/80 p-3 rounded-2xl border border-rose-900/60 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Location:</span>
              <span className="font-bold text-white font-mono">Seat {activeAlert.seatLabel}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Nature:</span>
              <span className="font-bold text-rose-300 uppercase">{activeAlert.category}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Status:</span>
              <span className="font-bold text-emerald-400">
                {activeAlert.status === "ACKNOWLEDGED"
                  ? "Staff Acknowledged - Help Approaching"
                  : "Dispatched to Staff Command Map"}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            {soundActive && (
              <button
                onClick={handleSilenceAlarm}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <VolumeX className="w-4 h-4 text-amber-400" />
                <span>Mute Local Siren</span>
              </button>
            )}

            <button
              onClick={handleCancelSos}
              className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg"
            >
              <X className="w-4 h-4" />
              <span>Cancel / Resolve SOS</span>
            </button>
          </div>
        </div>
      )}

      {/* Main SOS Trigger Card */}
      <div className="glass-card rounded-3xl border border-slate-700/80 overflow-hidden shadow-2xl p-5 space-y-5 bg-gradient-to-b from-slate-900/90 to-slate-950/95">
        {/* Seat / Unit Location Selector */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-indigo-400" />
              Emergency Location
            </span>
            <span className="text-[10px] font-mono text-indigo-300">Auditorium Screen 2</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Seat Unit</label>
              <select
                value={selectedUnit}
                onChange={(e) => {
                  setSelectedUnit(e.target.value);
                  const lbl = e.target.value.replace("SCREEN2-", "");
                  setSeatLabel(lbl);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
              >
                <option value="SCREEN2-A12">SCREEN2-A12 (Seat A12)</option>
                <option value="SCREEN2-A13">SCREEN2-A13 (Seat A13)</option>
                <option value="SCREEN2-B1">SCREEN2-B1 (Seat B1)</option>
                <option value="SCREEN2-C5">SCREEN2-C5 (Seat C5)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Seat Label</label>
              <input
                type="text"
                value={seatLabel}
                onChange={(e) => setSeatLabel(e.target.value)}
                placeholder="e.g. A12"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        {/* Emergency Type Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Select Emergency Category:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {categories.map((c) => {
              const Icon = c.icon;
              const isSelected = category === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id as any)}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    isSelected ? c.activeColor : `${c.color} hover:bg-slate-800/60`
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="font-bold text-xs">{c.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{c.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Note / Symptoms Input */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Incident Details / Symptoms (Optional):
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Severe chest pain / needs wheelchair assistance..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
          />
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Giant Emergency Trigger Button */}
        <div className="pt-2">
          <button
            onClick={handleTriggerSos}
            disabled={submitting}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-600 text-white font-black text-base shadow-2xl shadow-rose-600/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Broadcasting SOS Signal...</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-6 h-6 animate-pulse" />
                <span>DISPATCH EMERGENCY SOS</span>
              </>
            )}
          </button>
          <span className="block text-center text-[10px] text-slate-500 mt-2">
            Logs immediately to tamper-evident audit ledger and blinks seat on staff map.
          </span>
        </div>

        {/* Direct Security Hotline Info */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <PhoneCall className="w-3.5 h-3.5 text-rose-400" />
            Duty Security Officer:
          </span>
          <span className="font-mono font-bold text-slate-200">+1 (800) 555-SEAT</span>
        </div>
      </div>
    </div>
  );
}

