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
  DoorOpen,
  Tv,
  Sparkles,
  Zap,
  Info,
  SwitchCamera,
  Flashlight,
} from "lucide-react";
import { soundManager } from "@/lib/audio";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export interface ScanResult {
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

interface QrScannerValidatorProps {
  defaultMode?: "GATE" | "SEAT";
  defaultSeatUnit?: string;
  showHeader?: boolean;
  showGeneratorLink?: boolean;
  className?: string;
}

export function QrScannerValidator({
  defaultMode = "GATE",
  defaultSeatUnit = "SCREEN2-A12",
  showHeader = true,
  showGeneratorLink = true,
  className = "",
}: QrScannerValidatorProps) {
  const [readerMode, setReaderMode] = useState<"GATE" | "SEAT">(defaultMode);
  const [selectedSeatUnit, setSelectedSeatUnit] = useState<string>(defaultSeatUnit);
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [manualToken, setManualToken] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [fetchingDemoToken, setFetchingDemoToken] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");

  const qrRegionId = "qr-scanner-viewport-unique";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedTokenRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const autoResetTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Stop camera cleanly
  const stopCamera = async () => {
    if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  };

  // Start mobile camera with multi-stage fallback
  const startCamera = async (facing: "environment" | "user" = cameraFacing) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      setCameraError(null);
      setScanResult(null);
      isProcessingRef.current = false;
      lastScannedTokenRef.current = "";

      // Stop previous instance if running
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch {}
        scannerRef.current = null;
      }

      // Check available cameras
      let devices: Array<{ id: string; label: string }> = [];
      try {
        devices = await Html5Qrcode.getCameras();
      } catch {}

      let cameraTarget: string | { facingMode: string } = { facingMode: facing };
      if (devices && devices.length > 0) {
        if (facing === "environment") {
          const rearCam = devices.find((d) =>
            /back|rear|environment|main|primary/i.test(d.label)
          );
          cameraTarget = rearCam ? rearCam.id : devices[0].id;
        } else {
          const frontCam = devices.find((d) =>
            /front|user|selfie|face/i.test(d.label)
          );
          cameraTarget = frontCam ? frontCam.id : devices[0].id;
        }
      }

      const html5QrCode = new Html5Qrcode(qrRegionId, {
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const config = {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const w = viewfinderWidth || 300;
          const h = viewfinderHeight || 300;
          const minEdge = Math.min(w, h);
          const size = Math.max(200, Math.floor(minEdge * 0.85));
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
      };

      try {
        await html5QrCode.start(
          cameraTarget,
          config,
          async (decodedText) => {
            await handleProcessToken(decodedText);
          },
          () => {}
        );
      } catch (firstErr: any) {
        console.warn("Target camera start failed, attempting user camera fallback:", firstErr);
        await html5QrCode.start(
          { facingMode: "user" },
          config,
          async (decodedText) => {
            await handleProcessToken(decodedText);
          },
          () => {}
        );
      }

      setScanning(true);
    } catch (err: any) {
      const msg =
        err.name === "NotAllowedError" || err.message?.includes("Permission")
          ? "Camera permission denied. Please allow camera access in your browser."
          : err.name === "NotFoundError" || err.message?.includes("NotFound")
          ? "No camera found on this device. You can use the 1-Click Instant Validator or manual token input below."
          : err.message || "Camera access requires HTTPS or permissions on mobile.";
      setCameraError(msg);
      setScanning(false);
    } finally {
      isStartingRef.current = false;
    }
  };

  // Switch between front and rear cameras
  const toggleCameraFacing = async () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(nextFacing);
    if (scanning) {
      await stopCamera();
      await startCamera(nextFacing);
    }
  };

  useEffect(() => {
    return () => {
      if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
      if (scannerRef.current && scanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [scanning]);

  // Process token via Gate or Seat scanner endpoint
  const handleProcessToken = async (rawTokenString: string) => {
    const cleanToken = extractTokenFromQr(rawTokenString);
    if (!cleanToken) return;

    // Strict synchronous lock check
    if (isProcessingRef.current) return;

    const now = Date.now();
    if (cleanToken === lastScannedTokenRef.current && now - lastScannedTimeRef.current < 4000) {
      return;
    }

    isProcessingRef.current = true;
    lastScannedTokenRef.current = cleanToken;
    lastScannedTimeRef.current = now;
    setSubmitting(true);

    try {
      const supabase = createClient();
      const session = (await supabase.auth.getSession()).data.session;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      if (readerMode === "GATE") {
        // Gate Turnstile Verification
        const res = await fetch("/api/scan/entry", {
          method: "POST",
          headers,
          body: JSON.stringify({
            token: cleanToken,
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
          headers,
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
    } catch {
      setScanResult({
        success: false,
        message: "Failed to connect to verification API",
      });
      soundManager.playErrorTone();
    } finally {
      setSubmitting(false);
      // Auto-unlock after 3.5s cooldown
      if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
      autoResetTimerRef.current = setTimeout(() => {
        isProcessingRef.current = false;
      }, 3500);
    }
  };

  // Instant 1-Click Verification using live active token from ticket API
  const fetchAndValidateDemoToken = async () => {
    setFetchingDemoToken(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/ticket/tok_bk829173_secure_demo_link/qr");
      const json = await res.json();
      if (res.ok && json.token) {
        setManualToken(json.token);
        await handleProcessToken(json.token);
      } else {
        setScanResult({
          success: false,
          message: json.error || "Unable to retrieve dynamic token from ticket endpoint",
        });
      }
    } catch {
      setScanResult({
        success: false,
        message: "Failed to fetch live token from ticket service",
      });
    } finally {
      setFetchingDemoToken(false);
    }
  };

  return (
    <div className={`w-full max-w-md mx-auto space-y-4 ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Cryptographic Validator</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">QR Validation & Scanner</h2>
          <p className="text-xs text-slate-400">
            Scan via mobile camera or test instantly with dynamic replay verification
          </p>
        </div>
      )}

      {/* Reader Mode Selector: Gate vs Seat Unit */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 border border-slate-800 rounded-2xl">
        <button
          onClick={() => {
            setReaderMode("GATE");
            setScanResult(null);
          }}
          className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            readerMode === "GATE"
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <DoorOpen className="w-4 h-4" />
          <span>Entrance Gate</span>
        </button>

        <button
          onClick={() => {
            setReaderMode("SEAT");
            setScanResult(null);
          }}
          className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            readerMode === "SEAT"
              ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/25"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>Seat Unit Scanner</span>
        </button>
      </div>

      {/* Seat Unit Selector if in SEAT mode */}
      {readerMode === "SEAT" && (
        <div className="p-3 bg-slate-900/90 border border-purple-500/30 rounded-2xl space-y-2 animate-fadeIn">
          <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block">
            Target Seat Unit to Validate Against:
          </label>
          <select
            value={selectedSeatUnit}
            onChange={(e) => {
              setSelectedSeatUnit(e.target.value);
              setScanResult(null);
            }}
            className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-400"
          >
            <option value="SCREEN2-A12">SCREEN2-A12 (Matched for Demo Ticket)</option>
            <option value="SCREEN2-A13">SCREEN2-A13 (Wrong Seat Test - Triggers Alarm)</option>
            <option value="SCREEN2-B1">SCREEN2-B1 (Row B Test Unit)</option>
            <option value="SCREEN2-C5">SCREEN2-C5 (Row C Test Unit)</option>
          </select>
          <p className="text-[10px] text-slate-400">
            {selectedSeatUnit === "SCREEN2-A12"
              ? "✅ Matches demo ticket seat A12 (will authorize seat)."
              : "⚠️ Does not match demo ticket (will detect wrong seat and flag mismatch)."}
          </p>
        </div>
      )}

      {/* Camera Viewport & Controls */}
      <div className="glass-card rounded-3xl border border-slate-700/80 overflow-hidden shadow-2xl p-4 space-y-4 bg-gradient-to-b from-slate-900/90 to-slate-950/95">
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-square flex flex-col items-center justify-center">
          <div id={qrRegionId} className="w-full h-full" />

          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-950/80 backdrop-blur-sm z-10">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
                <Camera className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <span className="font-bold text-sm text-white block">Camera Ready</span>
                <span className="text-xs text-slate-400 block max-w-xs">
                  Tap below to start your mobile camera and scan the dynamic QR code
                </span>
              </div>
              <button
                onClick={() => startCamera()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>Start Camera Scanner</span>
              </button>
            </div>
          )}

          {scanning && (
            <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
              <button
                onClick={toggleCameraFacing}
                title="Switch Camera (Front/Back)"
                className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 text-xs shadow-lg"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
              <button
                onClick={stopCamera}
                className="px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-xs shadow-lg"
              >
                Stop
              </button>
            </div>
          )}
        </div>

        {/* Camera Permission / HTTPS Notice */}
        {cameraError && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <Info className="w-4 h-4 text-amber-400" />
              <span>Camera Notice</span>
            </div>
            <p className="text-[11px] text-amber-200/80">{cameraError}</p>
          </div>
        )}

        {/* Instant 1-Click Test Validator (No Camera Required) */}
        <div className="pt-1">
          <button
            onClick={fetchAndValidateDemoToken}
            disabled={fetchingDemoToken || submitting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-emerald-200" />
            <span>
              {fetchingDemoToken
                ? "Fetching & Validating Live Token..."
                : "Instant 1-Click Validate Live Dynamic QR"}
            </span>
          </button>
          <span className="block text-center text-[10px] text-slate-500 mt-1">
            Pulls the current 30s dynamic HMAC token from ticket demo and validates immediately.
          </span>
        </div>

        {/* Manual Token Paste Input */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Or Paste Token Manually:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Paste dynamic HMAC token string..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => handleProcessToken(manualToken)}
              disabled={!manualToken.trim() || submitting}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all disabled:opacity-50"
            >
              Verify
            </button>
          </div>
        </div>

        {/* Validation Result Card */}
        {scanResult && (
          <div
            className={`p-4 rounded-2xl border transition-all animate-fadeIn ${
              scanResult.success
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/40 text-rose-300"
            }`}
          >
            <div className="flex items-start gap-3">
              {scanResult.success ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 flex-1">
                <div className="font-extrabold text-sm flex items-center justify-between">
                  <span>{scanResult.success ? "ACCESS GRANTED" : "VALIDATION REJECTED"}</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800">
                    {readerMode}
                  </span>
                </div>

                <p className="text-xs text-slate-200">
                  {scanResult.displayMessage || scanResult.message}
                </p>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-mono">
                  {scanResult.seatLabel && (
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[9px] uppercase">Validated Seat</span>
                      <span className="font-bold text-white">{scanResult.seatLabel}</span>
                    </div>
                  )}

                  {scanResult.bookingRef && (
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[9px] uppercase">Booking Ref</span>
                      <span className="font-bold text-white">{scanResult.bookingRef}</span>
                    </div>
                  )}

                  {scanResult.reasonCode && (
                    <div className="col-span-2 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[9px] uppercase">Audit Code</span>
                      <span className="text-amber-300">{scanResult.reasonCode}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Link to Dynamic QR Generator */}
        {showGeneratorLink && (
          <div className="pt-2 border-t border-slate-800">
            <Link
              href="/qr/generate"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all"
            >
              <span>Switch to QR Generator Page</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>

      <style jsx global>{`
        #${qrRegionId} {
          position: relative !important;
          width: 100% !important;
          height: 100% !important;
          border: none !important;
        }
        #${qrRegionId} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 1rem !important;
          display: block !important;
        }
        #${qrRegionId} canvas {
          border-radius: 1rem !important;
        }
        #${qrRegionId} #qr-shaded-region {
          border-radius: 1rem !important;
        }
      `}</style>
    </div>
  );
}

