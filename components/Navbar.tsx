"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  ShieldAlert,
  Ticket,
  Tv,
  LayoutDashboard,
  Smartphone,
  PlayCircle,
  Menu,
  X,
  Mail,
  UserCheck,
  QrCode,
  Radio,
  DoorOpen,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<"USER" | "STAFF" | "ADMIN">("USER");

  useEffect(() => {
    const savedRole = localStorage.getItem("smartseat_role") as any;
    if (savedRole && ["USER", "STAFF", "ADMIN"].includes(savedRole)) {
      setActiveRole(savedRole);
    }
  }, []);

  const switchRole = (role: "USER" | "STAFF" | "ADMIN") => {
    setActiveRole(role);
    localStorage.setItem("smartseat_role", role);
    if (role === "USER") router.push("/user");
    if (role === "STAFF") router.push("/user/staff");
    if (role === "ADMIN") router.push("/admin");
  };

  const navLinks = [
    { href: "/demo", label: "2-Min Demo", icon: PlayCircle, highlight: true },
    { href: "/user", label: "Passenger (/user)", icon: Smartphone },
    { href: "/reader", label: "QR Reader (/reader)", icon: QrCode },
    { href: "/user/staff", label: "Staff Map (/user/staff)", icon: ShieldAlert },
    { href: "/admin", label: "Admin Module (/admin)", icon: LayoutDashboard },
    { href: "/events", label: "Events & Seats", icon: Ticket },
    { href: "/seat-unit/SCREEN2-A12", label: "Seat Unit A12", icon: Tv },
  ];

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  SmartSeat
                </span>
                <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  100% Software
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1.5">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    link.highlight
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow-md shadow-indigo-500/20 hover:opacity-95"
                      : isActive
                      ? "bg-slate-800 text-white border border-slate-700"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Fast Role Switcher */}
          <div className="hidden sm:flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            {(["USER", "STAFF", "ADMIN"] as const).map((role) => (
              <button
                key={role}
                onClick={() => switchRole(role)}
                className={`px-2.5 py-1 rounded-lg font-semibold tracking-wide transition-all ${
                  activeRole === role
                    ? role === "ADMIN"
                      ? "bg-purple-600 text-white shadow-sm"
                      : role === "STAFF"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex lg:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden glass-panel border-b border-slate-800 px-4 pt-3 pb-6 space-y-2">
          <div className="grid grid-cols-3 gap-2 p-1.5 mb-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-center">
            {(["USER", "STAFF", "ADMIN"] as const).map((role) => (
              <button
                key={role}
                onClick={() => {
                  switchRole(role);
                  setMobileMenuOpen(false);
                }}
                className={`py-1.5 rounded-md font-semibold ${
                  activeRole === role ? "bg-indigo-600 text-white" : "text-slate-400"
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium ${
                    link.highlight
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold col-span-2 text-center justify-center"
                      : isActive
                      ? "bg-slate-800 text-white border border-slate-700"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
