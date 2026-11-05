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
  User,
  Film,
  MapPin,
  Clock,
  Sparkles,
} from "lucide-react";
import { soundManager } from "@/lib/audio";

interface ScanResult {
  success: boolean;
  status?: string;
  bookingRef?: string;
  passengerName?: string;
  seatLabel?: string;
  row?: string;
  col?: number;
  screenName?: string;
  venueName?: string;
  eventTitle?: string;
  eventStartTime?: string;
  checkedInAt?: string;
  message?: string;
  reasonCode?: string;
  displayMessage?: string;
}

export default function GateScannerPage() {
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [manualToken, setManualToken] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [lastDetectedAt, setLastDetectedAt] = useState<string | null>(null);
  const [countdownSec, setCountdownSec] = useState<number>(0);

  const qrRegionId = "html5qr-code-full-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedTokenRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const autoResetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to extract clean token from URL or raw text
  const extractTokenFromQr = (raw: string): string => {
    const trimmed = raw.trim();
    try {
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        const url = new URL(trimmed);
        const tokenParam = url.searchParams.get("token");
        if (tokenParam) return tokenParam.trim();
        const match = url.pathname.match(/\/t\/([^/?#]+)/);
        if (match && match[1]) return match[1].trim();
      }
    } catch {}
    return trimmed;
  };

  // Initialize or stop camera scanner
  const startCamera = async () => {
    try {
      setCameraError(null);
      setScanResult(null);
      isProcessingRef.current = false;
      lastScannedTokenRef.current = "";

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {}
      }

      const html5QrCode = new Html5Qrcode(qrRegionId);
      scannerRef.current = html5QrCode;

      const config = {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          return {
            width: Math.floor(minEdge * 0.78),
            height: Math.floor(minEdge * 0.78),
          };
        },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        async (decodedText) => {
          // Instant UPI-style auto-fetch as soon as QR enters viewfinder
          await handleProcessToken(decodedText);
        },
        () => {}
      );

      setScanning(true);
    } catch (err: any) {
      setCameraError(
        err.message ||
          "Camera access denied or unavailable. Ensure camera permission is granted or use manual token verification below."
      );
      setScanning(false);
    }
  };

  const stopCamera = async () => {
    if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
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
      if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (scannerRef.current && scanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [scanning]);

  // Submit token to /api/scan/entry
  const handleProcessToken = async (rawTokenString: string) => {
    const token = extractTokenFromQr(rawTokenString);
    if (!token) return;

    // Strict synchronous lock to prevent duplicate camera frames
    if (isProcessingRef.current) return;

    const now = Date.now();
    // Debounce exact same token for 4 seconds to prevent accidental duplicate burn
    if (token === lastScannedTokenRef.current && now - lastScannedTimeRef.current < 4000) {
      return;
    }

    isProcessingRef.current = true;
    lastScannedTokenRef.current = token;
    lastScannedTimeRef.current = now;
    setSubmitting(true);
    setLastDetectedAt(new Date().toLocaleTimeString());

    // Instant tactile and sound response the split-second QR is captured
    soundManager.playSuccessTone();
    soundManager.triggerVibration([100]);

    try {
      const res = await fetch("/api/scan/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const resJson: ScanResult = await res.json();
      setScanResult(resJson);

      if (res.ok && resJson.success) {
        // Double-beep confirmation for verified check-in
        setTimeout(() => soundManager.playSuccessTone(), 180);
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

      // UPI-Style Auto-Advance Countdown (3 seconds)
      setCountdownSec(3);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        setCountdownSec((prev) => Math.max(0, prev - 1));
      }, 1000);

      if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
      autoResetTimerRef.current = setTimeout(() => {
        isProcessingRef.current = false;
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      }, 3500);
    }
  };

  const handleResetScanner = () => {
    if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setScanResult(null);
    setCountdownSec(0);
    isProcessingRef.current = false;
    lastScannedTokenRef.current = "";
    lastScannedTimeRef.current = 0;
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      {/* Header Banner */}
      <div className="glass-panel rounded-3xl border border-slate-800 p-6 space-y-2 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>UPI-Style Instant Gate Scanner</span>
        </div>
        <h1 className="text-2xl font-black text-white">Entry Gate Verification</h1>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Point camera at passenger ticket. Instantly decodes, validates credentials, retrieves passenger info, and synchronizes database status in real-time.
        </p>
      </div>

      {/* Submitting Loading Overlay */}
      {submitting && (
        <div className="p-4 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 text-center animate-pulse flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
          <span className="text-xs font-bold text-indigo-200">
            Fetching ticket &amp; verifying credentials dynamically with database...
          </span>
        </div>
      )}

      {/* UPI-Style Result Display Box */}
      {scanResult && !submitting && (
        <div
          className={`p-6 rounded-3xl border-2 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200 shadow-2xl ${
            scanResult.success
              ? "bg-emerald-950/50 border-emerald-500 text-emerald-200 shadow-emerald-500/30"
              : "bg-rose-950/50 border-rose-500 text-rose-200 shadow-rose-500/30"
          }`}
        >
          {/* Animated Status Icon */}
          <div className="flex items-center justify-center">
            {scanResult.success ? (
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center shadow-lg shadow-rose-500/30">
                <XCircle className="w-12 h-12 text-rose-400" />
              </div>
            )}
          </div>

          <div>
            <div className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-black/40 border border-white/10 mb-1">
              {scanResult.success ? "✓ LIVE DATABASE VERIFIED" : "VERIFICATION REJECTED"}
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white uppercase">
              {scanResult.success ? "ENTRY AUTHORIZED" : "ENTRY DENIED"}
            </h2>
            <p className="text-xs font-medium text-slate-300 mt-1">
              {scanResult.displayMessage || scanResult.message || (scanResult.success ? "Passenger cleared for entry." : "Verification failed.")}
            </p>
          </div>

          {/* UPI-Style Retrieved Details Breakdown */}
          {scanResult.success ? (
            <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Passenger</span>
                </span>
                <span className="font-bold text-white text-sm">
                  {scanResult.passengerName || "Verified Passenger"}
                </span>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Assigned Seat</span>
                </span>
                <span className="font-black text-emerald-400 text-base">
                  Seat {scanResult.seatLabel || "A12"}
                </span>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-purple-400" />
                  <span>Show / Event</span>
                </span>
                <span className="font-semibold text-slate-200 text-right max-w-[220px] truncate">
                  {scanResult.eventTitle || "Reserved Event"}
                </span>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Screen &amp; Venue</span>
                </span>
                <span className="font-semibold text-slate-200">
                  {scanResult.screenName || "Screen 2"} • {scanResult.venueName || "Cinema"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Booking Reference</span>
                <span className="font-mono font-bold text-indigo-400">
                  {scanResult.bookingRef}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-rose-900/40 border border-rose-500/30 text-xs text-left space-y-1">
              <span className="text-[10px] uppercase font-bold text-rose-300 block">
                Rejection Reason
              </span>
              <span className="font-mono font-bold text-white block">
                {scanResult.reasonCode || "REJECTED"}
              </span>
              <p className="text-slate-300 text-xs mt-1">
                {scanResult.message}
              </p>
            </div>
          )}

          {/* Auto-Reset Countdown Bar & Next Passenger Button */}
          <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-white/10">
            <span className="text-[11px] text-slate-400 font-mono">
              {countdownSec > 0 ? `Auto-ready in ${countdownSec}s...` : `Verified at ${lastDetectedAt}`}
            </span>
            <button
              onClick={handleResetScanner}
              className="px-4 py-2 rounded-xl bg-white text-slate-950 hover:bg-slate-200 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-white/10 transition-transform active:scale-95"
            >
              <span>Scan Next Ticket</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Camera Viewfinder */}
      <div className="glass-card rounded-3xl border border-slate-800 p-6 space-y-4">
        <div className="relative w-full min-h-[280px] rounded-2xl bg-black/90 border border-slate-700/80 overflow-hidden flex items-center justify-center text-slate-500 text-xs text-center">
          {/* Dedicated DOM region for html5-qrcode */}
          <div
            id={qrRegionId}
            className={`w-full ${scanning ? "block" : "hidden"}`}
          />

          {/* Viewfinder Target Reticle & Laser Beam while scanning */}
          {scanning && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-56 h-56 border-2 border-emerald-500/60 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                {/* Laser scan line moving up and down */}
                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_#10b981] animate-pulse top-1/2" />
                <span className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-[10px] font-mono font-bold text-emerald-400 whitespace-nowrap bg-black/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Align QR Code
                </span>
              </div>
            </div>
          )}

          {/* Idle state */}
          {!scanning && (
            <div className="p-6 space-y-3 pointer-events-none">
              <Camera className="w-12 h-12 mx-auto text-slate-600" />
              <p className="font-semibold text-slate-300">Camera is idle.</p>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Click below to start instant auto-scanning.
              </p>
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
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-98 transition-all"
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
          <span>Manual Token or Ticket Link Paste</span>
        </h3>
        <p className="text-xs text-slate-400">
          Paste a dynamic token, ticket URL (e.g. <code>http://.../t/tok_...</code>), or booking link:
        </p>

        <textarea
          rows={2}
          value={manualToken}
          onChange={(e) => setManualToken(e.target.value)}
          placeholder="Paste dynamic QR token or ticket URL..."
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
