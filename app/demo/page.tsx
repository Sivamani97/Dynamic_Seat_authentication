"use client";

import { useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import {
  Flame,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  ArrowRight,
  RefreshCw,
  QrCode,
  ShieldCheck,
  LifeBuoy,
  Tv,
  FileCheck,
  Clock,
  Lock,
} from "lucide-react";
import { soundManager } from "@/lib/audio";
import { generateDynamicToken } from "@/lib/tokens";

export default function GuidedDemoPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [demoState, setDemoState] = useState({
    bookingRef: "BK829173",
    seatLabel: "A12",
    ticketStatus: "BOOKED",
    seatA12Status: "NORMAL",
    seatA13Status: "NORMAL",
    gateMessage: "",
    seatScanMessage: "",
    pressureTelemetry: 0,
    mismatchTimer: 0,
    activeAlert: null as string | null,
    auditVerified: false,
  });

  const [loadingAction, setLoadingAction] = useState(false);

  // STEP 1: Book Seat A12
  const runStep1_Book = async () => {
    setLoadingAction(true);
    setTimeout(() => {
      setDemoState((prev) => ({
        ...prev,
        bookingRef: "BK829173",
        seatLabel: "A12",
        ticketStatus: "BOOKED",
      }));
      soundManager.playSuccessTone();
      setLoadingAction(false);
      setCurrentStep(2);
    }, 600);
  };

  // STEP 2: Open Dynamic Ticket
  const runStep2_OpenTicket = async () => {
    setLoadingAction(true);
    setTimeout(() => {
      soundManager.playSuccessTone();
      setLoadingAction(false);
      setCurrentStep(3);
    }, 500);
  };

  // STEP 3: Gate Entry Scan
  const runStep3_GateScan = async () => {
    setLoadingAction(true);
    setTimeout(() => {
      setDemoState((prev) => ({
        ...prev,
        ticketStatus: "CHECKED_IN",
        gateMessage: "ENTRY AUTHORIZED: Checked in at Turnstile 1.",
      }));
      soundManager.playSuccessTone();
      setLoadingAction(false);
      setCurrentStep(4);
    }, 800);
  };

  // STEP 4: Seat A12 Dynamic QR Scan
  const runStep4_SeatScan = async () => {
    setLoadingAction(true);
    setTimeout(() => {
      setDemoState((prev) => ({
        ...prev,
        ticketStatus: "SEAT_AUTHORIZED",
        seatA12Status: "AUTHORIZED",
        seatScanMessage: "Seat A12 ✓ Seat Verified & Bound to Passenger.",
      }));
      soundManager.playSuccessTone();
      setLoadingAction(false);
      setCurrentStep(5);
    }, 800);
  };

  // STEP 5: Sit Down on A12 (75kg)
  const runStep5_SitA12 = async () => {
    setLoadingAction(true);
    setTimeout(() => {
      setDemoState((prev) => ({
        ...prev,
        pressureTelemetry: 75,
        seatA12Status: "AUTHORIZED",
      }));
      soundManager.playSuccessTone();
      setLoadingAction(false);
      setCurrentStep(6);
    }, 600);
  };

  // STEP 6: Wrong Seat Scan (Try scanning A12 ticket at A13)
  const runStep6_WrongSeatScan = async () => {
    setLoadingAction(true);
    setTimeout(() => {
      setDemoState((prev) => ({
        ...prev,
        seatScanMessage:
          "REJECTED: Ticket is booked for Seat A12, but scanned at Seat A13 (WRONG_SEAT_SCAN). Logged to audit chain.",
      }));
      soundManager.playErrorTone();
      setLoadingAction(false);
      setCurrentStep(7);
    }, 900);
  };

  // STEP 7: Unauthorized Seating at A13 (15s Mismatch Delay)
  const runStep7_UnauthorizedSit = async () => {
    setLoadingAction(true);
    // Simulate 15s delay trigger
    setTimeout(() => {
      setDemoState((prev) => ({
        ...prev,
        seatA13Status: "WRONG_SEAT",
        activeAlert: "Silent alert dispatched to staff: Unauthorized passenger at Seat A13.",
      }));
      // Note: Silent alert per specification!
      setLoadingAction(false);
      setCurrentStep(8);
    }, 1200);
  };

  // STEP 8: Bag on Seat A14 (35kg -> Bag Filter suppresses alert)
  const runStep8_BagFilter = async () => {
    setLoadingAction(true);
    setTimeout(() => {
      setDemoState((prev) => ({
        ...prev,
        pressureTelemetry: 35,
      }));
      soundManager.playSuccessTone();
      setLoadingAction(false);
      setCurrentStep(9);
    }, 700);
  };

  // STEP 9: Emergency SOS Button
  const runStep9_Sos = async () => {
    setLoadingAction(true);
    soundManager.startSiren();
    soundManager.triggerVibration([300, 150, 300]);
    setTimeout(() => {
      soundManager.stopSiren();
      setDemoState((prev) => ({
        ...prev,
        activeAlert: "🚨 CRITICAL SOS: Medical emergency at Seat A12 dispatched to staff map.",
      }));
      setLoadingAction(false);
      setCurrentStep(10);
    }, 1500);
  };

  // STEP 10: Hardware Fault Injection
  const runStep10_Fault = async () => {
    setLoadingAction(true);
    setTimeout(() => {
      soundManager.playErrorTone();
      setLoadingAction(false);
      setCurrentStep(11);
    }, 800);
  };

  // STEP 11: Cryptographic Hash Chain Audit Check
  const runStep11_VerifyAudit = async () => {
    setLoadingAction(true);
    setTimeout(() => {
      setDemoState((prev) => ({
        ...prev,
        auditVerified: true,
      }));
      soundManager.playSuccessTone();
      setLoadingAction(false);

      // Trigger Confetti!
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}
    }, 1000);
  };

  const steps = [
    { num: 1, title: "Book Seat A12", desc: "Reserve seat on 2D map with 2-minute checkout hold." },
    { num: 2, title: "Dynamic Ticket", desc: "Inspect 30s countdown ring and opaque signed nonce." },
    { num: 3, title: "Gate Entry Scan", desc: "Verify at turnstile (status transitions BOOKED -> CHECKED_IN)." },
    { num: 4, title: "Scan at Seat A12", desc: "Authenticate seat unit (status transitions to SEAT_AUTHORIZED)." },
    { num: 5, title: "Sit Down (75 kg)", desc: "Occupancy sensor triggers 'Occupancy Confirmed'." },
    { num: 6, title: "Wrong-Seat Scan", desc: "Try scanning A12 ticket at A13 -> rejected with WRONG_SEAT_SCAN." },
    { num: 7, title: "Unauthorized Seating", desc: "Sit on A13 -> 15s delay expires -> silent staff alert dispatched." },
    { num: 8, title: "Luggage Filter", desc: "Place 35kg bag on seat -> classified as UNCERTAIN -> no alert." },
    { num: 9, title: "Emergency SOS", desc: "Single tap SOS button -> Web Audio siren chime & staff alert." },
    { num: 10, title: "Hardware Fault", desc: "Inject sensor glitch -> unit flags 🔧 without false passenger alert." },
    { num: 11, title: "Verify Audit Chain", desc: "Cryptographic mathematical proof of unbroken SHA-256 hash log." },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Demo Header */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 text-center space-y-3 relative overflow-hidden">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span>Automated Interactive Showcase</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          SmartSeat Guided 2-Minute Demo
        </h1>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          Experience every capability of SmartSeat right inside your browser: from dynamic cryptographic ticket generation to wrong-seat rejection, bag discrimination, and audit hash proof.
        </p>

        {/* Progress Bar */}
        <div className="pt-4 max-w-md mx-auto space-y-1.5">
          <div className="flex justify-between text-xs font-mono font-bold text-slate-400">
            <span>Step {currentStep} of {steps.length}</span>
            <span className="text-indigo-400">{Math.round((currentStep / steps.length) * 100)}% Complete</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              style={{ width: `${(currentStep / steps.length) * 100}%` }}
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
            />
          </div>
        </div>
      </div>

      {/* Interactive Step Runner */}
      <div className="glass-card rounded-3xl border border-slate-800 p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center font-black text-xl text-indigo-400 shrink-0">
            {currentStep}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              {steps[currentStep - 1].title}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {steps[currentStep - 1].desc}
            </p>
          </div>
        </div>

        {/* Interactive Action Area */}
        <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-4">
          {currentStep === 1 && (
            <div className="space-y-4 text-center">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 inline-block text-left text-xs space-y-1">
                <div><strong>Event:</strong> Movie XYZ: The Quantum Paradox</div>
                <div><strong>Seat:</strong> A12 (Dolby Cinema)</div>
                <div><strong>Price:</strong> $16.00</div>
              </div>
              <div>
                <button
                  onClick={runStep1_Book}
                  disabled={loadingAction}
                  className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 mx-auto shadow-lg shadow-indigo-600/30"
                >
                  {loadingAction ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>Book Seat A12 (Start Demo)</span>
                </button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4 text-center">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-2 max-w-sm mx-auto">
                <div className="font-mono text-indigo-400 font-bold text-sm">Ref: {demoState.bookingRef}</div>
                <div>Dynamic QR generates a fresh 128-bit nonce every 30 seconds with HMAC-SHA256 signing.</div>
              </div>
              <button
                onClick={runStep2_OpenTicket}
                disabled={loadingAction}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 mx-auto"
              >
                <span>Open Ticket & Proceed to Gate Scan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-400">
                Simulating camera scan at the entrance gate turnstile scanner.
              </p>
              <button
                onClick={runStep3_GateScan}
                disabled={loadingAction}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 mx-auto shadow-md"
              >
                <QrCode className="w-4 h-4" />
                <span>Simulate Gate Check-In Scan</span>
              </button>
              {demoState.gateMessage && (
                <div className="text-xs text-emerald-400 font-semibold">{demoState.gateMessage}</div>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-400">
                Passenger arrives at Seat A12 and scans the dynamic QR at the virtual seat unit scanner.
              </p>
              <button
                onClick={runStep4_SeatScan}
                disabled={loadingAction}
                className="px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2 mx-auto"
              >
                <QrCode className="w-4 h-4" />
                <span>Scan QR at Seat Unit SCREEN2-A12</span>
              </button>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-400">
                Passenger sits down on Seat A12. The pressure sensor reading transitions to 75 kg.
              </p>
              <button
                onClick={runStep5_SitA12}
                disabled={loadingAction}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 mx-auto shadow-lg shadow-emerald-600/30"
              >
                <span>Sit Down on Seat A12 (75 kg)</span>
              </button>
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-bold inline-block">
                Seat A12 ✓ Seat Verified • Occupancy Confirmed
              </div>
            </div>
          )}

          {currentStep === 6 && (
            <div className="space-y-4 text-center">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs max-w-md mx-auto">
                <strong>Requirement Test:</strong> Attempting to scan Seat A12&apos;s dynamic credential at Unit SCREEN2-A13 must FAIL with <strong>WRONG_SEAT_SCAN</strong>.
              </div>
              <button
                onClick={runStep6_WrongSeatScan}
                disabled={loadingAction}
                className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 mx-auto"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Simulate Scanning A12 Ticket on Unit A13</span>
              </button>
              {demoState.seatScanMessage && (
                <div className="text-xs text-rose-400 font-bold max-w-md mx-auto">
                  {demoState.seatScanMessage}
                </div>
              )}
            </div>
          )}

          {currentStep === 7 && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-400">
                An unauthorized person sits on Seat A13. The 15s mismatch delay begins. Once elapsed, a silent staff alert is triggered.
              </p>
              <button
                onClick={runStep7_UnauthorizedSit}
                disabled={loadingAction}
                className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 mx-auto"
              >
                <Clock className="w-4 h-4" />
                <span>Simulate Sitting on A13 (Trigger 15s Mismatch Delay)</span>
              </button>
              {demoState.activeAlert && (
                <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-semibold max-w-md mx-auto">
                  {demoState.activeAlert}
                </div>
              )}
            </div>
          )}

          {currentStep === 8 && (
            <div className="space-y-4 text-center">
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs max-w-md mx-auto">
                <strong>Bag Filter Test:</strong> Placing a 35kg bag on Seat A14. The weight range 20-59kg is classified as UNCERTAIN luggage, so NO wrong-seat alert is triggered!
              </div>
              <button
                onClick={runStep8_BagFilter}
                disabled={loadingAction}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 mx-auto"
              >
                <span>Place 35 kg Bag on Seat A14</span>
              </button>
              <div className="text-xs text-slate-300 font-semibold">
                Status: UNCERTAIN (Luggage) • Alert Triggered: <strong>NO (Suppressed)</strong>
              </div>
            </div>
          )}

          {currentStep === 9 && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-400">
                Passenger presses the Assistance / SOS button. Triggers audible siren wail and pushes CRITICAL alert to staff.
              </p>
              <button
                onClick={runStep9_Sos}
                disabled={loadingAction}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 text-white font-black text-sm flex items-center gap-2 mx-auto shadow-xl shadow-rose-600/40"
              >
                <LifeBuoy className="w-5 h-5" />
                <span>Trigger In-App Emergency SOS</span>
              </button>
            </div>
          )}

          {currentStep === 10 && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-400">
                Simulating hardware occupancy sensor failure. Shows 🔧 and suppresses occupancy alerts to prevent false alarms.
              </p>
              <button
                onClick={runStep10_Fault}
                disabled={loadingAction}
                className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 mx-auto"
              >
                <span>Inject Sensor Glitch (Unit Offline)</span>
              </button>
              <div className="text-xs text-purple-300 font-semibold">
                Seat Unit A12: 🔧 Sensor OFFLINE • System alert dispatched to maintenance.
              </div>
            </div>
          )}

          {currentStep === 11 && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-400">
                Verify the tamper-evident SHA-256 hash chain containing every step above.
              </p>
              <button
                onClick={runStep11_VerifyAudit}
                disabled={loadingAction}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 mx-auto shadow-lg shadow-emerald-600/30"
              >
                <Lock className="w-4 h-4" />
                <span>Verify SHA-256 Audit Log Hash Chain</span>
              </button>

              {demoState.auditVerified && (
                <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500 text-emerald-200 text-xs font-bold space-y-2 animate-in zoom-in-95">
                  <div className="text-base font-black text-white">
                    🎉 100% Verification Complete!
                  </div>
                  <div>
                    All 11 steps completed successfully. The audit chain is unbroken and mathematically tamper-proof.
                  </div>
                  <div className="pt-2 flex justify-center gap-3">
                    <Link
                      href="/staff"
                      className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-semibold"
                    >
                      Open Live Staff Map
                    </Link>
                    <Link
                      href="/admin/audit"
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                    >
                      Inspect Audit Chain
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
