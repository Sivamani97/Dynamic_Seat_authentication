"use client";

import { useEffect, useState, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  QrCode,
  CheckCircle2,
  XCircle,
  Camera,
  RefreshCw,
  Copy,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { soundManager } from "@/lib/audio";

interface ScanResult {
  success: boolean;
  status?: string;
  bookingRef?: string;
  seatLabel?: string;
  eventTitle?: string;
  message?: string;
  reasonCode?: string;
}

export default function GateScannerPage() {
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [manualToken, setManualToken] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const qrRegionId = "html5qr-code-full-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Initialize or stop camera scanner
  const startCamera = async () => {
    try {
      setCameraError(null);
      setScanResult(null);

      const html5QrCode = new Html5Qrcode(qrRegionId);
      scannerRef.current = html5QrCode;

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        async (decodedText) => {
          // Token detected
          await handleProcessToken(decodedText);
        },
        () => {
          // Frame error (ignore)
        }
      );

      setScanning(true);
    } catch (err: any) {
      setCameraError(
        err.message || "Camera access denied or unavailable. You can use the manual token paste fallback below."
      );
      setScanning(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && scanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current && scanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [scanning]);

  // Submit token to /api/scan/entry
  const handleProcessToken = async (tokenString: string) => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/scan/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenString.trim(),
          eventId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        }),
      });

      const resJson: ScanResult = await res.json();
      setScanResult(resJson);

      if (res.ok && resJson.success) {
        soundManager.playSuccessTone();
        soundManager.triggerVibration([150, 80, 150]);
      } else {
        soundManager.playErrorTone();
        soundManager.triggerVibration([400]);
      }
    } catch (err: any) {
      setScanResult({
        success: false,
        reasonCode: "NETWORK_ERROR",
        message: err.message || "Failed to reach gate scan server.",
      });
      soundManager.playErrorTone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div className="glass-panel rounded-3xl border border-slate-800 p-6 space-y-2 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <QrCode className="w-3.5 h-3.5" />
          <span>Entrance Gate Pass Scanner</span>
        </div>
        <h1 className="text-2xl font-black text-white">Entry Gate Verification</h1>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Scans dynamic 30s tokens. Replays, cancelled bookings, wrong events, and double check-ins are rejected.
        </p>
      </div>

      {/* Result Display Box */}
      {scanResult && (
        <div
          className={`p-6 rounded-3xl border-2 text-center space-y-3 animate-in fade-in zoom-in-95 duration-200 shadow-2xl ${
            scanResult.success
              ? "bg-emerald-950/40 border-emerald-500 text-emerald-200 shadow-emerald-500/20"
              : "bg-rose-950/40 border-rose-500 text-rose-200 shadow-rose-500/20"
          }`}
        >
          <div className="flex items-center justify-center">
            {scanResult.success ? (
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-rose-400" />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-black tracking-tight text-white uppercase">
              {scanResult.success ? "ENTRY AUTHORIZED" : "ENTRY DENIED"}
            </h2>
            <p className="text-sm font-semibold mt-1">
              {scanResult.message || (scanResult.success ? "Passenger cleared for entry." : "Verification failed.")}
            </p>
          </div>

          {scanResult.success ? (
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-900/40 border border-emerald-500/30">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                  Assigned Seat
                </span>
                <span className="text-lg font-black text-white">{scanResult.seatLabel}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-900/40 border border-emerald-500/30">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                  Booking Ref
                </span>
                <span className="text-sm font-mono font-bold text-white">
                  {scanResult.bookingRef}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-rose-900/40 border border-rose-500/30 text-xs">
              <span className="text-[10px] uppercase font-bold text-rose-300 block">
                Reason Code
              </span>
              <span className="font-mono font-bold text-white">
                {scanResult.reasonCode || "REJECTED"}
              </span>
            </div>
          )}

          <button
            onClick={() => setScanResult(null)}
            className="mt-2 text-xs text-slate-300 hover:text-white underline"
          >
            Clear & Scan Next Ticket
          </button>
        </div>
      )}

      {/* Camera Viewfinder */}
      <div className="glass-card rounded-3xl border border-slate-800 p-6 space-y-4">
        <div className="relative w-full min-h-[260px] rounded-2xl bg-black/80 border border-slate-700/80 overflow-hidden flex items-center justify-center text-slate-500 text-xs text-center">
          {/* Empty dedicated region for html5-qrcode DOM operations */}
          <div
            id={qrRegionId}
            className={`w-full ${scanning ? "block" : "hidden"}`}
          />

          {/* Sibling React element - safe from DOM mutation by external library */}
          {!scanning && (
            <div className="p-6 space-y-3 pointer-events-none">
              <Camera className="w-10 h-10 mx-auto text-slate-600" />
              <p>Camera is currently idle. Click below to activate viewfinder.</p>
            </div>
          )}
        </div>

        {cameraError && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{cameraError}</span>
          </div>
        )}

        <div className="flex gap-2">
          {!scanning ? (
            <button
              onClick={startCamera}
              className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30"
            >
              <Camera className="w-4 h-4" />
              <span>Activate Camera Scanner</span>
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
            >
              Stop Camera
            </button>
          )}
        </div>
      </div>

      {/* Manual Token Paste Fallback */}
      <div className="glass-card rounded-3xl border border-slate-800 p-6 space-y-4">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <Copy className="w-4 h-4 text-indigo-400" />
          <span>Manual Token Paste (Testing & Fallback)</span>
        </h3>
        <p className="text-xs text-slate-400">
          Paste the raw dynamic token from any phone or test script:
        </p>

        <textarea
          rows={3}
          value={manualToken}
          onChange={(e) => setManualToken(e.target.value)}
          placeholder="eyJuYnVpZCI6... (base64url payload and signature)"
          className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
        />

        <button
          onClick={() => handleProcessToken(manualToken)}
          disabled={!manualToken.trim() || submitting}
          className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2"
        >
          {submitting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
          <span>Verify Pasted Token</span>
        </button>
      </div>
    </div>
  );
}
