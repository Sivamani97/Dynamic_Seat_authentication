import { Metadata } from "next";
import { QrScannerValidator } from "@/components/qr/QrScannerValidator";
import Link from "next/link";
import { ArrowLeft, QrCode } from "lucide-react";

export const metadata: Metadata = {
  title: "QR Validator & Scanner | SmartSeat Mobile Reader",
  description: "Mobile scanner and cryptographic validator for dynamic seat and gate turnstile authentication.",
};

export default function QrValidatePage() {
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
              href="/qr/generate"
              className="text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Open QR Ticket &rarr;
            </Link>
          </div>
        </div>

        {/* Modular QR Scanner & Validator Component */}
        <QrScannerValidator defaultMode="GATE" defaultSeatUnit="SCREEN2-A12" />
      </div>

      {/* Mobile Footer */}
      <div className="text-center pt-8 text-[11px] text-slate-500">
        SmartSeat Reader Module • Gate Turnstile &amp; Seat Hardware Alternative
      </div>
    </div>
  );
}

