import { Metadata } from "next";
import { SosEmergencyPanel } from "@/components/sos/SosEmergencyPanel";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, PhoneCall, Activity, HeartHandshake } from "lucide-react";

export const metadata: Metadata = {
  title: "Emergency SOS | SmartSeat Realtime Incident Dispatch",
  description: "Standalone high-priority emergency assistance dispatch for auditorium, theatre, and transit seats.",
};

export default function StandaloneSosPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] py-8 px-4 sm:px-6 flex flex-col justify-between">
      <div className="max-w-md mx-auto w-full space-y-4">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/staff"
              className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
            >
              <span>Staff Command Map</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>

        {/* SOS Emergency Panel */}
        <SosEmergencyPanel defaultSeatUnit="SCREEN2-A12" defaultSeatLabel="A12" />

        {/* Safety Protocol Card */}
        <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="font-bold text-slate-300 flex items-center gap-2">
            <HeartHandshake className="w-4 h-4 text-rose-400" />
            <span>Emergency Protocol</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Triggering an alert immediately alerts all staff on-site with seat coordinates.
            Stay at your seat if safe to do so. In case of immediate life safety threat (e.g. fire), proceed to the nearest illuminated emergency exit.
          </p>
        </div>
      </div>

      {/* Mobile Footer */}
      <div className="text-center pt-8 text-[11px] text-slate-500">
        SmartSeat Emergency Response Engine • Real-time Web Audio Alarm • SHA-256 Tamper-Evident Incident Chain
      </div>
    </div>
  );
}

