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
  Tv,
  DoorOpen,
  Sparkles,
} from "lucide-react";
import { soundManager } from "@/lib/audio";

interface ScanResult {
  success: boolean;
  status?: string;
  bookingRef?: string;
  seatLabel?: string;
  assignedSeatLabel?: string;
  currentSeatLabel?: string;
  eventTitle?: string;
  message?: string;
  reasonCode?: string;
  displayMessage?: string;
}

export default function DynamicQrReaderPage() {
  const [readerMode, setReaderMode] = useState<"GATE" | "SEAT">("GATE");
  const [selectedSeatUnit, setSelectedSeatUnit] = useState<string>("SCREEN2-A12");
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [manualToken, setManualToken] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [fetchingDemoToken, setFetchingDemoToken] = useState<boolean>(false);

  const qrRegionId = "html5qr-reader-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Stop camera when unmounting or changing modes
  const stopCamera = async () => {
    if (scannerRef.current && scanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      setScanning(false);
    }
  };

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
          await handleProcessToken(decodedText);
        },
        () => {}
      );

      setScanning(true);
    } catch (err: any) {
      setCameraError(
        err.message || "Camera access requires HTTPS or permissions. You can use the instant token validation below."
      );
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

  // Fetch the latest active 30s token from demo booking (tok_bk829173_secure_demo_link)
  const fetchAndFillActiveToken = async () => {
    setFetchingDemoToken(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/ticket/tok_bk829173_secure_demo_link/qr");
      const json = await res.json();
      if (res.ok && json.token) {
        setManualToken(json.token);
        // Automatically validate it
        await handleProcessToken(json.token);
      } else {
        alert(json.error || "Unable to fetch dynamic token");
      }
    } catch {
      alert("Failed to fetch fresh token from ticket API");
    } finally {
      setFetchingDemoToken(false);
    }
  };

  // Process token via Gate or Seat scanner endpoint
  const handleProcessToken = async (tokenString: string) => {
    if (submitting) return;
    setSubmitting(true);
    const cleanToken = tokenString.trim();

    try {
      if (readerMode === "GATE") {
        // Gate Turnstile Verification
        const res = await fetch("/api/scan/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: cleanToken,
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
      } else {
        // Seat Unit Reader Verification (Validates against specific seat unit)
        const unitSecret = `smartseat_secret_${selectedSeatUnit}`;
        const res = await fetch("/api/scan/seat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: cleanToken,
            unitId: selectedSeatUnit,
            unitSecret,
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
      }
    } catch (err: any) {
      setScanResult({
        success: false,
        reasonCode: "NETWORK_ERROR",
        message: err.message || "Failed to contact validator route handler.",
      });
      soundManager.playErrorTone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="glass-panel rounded-3xl border border-slate-800 p-6 space-y-3 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <QrCode className="w-3.5 h-3.5" />
          <span>Dynamic QR Reader & Hardware Alternative</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          QR Reader & Ticket Validator
        </h1>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          The passenger displays their 30-second regenerating dynamic QR. This reader validates the cryptographic HMAC signature, checks 30s expiration (+-5s clock skew), enforces single-use nonces, and verifies seat allocation.
        </p>

        {/* Reader Mode Selector */}
        <div className="pt-2 flex items-center justify-center gap-2">
          <button
            onClick={() => {
              setReaderMode("GATE");
              setScanResult(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              readerMode === "GATE"
                ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <DoorOpen className="w-4 h-4" />
            <span>Entrance Gate Reader</span>
          </button>

          <button
            onClick={() => {
              setReaderMode("SEAT");
              setScanResult(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              readerMode === "SEAT"
                ? "bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Seat-Level Unit Reader</span>
          </button>
        </div>

        {/* If Seat Mode: Choose which seat this reader is simulating */}
        {readerMode === "SEAT" && (
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs max-w-sm mx-auto">
            <span className="text-slate-400 font-semibold">Simulating Reader at:</span>
            <select
              value={selectedSeatUnit}
              onChange={(e) => {
                setSelectedSeatUnit(e.target.value);
                setScanResult(null);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-bold text-xs"
            >
              <option value="SCREEN2-A12">Seat A12 (Passenger A12 Ticket MATCH)</option>
              <option value="SCREEN2-A13">Seat A13 (Passenger A12 Ticket MISMATCH)</option>
              <option value="SCREEN2-B4">Seat B4 (Passenger A12 Ticket MISMATCH)</option>
            </select>
          </div>
        )}
      </div>

      {/* Validation Result Box */}
      {scanResult && (
        <div
          className={`p-6 rounded-3xl border-2 text-center space-y-3 animate-in fade-in zoom-in-95 duration-200 shadow-2xl ${
            scanResult.success
              ? "bg-emerald-950/50 border-emerald-500 text-emerald-200 shadow-emerald-500/20"
              : "bg-rose-950/50 border-rose-500 text-rose-200 shadow-rose-500/20"
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
              {scanResult.success
                ? readerMode === "GATE"
                  ? "ENTRY AUTHORIZED"
                  : "SEAT AUTHORIZED"
                : "VALIDATION REJECTED"}
            </h2>
            <p className="text-sm font-semibold mt-1">
              {scanResult.message || (scanResult.success ? "Dynamic credential verified." : "Access Denied.")}
            </p>
          </div>

          {scanResult.success ? (
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-900/40 border border-emerald-500/30">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                  Assigned Seat
                </span>
                <span className="text-lg font-black text-white">
                  {scanResult.seatLabel || selectedSeatUnit.replace("SCREEN2-", "")}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-900/40 border border-emerald-500/30">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                  Booking Ref
                </span>
                <span className="text-sm font-mono font-bold text-white">
                  {scanResult.bookingRef || "BK829173"}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-rose-900/40 border border-rose-500/30 text-xs text-left space-y-1">
              <div className="flex justify-between">
                <span className="text-[10px] uppercase font-bold text-rose-300">
                  Rejection Reason Code:
                </span>
                <span className="font-mono font-bold text-white">
                  {scanResult.reasonCode || "REJECTED"}
                </span>
              </div>
              {scanResult.assignedSeatLabel && (
                <div className="text-[11px] text-rose-200">
                  Ticket belongs to: <strong>Seat {scanResult.assignedSeatLabel}</strong> • Scanned at: <strong>Seat {scanResult.currentSeatLabel}</strong>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setScanResult(null)}
            className="mt-2 text-xs text-slate-300 hover:text-white underline"
          >
            Clear Reader for Next Scan
          </button>
        </div>
      )}

      {/* Camera Live Scanner Section */}
      <div className="glass-card rounded-3xl border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-white text-sm">
              Live Camera Scanner
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Point at passenger&apos;s phone screen</span>
        </div>

        <div className="relative w-full min-h-[250px] rounded-2xl bg-black/80 border border-slate-700/80 overflow-hidden flex items-center justify-center text-slate-500 text-xs text-center">
          {/* Empty dedicated region for html5-qrcode DOM operations */}
          <div
            id={qrRegionId}
            className={`w-full ${scanning ? "block" : "hidden"}`}
          />

          {/* Sibling React element - safe from DOM mutation by external library */}
          {!scanning && (
            <div className="p-6 space-y-3 pointer-events-none">
              <Camera className="w-10 h-10 mx-auto text-slate-600" />
              <p>Camera is currently idle. Click below to start scanning.</p>
            </div>
          )}
        </div>

        {cameraError && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
            {cameraError}
          </div>
        )}

        <div className="flex gap-2">
          {!scanning ? (
            <button
              onClick={startCamera}
              className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30"
            >
              <Camera className="w-4 h-4" />
              <span>Activate Camera Viewfinder</span>
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

      {/* Instant 1-Click Test & Paste Validator */}
      <div className="glass-card rounded-3xl border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>1-Click Test Validation (Single-Device Demo)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Testing on one laptop or phone? Grab the active dynamic token from Seat A12&apos;s ticket and validate immediately:
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={fetchAndFillActiveToken}
            disabled={fetchingDemoToken || submitting}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-indigo-600 hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            {fetchingDemoToken ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>Fetch Fresh A12 Dynamic Token & Validate Instantly</span>
          </button>
        </div>

        {/* Or Paste Raw Token */}
        <div className="space-y-2 pt-2">
          <label className="text-xs font-semibold text-slate-400 block">
            Or Paste Raw Dynamic QR Token:
          </label>
          <textarea
            rows={2}
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="eyJuYnVpZCI6... (base64url payload and signature)"
            className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 font-mono text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
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
            <span>Validate Pasted Token</span>
          </button>
        </div>
      </div>
    </div>
  );
}
