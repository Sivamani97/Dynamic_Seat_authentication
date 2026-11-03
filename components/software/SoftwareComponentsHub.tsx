"use client";

import { useState } from "react";
import Link from "next/link";
import {
  QrCode,
  ShieldCheck,
  ShieldAlert,
  Server,
  Smartphone,
  ExternalLink,
  Laptop,
  Wifi,
  Sparkles,
  Layers,
  ArrowRight,
  Tv,
  CheckCircle2,
  Globe,
} from "lucide-react";
import { DynamicQrGenerator } from "@/components/qr/DynamicQrGenerator";
import { QrScannerValidator } from "@/components/qr/QrScannerValidator";
import { SosEmergencyPanel } from "@/components/sos/SosEmergencyPanel";

type ActiveTab = "GENERATE" | "VALIDATE" | "SOS" | "HOSTING";

export function SoftwareComponentsHub() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("GENERATE");

  const components = [
    {
      id: "GENERATE",
      title: "QR Generator",
      tag: "Dynamic 30s QR",
      icon: QrCode,
      color: "from-indigo-600 to-purple-600",
      route: "/qr/generate",
    },
    {
      id: "VALIDATE",
      title: "QR Validator",
      tag: "Camera & Replay",
      icon: ShieldCheck,
      color: "from-blue-600 to-indigo-600",
      route: "/qr/validate",
    },
    {
      id: "SOS",
      title: "Emergency SOS",
      tag: "Instant Response",
      icon: ShieldAlert,
      color: "from-rose-600 to-red-600",
      route: "/sos",
    },
    {
      id: "HOSTING",
      title: "Hosting & Mobile",
      tag: "Mobile Setup Guide",
      icon: Smartphone,
      color: "from-emerald-600 to-teal-600",
      route: "#hosting-guide",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6 px-4">
      {/* Top Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <Layers className="w-3.5 h-3.5" />
          <span>Modular Component Architecture</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          SmartSeat Software Hub
        </h1>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          Every critical feature is componentized into independent, mistake-proof modules with dedicated mobile routes.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl">
        {components.map((c) => {
          const Icon = c.icon;
          const isActive = activeTab === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id as ActiveTab)}
              className={`p-2.5 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all ${
                isActive
                  ? `bg-gradient-to-r ${c.color} text-white shadow-lg`
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{c.title}</span>
              <span className="text-[9px] opacity-75 font-normal">{c.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Direct Standalone Route Pills */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
        <span className="text-slate-500 font-semibold">Dedicated File Locations:</span>
        <Link
          href="/qr/generate"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-all font-mono"
        >
          <span>/qr/generate</span>
          <ExternalLink className="w-3 h-3 text-indigo-400" />
        </Link>
        <Link
          href="/qr/validate"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-all font-mono"
        >
          <span>/qr/validate</span>
          <ExternalLink className="w-3 h-3 text-blue-400" />
        </Link>
        <Link
          href="/sos"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-all font-mono"
        >
          <span>/sos</span>
          <ExternalLink className="w-3 h-3 text-rose-400" />
        </Link>
      </div>

      {/* Active Component Container */}
      <div className="pt-2">
        {activeTab === "GENERATE" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-2xl text-xs text-indigo-300 flex items-center justify-between">
              <span>
                <strong>Component:</strong> `DynamicQrGenerator.tsx` (Route: `/qr/generate`)
              </span>
              <Link
                href="/qr/generate"
                className="font-bold underline flex items-center gap-1 hover:text-indigo-200"
              >
                Open Fullscreen
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <DynamicQrGenerator />
          </div>
        )}

        {activeTab === "VALIDATE" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-2xl text-xs text-blue-300 flex items-center justify-between">
              <span>
                <strong>Component:</strong> `QrScannerValidator.tsx` (Route: `/qr/validate`)
              </span>
              <Link
                href="/qr/validate"
                className="font-bold underline flex items-center gap-1 hover:text-blue-200"
              >
                Open Fullscreen
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <QrScannerValidator />
          </div>
        )}

        {activeTab === "SOS" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-2xl text-xs text-rose-300 flex items-center justify-between">
              <span>
                <strong>Component:</strong> `SosEmergencyPanel.tsx` (Route: `/sos`)
              </span>
              <Link
                href="/sos"
                className="font-bold underline flex items-center gap-1 hover:text-rose-200"
              >
                Open Fullscreen
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <SosEmergencyPanel />
          </div>
        )}

        {activeTab === "HOSTING" && (
          <div className="glass-card rounded-3xl border border-slate-700 p-6 space-y-6 text-slate-300 bg-slate-900/90 animate-fadeIn">
            <div className="space-y-2 border-b border-slate-800 pb-4">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-400" />
                Mobile Hosting & Network Access Guide
              </h2>
              <p className="text-xs text-slate-400">
                How to host the app and use both the QR generation and validation pages from mobile phones.
              </p>
            </div>

            {/* Local Mobile Wi-Fi Testing */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Wifi className="w-4 h-4 text-indigo-400" />
                Option 1: Test Immediately on Your Phone via Local Wi-Fi
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300 bg-slate-950 p-4 rounded-2xl border border-slate-800 font-sans">
                <li>
                  Run the host command on your computer:
                  <code className="block my-1.5 p-2 bg-slate-900 rounded-lg text-emerald-400 font-mono text-[11px]">
                    npm run dev:host
                  </code>
                  (This binds Next.js to <span className="font-mono text-white">0.0.0.0:3000</span> so mobile phones can connect).
                </li>
                <li>
                  Find your computer&apos;s local IP address (run <code className="text-indigo-300">ipconfig</code> in PowerShell, look for IPv4 e.g. <code className="text-white">192.168.1.45</code>).
                </li>
                <li>
                  On your mobile phone browser (connected to the same Wi-Fi), open:
                  <div className="mt-1 space-y-1 font-mono text-[11px] text-indigo-300">
                    <div>QR Generator: <span className="text-white">http://&lt;YOUR_IP&gt;:3000/qr/generate</span></div>
                    <div>QR Validator: <span className="text-white">http://&lt;YOUR_IP&gt;:3000/qr/validate</span></div>
                    <div>Emergency SOS: <span className="text-white">http://&lt;YOUR_IP&gt;:3000/sos</span></div>
                  </div>
                </li>
              </ol>
            </div>

            {/* Mobile Camera HTTPS Note */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-2">
              <div className="font-bold flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-amber-400" />
                Mobile Camera HTTPS Requirement:
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Mobile browsers (iOS Safari &amp; Android Chrome) require an <strong>HTTPS connection</strong> to grant camera permissions for live QR scanning. If connecting over raw HTTP Wi-Fi, you can:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-200/80">
                <li>Use the built-in <strong>Instant 1-Click Test Validator</strong> button (validates real live 30s tokens with zero camera permissions needed).</li>
                <li>Or expose with an HTTPS tunnel: <code className="bg-amber-950/80 px-1 py-0.5 rounded text-amber-100 font-mono">npx ngrok http 3000</code></li>
                <li>Or deploy to Vercel (free HTTPS domain).</li>
              </ul>
            </div>

            {/* Production Cloud Hosting (Vercel) */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-400" />
                Option 2: Deploy to Production (Vercel)
              </h3>
              <p className="text-xs text-slate-400">
                This project is 100% serverless and fully configured for Vercel with automatic HTTPS.
              </p>
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
                <div className="text-slate-400"># 1. Install or run Vercel CLI:</div>
                <div className="text-emerald-400">npx vercel</div>
                <div className="text-slate-400 pt-1"># 2. Add Environment Variables in Vercel Dashboard:</div>
                <div className="text-slate-300">
                  NEXT_PUBLIC_SUPABASE_URL<br />
                  NEXT_PUBLIC_SUPABASE_ANON_KEY<br />
                  SUPABASE_SERVICE_ROLE_KEY<br />
                  TOKEN_SIGNING_SECRET<br />
                  NEXT_PUBLIC_APP_URL
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

