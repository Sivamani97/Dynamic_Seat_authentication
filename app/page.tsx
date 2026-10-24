import Link from "next/link";
import {
  Smartphone,
  ShieldAlert,
  LayoutDashboard,
  Tv,
  QrCode,
  CheckCircle2,
  Clock,
  Lock,
  Radio,
  ArrowRight,
  Flame,
  Activity,
  Layers,
} from "lucide-react";

export default function HomePage() {
  const portalCards = [
    {
      title: "Guided 2-Minute Demo",
      tag: "Recommended First",
      tagColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      description:
        "Walk through the full end-to-end flow in 2 minutes: Booking -> 30s Dynamic QR -> Entry Scan -> Seat Scan -> Seat Pressure -> Wrong Seat Mismatch -> Bag Filter -> Emergency SOS -> Hash Chain Audit.",
      href: "/demo",
      icon: Flame,
      gradient: "from-emerald-500/10 via-teal-500/5 to-transparent",
      borderColor: "hover:border-emerald-500/50",
      cta: "Launch Interactive Demo",
    },
    {
      title: "Passenger Portal",
      tag: "Mobile-First",
      tagColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
      description:
        "Choose seats on an interactive 2D map with 2-minute checkout holds. View dynamic tickets with 30s countdown rings, seat awareness status, and instant in-app assistance.",
      href: "/events",
      icon: Smartphone,
      gradient: "from-indigo-500/10 via-purple-500/5 to-transparent",
      borderColor: "hover:border-indigo-500/50",
      cta: "Browse Events & Book",
    },
    {
      title: "Staff Command Center",
      tag: "Realtime",
      tagColor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      description:
        "Live 2D auditorium & coach map with Supabase Realtime. Visual blinking for affected seats, Web Audio alarm synthesizer, vibration, and alert acknowledgment workflows.",
      href: "/staff",
      icon: ShieldAlert,
      gradient: "from-amber-500/10 via-orange-500/5 to-transparent",
      borderColor: "hover:border-amber-500/50",
      cta: "Open Live Staff Map",
    },
    {
      title: "QR Reader & Ticket Validator",
      tag: "Hardware Alternative",
      tagColor: "bg-blue-500/20 text-blue-300 border-blue-500/40",
      description:
        "Dedicated reader interface acting as the software alternative to physical scanners. Validates the 30s dynamic QR at gate turnstiles or seat units via camera or instant 1-click token verification.",
      href: "/reader",
      icon: QrCode,
      gradient: "from-blue-500/10 via-cyan-500/5 to-transparent",
      borderColor: "hover:border-blue-500/50",
      cta: "Open QR Reader Page",
    },
    {
      title: "Virtual Seat Unit",
      tag: "Software Sensor",
      tagColor: "bg-purple-500/20 text-purple-300 border-purple-500/40",
      description:
        "Complete software replacement for physical seat hardware. Features simulated pressure sensor slider (Sit, Stand, Bag), mini seat OLED display, fault injector, and 10s heartbeat.",
      href: "/seat-unit/SCREEN2-A12",
      icon: Tv,
      gradient: "from-purple-500/10 via-pink-500/5 to-transparent",
      borderColor: "hover:border-purple-500/50",
      cta: "Launch Virtual Unit A12",
    },
    {
      title: "Admin Governance & Audit",
      tag: "Security",
      tagColor: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      description:
        "System KPIs, seat unit health dashboard, analytics charts, settings configuration, and SHA-256 tamper-evident hash-chained audit log verifier.",
      href: "/admin",
      icon: LayoutDashboard,
      gradient: "from-rose-500/10 via-red-500/5 to-transparent",
      borderColor: "hover:border-rose-500/50",
      cta: "Open Admin Dashboard",
    },
  ];

  return (
    <div className="relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-16">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-indigo-600/15 via-purple-600/10 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm">
          <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>Zero Hardware • 100% Serverless • Next.js + Supabase</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
          Dynamic Seat Authentication <br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            & Emergency Response
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
          Extends ticket verification from the entrance gate directly to the individual seat.
          Powered by short-lived cryptographic dynamic QRs, a real-time state machine engine,
          bag-versus-passenger weight discrimination, and tamper-evident audit logging.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/demo"
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] transition-all flex items-center gap-2"
          >
            <Flame className="w-4 h-4" />
            Start 2-Minute Interactive Demo
          </Link>
          <Link
            href="/t/tok_bk829173_secure_demo_link"
            className="px-6 py-3 rounded-xl bg-slate-900 text-slate-200 border border-slate-700 hover:border-slate-500 hover:bg-slate-800 font-semibold text-sm transition-all flex items-center gap-2"
          >
            <Smartphone className="w-4 h-4 text-indigo-400" />
            Passenger Ticket (30s QR)
          </Link>
          <Link
            href="/reader"
            className="px-6 py-3 rounded-xl bg-slate-900 text-slate-200 border border-slate-700 hover:border-purple-500 hover:bg-slate-800 font-semibold text-sm transition-all flex items-center gap-2"
          >
            <QrCode className="w-4 h-4 text-purple-400" />
            QR Reader & Validator
          </Link>
        </div>
      </div>

      {/* Architecture Highlights Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-2xl glass-card border border-slate-800 text-left">
        <div className="flex items-start gap-3 p-2">
          <Clock className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-sm text-white">30s Dynamic Token</div>
            <div className="text-xs text-slate-400">HMAC-SHA256 signed with 128-bit random nonce replay rejection.</div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-2">
          <Layers className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-sm text-white">State Engine</div>
            <div className="text-xs text-slate-400">Filters luggage (20-59kg) and delays wrong-seat alert by 15s.</div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-2">
          <Radio className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-sm text-white">Supabase Realtime</div>
            <div className="text-xs text-slate-400">Sub-second push of seat occupancy, wrong seats, and SOS incidents.</div>
          </div>
        </div>
        <div className="flex items-start gap-3 p-2">
          <Lock className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-sm text-white">Audit Hash Chain</div>
            <div className="text-xs text-slate-400">Cryptographically chained SHA-256 logs with admin verifier.</div>
          </div>
        </div>
      </div>

      {/* Portal Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {portalCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`rounded-2xl glass-card border border-slate-800 p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 ${card.borderColor} bg-gradient-to-b ${card.gradient}`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-slate-900/90 border border-slate-700/60 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-indigo-400" />
                  </div>
                  <span
                    className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${card.tagColor}`}
                  >
                    {card.tag}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{card.title}</h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href={card.href}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-indigo-600 text-slate-200 hover:text-white border border-slate-700 hover:border-indigo-500 text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <span>{card.cta}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* System Flow Diagram */}
      <div className="glass-card rounded-2xl border border-slate-800 p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          End-to-End Verification Pipeline
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-center">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-indigo-400 uppercase">Step 1: Reservation</div>
            <div className="font-semibold text-sm text-white">Book Seat A12</div>
            <div className="text-[11px] text-slate-400">2-minute seat hold with atomic DB reservation.</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-purple-400 uppercase">Step 2: Gate Check-In</div>
            <div className="font-semibold text-sm text-white">Entry Scanner</div>
            <div className="text-[11px] text-slate-400">Scans 30s dynamic QR; transitions BOOKED &rarr; CHECKED_IN.</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-teal-400 uppercase">Step 3: Seat Scan</div>
            <div className="font-semibold text-sm text-white">Unit Scanner</div>
            <div className="text-[11px] text-slate-400">Validates seat A12 match. A13 scan rejected.</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-emerald-400 uppercase">Step 4: Occupancy</div>
            <div className="font-semibold text-sm text-white">Sensor Pressure</div>
            <div className="text-[11px] text-slate-400">75kg human triggers "Occupancy Confirmed". 35kg bag ignored.</div>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-rose-400 uppercase">Step 5: Alerting & SOS</div>
            <div className="font-semibold text-sm text-white">Realtime Broadcast</div>
            <div className="text-[11px] text-slate-400">Silent 15s mismatch or instant audible SOS siren.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
