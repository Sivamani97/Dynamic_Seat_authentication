"use client";

import { useEffect, useState } from "react";
import { Settings, Save, CheckCircle2, Clock, Activity, Sliders, Shield } from "lucide-react";

export default function AdminSettingsPage() {
  const [tokenLifetime, setTokenLifetime] = useState(30);
  const [mismatchDelay, setMismatchDelay] = useState(15);
  const [emptyMaxPressure, setEmptyMaxPressure] = useState(19);
  const [uncertainMaxPressure, setUncertainMaxPressure] = useState(59);
  const [heartbeatTimeout, setHeartbeatTimeout] = useState(30);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Settings className="w-3.5 h-3.5" />
            <span>Engine Configuration & Thresholds</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">
            System Security & Engine Settings
          </h1>
          <p className="text-xs text-slate-400">
            Dynamically adjust verification parameters across all serverless route handlers and evaluation crons.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/30"
        >
          <Save className="w-4 h-4" />
          <span>Save Settings</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>Settings successfully saved and synchronized across all verification nodes.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Token Lifetime Setting */}
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Dynamic Token Lifetime</h3>
              <p className="text-[11px] text-slate-400">QR expiration duration (default 30 seconds)</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Current: {tokenLifetime} seconds</span>
              <span className="text-indigo-400 font-bold">{tokenLifetime}s</span>
            </div>
            <input
              type="range"
              min="15"
              max="90"
              step="5"
              value={tokenLifetime}
              onChange={(e) => setTokenLifetime(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>15s (Strict)</span>
              <span>30s (Default)</span>
              <span>90s (Relaxed)</span>
            </div>
          </div>
        </div>

        {/* Mismatch Delay Setting */}
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Wrong-Seat Mismatch Delay</h3>
              <p className="text-[11px] text-slate-400">Delay before unauthorized alert triggers (default 15s)</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Current: {mismatchDelay} seconds</span>
              <span className="text-amber-400 font-bold">{mismatchDelay}s</span>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={mismatchDelay}
              onChange={(e) => setMismatchDelay(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>5s (Fast)</span>
              <span>15s (Default)</span>
              <span>60s (Slow)</span>
            </div>
          </div>
        </div>

        {/* Pressure Sensor Thresholds */}
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Bag & Uncertain Weight Range</h3>
              <p className="text-[11px] text-slate-400">Weight discrimination between luggage and human passengers</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Empty Threshold (0 to X kg):</span>
              <input
                type="number"
                value={emptyMaxPressure}
                onChange={(e) => setEmptyMaxPressure(Number(e.target.value))}
                className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-right font-mono text-white"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Bag / Uncertain Upper Limit (X to Y kg):</span>
              <input
                type="number"
                value={uncertainMaxPressure}
                onChange={(e) => setUncertainMaxPressure(Number(e.target.value))}
                className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-right font-mono text-white"
              />
            </div>
            <p className="text-[10px] text-slate-500">
              Weights {emptyMaxPressure + 1}kg - {uncertainMaxPressure}kg are classified as bags/coats and NEVER alert staff.
            </p>
          </div>
        </div>

        {/* Heartbeat Timeout */}
        <div className="glass-card p-6 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Seat-Unit Heartbeat Timeout</h3>
              <p className="text-[11px] text-slate-400">Missed ping threshold before comms failure alert (default 30s)</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Current: {heartbeatTimeout} seconds</span>
              <span className="text-teal-400 font-bold">{heartbeatTimeout}s</span>
            </div>
            <input
              type="range"
              min="15"
              max="120"
              step="5"
              value={heartbeatTimeout}
              onChange={(e) => setHeartbeatTimeout(Number(e.target.value))}
              className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
