"use client";

import { useEffect, useState, useRef } from "react";
import { soundManager } from "@/lib/audio";
import { createClient } from "@/lib/supabase/client";

interface LocalAlert {
  id: string;
  type: string;
  priority: string;
  message: string;
  seat_label?: string;
  created_at: string;
}

export default function LocalAlertPwaPage() {
  const [alerts, setAlerts] = useState<LocalAlert[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>("Connecting...");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 1. Supabase Realtime Channel
    const supabase = createClient();
    const channel = supabase
      .channel("local_pwa_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        (payload: any) => {
          const alert = payload.new as LocalAlert;
          setAlerts((prev) => [alert, ...prev.slice(0, 19)]); // keep last 20
          soundManager.startSiren();
          soundManager.triggerVibration([500, 200, 500]);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
        } else {
          setConnected(false);
        }
      });

    // 2. Resilient Auto-Reconnection Polling Fallback (for poor 2G/offline connectivity)
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/engine/tick", { method: "POST" });
        if (res.ok) {
          setLastHeartbeat(new Date().toLocaleTimeString());
          setConnected(true);
        }
      } catch {
        setConnected(false);
      }
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const acknowledgeAlert = (id: string) => {
    soundManager.stopSiren();
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-4 font-mono text-xs">
      {/* Resilient Minimal Header */}
      <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl flex items-center justify-between">
        <div>
          <span className="font-bold text-white block">SMARTSEAT PWA RECEIVER</span>
          <span className="text-[10px] text-slate-400">Offline & Low-Bandwidth Mode</span>
        </div>
        <div className="text-right">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
            }`}
          />
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {connected ? "LIVE" : "DISCONNECTED"}
          </span>
        </div>
      </div>

      <div className="text-[11px] text-slate-500 flex justify-between px-1">
        <span>Channel: Realtime + 4s Auto-Sync</span>
        <span>Last Ping: {lastHeartbeat}</span>
      </div>

      {/* Alerts Stream */}
      <div className="space-y-2">
        {alerts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
            [STANDBY: NO ACTIVE EMERGENCY ALERTS]
          </div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className={`p-3 rounded-xl border ${
                a.priority === "CRITICAL"
                  ? "bg-rose-950/60 border-rose-500 text-rose-200"
                  : "bg-amber-950/40 border-amber-500 text-amber-200"
              }`}
            >
              <div className="flex justify-between font-bold mb-1">
                <span>{a.priority} ALERT: SEAT {a.seat_label || "A12"}</span>
                <span>{new Date(a.created_at).toLocaleTimeString()}</span>
              </div>
              <p className="text-xs mb-2">{a.message}</p>
              <button
                onClick={() => acknowledgeAlert(a.id)}
                className="w-full py-1.5 bg-white text-black font-bold rounded hover:bg-slate-200 text-center"
              >
                ACKNOWLEDGE & DISMISS
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
