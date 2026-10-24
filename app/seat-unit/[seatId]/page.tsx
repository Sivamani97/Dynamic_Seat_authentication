"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Tv,
  Camera,
  CheckCircle2,
  AlertTriangle,
  LifeBuoy,
  Wrench,
  Radio,
  Zap,
  Activity,
  Layers,
  ArrowRight,
  RefreshCw,
  Sliders,
} from "lucide-react";
import { soundManager } from "@/lib/audio";

interface UnitStatus {
  sensor: "OK" | "OFFLINE" | "ERROR";
  scanner: "OK" | "OFFLINE" | "ERROR";
  power: "OK" | "LOW_BATTERY" | "OUTAGE";
  comms: "OK" | "DISCONNECTED" | "DEGRADED";
  tamper: boolean;
}

export default function VirtualSeatUnitPage({
  params,
}: {
  params: { seatId: string };
}) {
  const currentSeatId = params.seatId; // e.g. "SCREEN2-A12" or "A12"
  const unitId = currentSeatId.startsWith("SCREEN2-")
    ? currentSeatId
    : `SCREEN2-${currentSeatId.toUpperCase()}`;
  const seatLabel = unitId.replace("SCREEN2-", "");
  const unitSecret = `smartseat_secret_${unitId}`;

  // Interactive Pressure Sensor
  const [pressure, setPressure] = useState<number>(0);

  // Seat Display Panel Message
  const [displayMessage, setDisplayMessage] = useState<string>(
    `Seat ${seatLabel} • Standby`
  );
  const [seatState, setSeatState] = useState<string>("NORMAL");

  // Scanner state
  const [scanning, setScanning] = useState<boolean>(false);
  const [pasteToken, setPasteToken] = useState<string>("");
  const [scanResult, setScanResult] = useState<any>(null);

  // Fault Injection Toggles
  const [faultStatus, setFaultStatus] = useState<UnitStatus>({
    sensor: "OK",
    scanner: "OK",
    power: "OK",
    comms: "OK",
    tamper: false,
  });

  // Assist pulse
  const [assistRegistered, setAssistRegistered] = useState<boolean>(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>("Just started");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);

  // 1. Send Simulated Occupancy Pressure to /api/seat-units/[id]/occupancy
  const updateOccupancy = useCallback(
    async (newPressure: number) => {
      setPressure(newPressure);
      try {
        const res = await fetch(`/api/seat-units/${unitId}/occupancy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitId,
            unitSecret,
            pressure: newPressure,
            eventId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          }),
        });

        const json = await res.json();
        if (res.ok && json.displayMessage) {
          setDisplayMessage(`Seat ${seatLabel} • ${json.displayMessage}`);
          setSeatState(json.state);
        }
      } catch (err) {
        console.error("Occupancy update failed:", err);
      }
    },
    [unitId, unitSecret, seatLabel]
  );

  // 2. Heartbeat sent every 10s while page is open
  const sendHeartbeat = useCallback(async () => {
    try {
      const res = await fetch(`/api/seat-units/${unitId}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          unitSecret,
          status: faultStatus,
        }),
      });
      if (res.ok) {
        setLastHeartbeat(new Date().toLocaleTimeString());
      }
    } catch {}
  }, [unitId, unitSecret, faultStatus]);

  useEffect(() => {
    sendHeartbeat();
    heartbeatTimer.current = setInterval(sendHeartbeat, 10000);
    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    };
  }, [sendHeartbeat]);

  // 3. Quick Occupancy Presets: Sit, Stand, Place Bag
  const handleSit = () => updateOccupancy(75);
  const handleStand = () => updateOccupancy(0);
  const handleBag = () => updateOccupancy(35);

  // 4. Scanner Logic: Verify QR Token at this seat
  const handleScanTicket = async (tokenString: string) => {
    try {
      const res = await fetch("/api/scan/seat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenString.trim(),
          unitId,
          unitSecret,
        }),
      });

      const json = await res.json();
      setScanResult(json);

      if (res.ok && json.success) {
        soundManager.playSuccessTone();
        soundManager.triggerVibration([150, 80, 150]);
        setDisplayMessage(`Seat ${seatLabel} ✓ Seat Verified`);
        setSeatState("AUTHORIZED");
      } else {
        soundManager.playErrorTone();
        soundManager.triggerVibration([400]);
        setDisplayMessage(`Seat ${seatLabel} ⚠ Please Verify Your Seat`);
      }
    } catch (err: any) {
      setScanResult({ success: false, message: err.message });
      soundManager.playErrorTone();
    }
  };

  // 5. On-Screen Assist Button
  const handleUnitAssist = async () => {
    soundManager.triggerVibration([200, 100, 200]);
    setAssistRegistered(true);
    setTimeout(() => setAssistRegistered(false), 3000);

    try {
      await fetch(`/api/seat-units/${unitId}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId,
          category: "EMERGENCY",
        }),
      });
    } catch {}
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Unit Header */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Tv className="w-3.5 h-3.5" />
            <span>Virtual Seat Hardware Emulator</span>
          </div>
          <h1 className="text-2xl font-black text-white">
            Unit Telemetry: {unitId}
          </h1>
          <p className="text-xs text-slate-400">
            Authenticates with unit key. Heartbeat active: {lastHeartbeat} (every 10s).
          </p>
        </div>

        {/* Seat Switcher Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold">Switch Seat:</span>
          <select
            value={unitId}
            onChange={(e) => (window.location.href = `/seat-unit/${e.target.value}`)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white"
          >
            <option value="SCREEN2-A12">SCREEN2-A12 (User 1 Assigned)</option>
            <option value="SCREEN2-A13">SCREEN2-A13 (Wrong Seat Test)</option>
            <option value="SCREEN2-A14">SCREEN2-A14 (Bag Filter Test)</option>
            <option value="SCREEN2-B4">SCREEN2-B4 (User 2 Assigned)</option>
          </select>
        </div>
      </div>

      {/* Mini Seat Display Panel (Low Brightness OLED aesthetic) */}
      <div className="glass-card rounded-3xl border-2 border-slate-800 p-6 bg-black/90 shadow-2xl space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-900 pb-2">
          <span className="uppercase tracking-widest text-[10px] font-bold">
            Seat Unit Headrest OLED Display
          </span>
          <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            ACTIVE TELEMETRY
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-[#030712] border border-slate-800/80 text-center space-y-2">
          <div
            className={`text-xl sm:text-2xl font-black tracking-wide ${
              seatState === "AUTHORIZED"
                ? "text-emerald-400"
                : seatState === "WRONG_SEAT"
                ? "text-amber-400 animate-pulse"
                : seatState === "FAULT"
                ? "text-purple-400"
                : "text-slate-300"
            }`}
          >
            {displayMessage}
          </div>
          <p className="text-[11px] text-slate-500">
            Current Pressure: <strong>{pressure} kg</strong> • State:{" "}
            <strong>{seatState}</strong>
          </p>
        </div>
      </div>

      {/* Sensor Simulation & Scanner Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pressure Sensor Controls */}
        <div className="glass-card rounded-3xl border border-slate-800 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Simulated Occupancy Sensor</span>
            </h3>
            <span className="text-xs font-mono font-bold text-indigo-400">
              {pressure} kg
            </span>
          </div>

          <div className="space-y-2">
            <input
              type="range"
              min="0"
              max="100"
              value={pressure}
              onChange={(e) => updateOccupancy(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase">
              <span>0 (Empty)</span>
              <span>20-59 (Uncertain/Bag)</span>
              <span>60-100 (Occupied)</span>
            </div>
          </div>

          {/* Quick Action Presets */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <button
              onClick={handleStand}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                pressure < 20
                  ? "bg-slate-800 border-slate-600 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Stand (0 kg)
            </button>
            <button
              onClick={handleBag}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                pressure >= 20 && pressure < 60
                  ? "bg-amber-600/30 border-amber-500 text-amber-200"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Place Bag (35 kg)
            </button>
            <button
              onClick={handleSit}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                pressure >= 60
                  ? "bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Sit Down (75 kg)
            </button>
          </div>

          {/* Big On-Screen Assist Button */}
          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={handleUnitAssist}
              className={`w-full py-3.5 px-4 rounded-2xl font-bold text-sm text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                assistRegistered
                  ? "bg-emerald-600 shadow-emerald-500/40 scale-95"
                  : "bg-gradient-to-r from-rose-600 to-amber-600 hover:opacity-95 shadow-rose-600/30"
              }`}
            >
              <LifeBuoy className="w-5 h-5" />
              <span>
                {assistRegistered ? "Request Registered ✓" : "Physical Seat SOS Button"}
              </span>
            </button>
          </div>
        </div>

        {/* Seat QR Scanner */}
        <div className="glass-card rounded-3xl border border-slate-800 p-6 space-y-4">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Camera className="w-4 h-4 text-purple-400" />
            <span>Passenger Seat Scanner</span>
          </h3>

          <p className="text-xs text-slate-400">
            Scans passenger&apos;s dynamic QR ticket. Seat A12 credential scanned at A13 will fail with WRONG_SEAT_SCAN.
          </p>

          {scanResult && (
            <div
              className={`p-3 rounded-xl text-xs border ${
                scanResult.success
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                  : "bg-rose-950/40 border-rose-500/40 text-rose-200"
              }`}
            >
              <div className="font-bold">
                {scanResult.success ? "SEAT AUTHORIZED" : scanResult.reasonCode || "DENIED"}
              </div>
              <div>{scanResult.message}</div>
            </div>
          )}

          <textarea
            rows={2}
            value={pasteToken}
            onChange={(e) => setPasteToken(e.target.value)}
            placeholder="Paste passenger dynamic token string here..."
            className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 font-mono text-[11px] text-slate-200 placeholder-slate-600"
          />

          <button
            onClick={() => handleScanTicket(pasteToken)}
            disabled={!pasteToken.trim()}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Scan Token at this Seat</span>
          </button>
        </div>
      </div>

      {/* Hardware Fault Injection Controls */}
      <div className="glass-card rounded-3xl border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-white text-sm">
              Hardware Fault Injection Simulator
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Injected faults are detected on the next 10s heartbeat
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          {/* Sensor Failure Toggle */}
          <button
            onClick={() => {
              const next = faultStatus.sensor === "OK" ? "OFFLINE" : "OK";
              setFaultStatus((prev) => ({ ...prev, sensor: next }));
              setTimeout(sendHeartbeat, 100);
            }}
            className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
              faultStatus.sensor !== "OK"
                ? "bg-purple-950/50 border-purple-500 text-purple-200"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            <span className="text-[10px] font-bold uppercase block">Sensor</span>
            <span className="font-black text-sm block">
              {faultStatus.sensor === "OK" ? "Sensor OK" : "SENSOR FAULT"}
            </span>
          </button>

          {/* Scanner Failure Toggle */}
          <button
            onClick={() => {
              const next = faultStatus.scanner === "OK" ? "OFFLINE" : "OK";
              setFaultStatus((prev) => ({ ...prev, scanner: next }));
              setTimeout(sendHeartbeat, 100);
            }}
            className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
              faultStatus.scanner !== "OK"
                ? "bg-purple-950/50 border-purple-500 text-purple-200"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            <span className="text-[10px] font-bold uppercase block">Scanner</span>
            <span className="font-black text-sm block">
              {faultStatus.scanner === "OK" ? "Scanner OK" : "SCANNER FAULT"}
            </span>
          </button>

          {/* Power Failure Toggle */}
          <button
            onClick={() => {
              const next = faultStatus.power === "OK" ? "OUTAGE" : "OK";
              setFaultStatus((prev) => ({ ...prev, power: next }));
              setTimeout(sendHeartbeat, 100);
            }}
            className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
              faultStatus.power !== "OK"
                ? "bg-purple-950/50 border-purple-500 text-purple-200"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            <span className="text-[10px] font-bold uppercase block">Power</span>
            <span className="font-black text-sm block">
              {faultStatus.power === "OK" ? "Power Grid OK" : "POWER OUTAGE"}
            </span>
          </button>

          {/* Comms Link Toggle */}
          <button
            onClick={() => {
              const next = faultStatus.comms === "OK" ? "DISCONNECTED" : "OK";
              setFaultStatus((prev) => ({ ...prev, comms: next }));
              setTimeout(sendHeartbeat, 100);
            }}
            className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
              faultStatus.comms !== "OK"
                ? "bg-purple-950/50 border-purple-500 text-purple-200"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            <span className="text-[10px] font-bold uppercase block">Comms</span>
            <span className="font-black text-sm block">
              {faultStatus.comms === "OK" ? "Comms Live" : "COMMS LOST"}
            </span>
          </button>

          {/* Tamper Switch */}
          <button
            onClick={() => {
              const next = !faultStatus.tamper;
              setFaultStatus((prev) => ({ ...prev, tamper: next }));
              setTimeout(sendHeartbeat, 100);
            }}
            className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
              faultStatus.tamper
                ? "bg-rose-950/60 border-rose-500 text-rose-200"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            <span className="text-[10px] font-bold uppercase block">Tamper Switch</span>
            <span className="font-black text-sm block">
              {faultStatus.tamper ? "TAMPER TRIPPED" : "Tamper Normal"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
