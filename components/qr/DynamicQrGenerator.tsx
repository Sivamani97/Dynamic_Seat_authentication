"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import QRCode from "qrcode";
import {
  Clock,
  Ticket,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Sun,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface TicketData {
  token: string;
  expiresAt: number;
  lifetimeSec: number;
  booking: {
    id: string;
    bookingRef: string;
    status: string;
    seatLabel: string;
    seatUnitId: string;
    eventTitle: string;
    eventStartTime: string;
  };
}

interface DynamicQrGeneratorProps {
  initialTicketToken?: string;
  showHeader?: boolean;
  showValidatorLink?: boolean;
  className?: string;
}

export function DynamicQrGenerator({
  initialTicketToken = "tok_bk829173_secure_demo_link",
  showHeader = true,
  showValidatorLink = true,
  className = "",
}: DynamicQrGeneratorProps) {
  const [ticketToken, setTicketToken] = useState<string>(initialTicketToken);
  const [data, setData] = useState<TicketData | null>(null);
  const [qrSvg, setQrSvg] = useState<string>("");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pulseAnimation, setPulseAnimation] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch fresh dynamic HMAC token
  const fetchFreshToken = useCallback(async (tokenToFetch?: string) => {
    const activeToken = tokenToFetch || ticketToken;
    try {
      setPulseAnimation(true);
      const res = await fetch(`/api/ticket/${activeToken}/qr`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (res.status === 410) {
          setError("This ticket has expired or was cancelled.");
        } else {
          setError(errJson.error || "Failed to load dynamic QR token");
        }
        setLoading(false);
        return;
      }

      const ticketJson: TicketData = await res.json();
      setData(ticketJson);
      setError(null);

      // Render high-contrast QR code as SVG
      const svg = await QRCode.toString(ticketJson.token, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 4,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      setQrSvg(svg);

      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, ticketJson.expiresAt - nowSec);
      setSecondsRemaining(remaining);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Network error fetching dynamic QR code");
      setLoading(false);
    } finally {
      setTimeout(() => setPulseAnimation(false), 600);
    }
  }, [ticketToken]);

  // Initial fetch and 28-second rotation loop
  useEffect(() => {
    fetchFreshToken();

    timerRef.current = setInterval(() => {
      fetchFreshToken();
    }, 28000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchFreshToken]);

  // 1-second countdown clock
  useEffect(() => {
    countdownIntervalRef.current = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const copyTokenToClipboard = async () => {
    if (!data?.token) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.token);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = data.token;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Timer ring math (circle radius 42 -> circumference ~ 264)
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = Math.min(100, Math.max(0, (secondsRemaining / 30) * 100));
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const timerColor =
    secondsRemaining > 15
      ? "text-emerald-400 stroke-emerald-400"
      : secondsRemaining > 6
      ? "text-amber-400 stroke-amber-400"
      : "text-rose-500 stroke-rose-500 animate-pulse";

  return (
    <div className={`w-full max-w-md mx-auto space-y-4 ${className}`}>
      {/* Optional Header */}
      {showHeader && (
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Cryptographic Anti-Screenshot QR</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Dynamic Mobile Ticket</h2>
          <p className="text-xs text-slate-400">
            Automatically generates a new HMAC-SHA256 token every 30 seconds
          </p>
        </div>
      )}

      {/* Screen Brightness Banner for Mobile Users */}
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
        <Sun className="w-4 h-4 shrink-0 text-amber-400" />
        <span>Mobile tip: Turn up screen brightness for fast hardware or camera scanning.</span>
      </div>

      {/* Main Ticket Card */}
      <div className="relative glass-card rounded-3xl border border-slate-700/80 overflow-hidden shadow-2xl p-5 space-y-5 bg-gradient-to-b from-slate-900/90 to-slate-950/95">
        {/* Top Event & Seat Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 block">
              Event Pass
            </span>
            <h3 className="font-bold text-white text-base leading-tight">
              {data?.booking?.eventTitle || "Inception: 10th Anniversary IMAX"}
            </h3>
            <span className="text-xs text-slate-400">
              Ref: <span className="font-mono text-slate-200">{data?.booking?.bookingRef || "BK-829173"}</span>
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Seat
            </span>
            <div className="inline-block px-3 py-1 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-black text-lg">
              {data?.booking?.seatLabel || "A12"}
            </div>
          </div>
        </div>

        {/* QR Display Region */}
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative p-4 bg-white rounded-2xl shadow-xl transition-all duration-300 hover:scale-[1.01]">
            {loading ? (
              <div className="w-60 h-60 flex flex-col items-center justify-center space-y-2 text-slate-800">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
                <span className="text-xs font-semibold">Generating dynamic HMAC...</span>
              </div>
            ) : error ? (
              <div className="w-60 h-60 flex flex-col items-center justify-center p-4 text-center space-y-2 text-rose-600">
                <AlertTriangle className="w-8 h-8" />
                <span className="text-xs font-bold">{error}</span>
                <button
                  onClick={() => fetchFreshToken()}
                  className="mt-2 px-3 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div
                className="w-64 h-64 flex items-center justify-center transition-opacity duration-300"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
          </div>

          {/* Countdown Timer with SVG Ring */}
          <div className="flex items-center gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 px-4 w-full justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="stroke-slate-800 fill-none"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className={`fill-none transition-all duration-1000 ${timerColor}`}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </svg>
                <span className={`absolute font-black text-xs font-mono ${timerColor}`}>
                  {secondsRemaining}s
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Dynamic QR Active
                </div>
                <div className="text-[10px] text-slate-400">
                  Rotates automatically in {secondsRemaining} seconds
                </div>
              </div>
            </div>

            <button
              onClick={() => fetchFreshToken()}
              disabled={loading}
              title="Force Refresh Token"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${pulseAnimation ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Dynamic Token String Details */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Cryptographic Payload
            </span>
            <button
              onClick={copyTokenToClipboard}
              disabled={!data?.token}
              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Token</span>
                </>
              )}
            </button>
          </div>
          <div className="font-mono text-[11px] text-slate-300 break-all bg-slate-900/80 p-2 rounded-lg border border-slate-800">
            {data?.token || "Loading token..."}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Seat Unit: {data?.booking?.seatUnitId || "SCREEN2-A12"}</span>
            <span>Anti-replay: Active</span>
          </div>
        </div>

        {/* Quick Ticket Selector for Testing */}
        <div className="pt-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Ticket Demo Token Selector:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={ticketToken}
              onChange={(e) => setTicketToken(e.target.value)}
              placeholder="e.g. tok_bk829173_secure_demo_link"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => fetchFreshToken()}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all"
            >
              Load
            </button>
          </div>
        </div>

        {/* Quick Jump to Validator Page */}
        {showValidatorLink && (
          <div className="pt-2 border-t border-slate-800">
            <Link
              href="/qr/validate"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all"
            >
              <span>Scan & Validate on Mobile</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

