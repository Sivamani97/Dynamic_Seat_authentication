import { Metadata } from "next";
import { DynamicQrGenerator } from "@/components/qr/DynamicQrGenerator";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, QrCode } from "lucide-react";

export const metadata: Metadata = {
  title: "Dynamic QR Generator | SmartSeat Mobile Ticket",
  description: "Dynamic rotating 30-second HMAC-SHA256 QR pass for passenger mobile authentication.",
};

export default function QrGeneratePage() {
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
              href="/qr/validate"
              className="text-blue-400 hover:text-blue-300 font-semibold"
            >
              Open Validator &rarr;
            </Link>
          </div>
        </div>

        {/* Dynamic QR Generator Component */}
        <DynamicQrGenerator initialTicketToken="tok_bk829173_secure_demo_link" />
      </div>

      {/* Mobile Footer */}
      <div className="text-center pt-8 text-[11px] text-slate-500">
        SmartSeat Dynamic Ticket Engine • 30-second HMAC Rotation • Replay Shield Active
      </div>
    </div>
  );
}

