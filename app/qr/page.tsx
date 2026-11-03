import { Metadata } from "next";
import Link from "next/link";
import { QrCode, ShieldCheck, ArrowRight, Smartphone, ShieldAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Dynamic QR Center | SmartSeat",
  description: "Select whether to generate a dynamic 30-second ticket QR on your mobile or validate tickets.",
};

export default function QrIndexPage() {
  return (
    <div className="max-w-xl mx-auto py-12 px-4 space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <QrCode className="w-3.5 h-3.5" />
          <span>Mobile Dynamic QR Center</span>
        </div>
        <h1 className="text-3xl font-black text-white">Dynamic QR System</h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Choose a separate mobile interface below: display your live ticket QR or scan &amp; validate.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* QR Generation Card */}
        <Link
          href="/qr/generate"
          className="group glass-card p-6 rounded-3xl border border-indigo-500/30 hover:border-indigo-500/70 transition-all flex flex-col justify-between space-y-4 bg-gradient-to-b from-indigo-950/40 to-slate-950/80 hover:scale-[1.02]"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                Passenger View
              </span>
              <h2 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                QR Generator Page
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Generates 30-second rotating HMAC-SHA256 dynamic QR with visual countdown ring on mobile.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 group-hover:text-indigo-300 pt-2 border-t border-slate-800">
            <span>Launch Generator</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* QR Validation Card */}
        <Link
          href="/qr/validate"
          className="group glass-card p-6 rounded-3xl border border-blue-500/30 hover:border-blue-500/70 transition-all flex flex-col justify-between space-y-4 bg-gradient-to-b from-blue-950/40 to-slate-950/80 hover:scale-[1.02]"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">
                Staff / Scanner View
              </span>
              <h2 className="text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
                QR Validation Page
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Mobile camera barcode scanner and instant 1-click token validator for Gate turnstiles &amp; Seat units.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400 group-hover:text-blue-300 pt-2 border-t border-slate-800">
            <span>Launch Validator</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* SOS Link */}
      <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-400" />
          <div>
            <div className="text-xs font-bold text-white">Looking for Emergency SOS?</div>
            <div className="text-[11px] text-slate-400">Standalone high-priority emergency alert portal</div>
          </div>
        </div>
        <Link
          href="/sos"
          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-md shadow-rose-600/30"
        >
          Open SOS Page &rarr;
        </Link>
      </div>
    </div>
  );
}

