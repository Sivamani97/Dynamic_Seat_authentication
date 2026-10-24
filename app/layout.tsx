import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "SmartSeat | Dynamic Seat Authentication & Emergency Response System",
  description:
    "100% Software-driven ticket verification extending from entry gates to individual seats with dynamic cryptographic QRs, real-time occupancy state engine, and silent mismatch alerting.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 antialiased selection:bg-indigo-500 selection:text-white" suppressHydrationWarning>
        <Navbar />
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>SmartSeat: Dynamic Seat Authentication & Emergency Response System (100% Software)</p>
            <p className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Serverless Next.js + Supabase Realtime + HMAC-SHA256
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
