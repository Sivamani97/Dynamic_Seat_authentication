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
  UserCheck,
  QrCode,
  ShieldCheck,
  Layers,
  LogOut,
  LogIn,
  User,
  Shield,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface NavLinkItem {
  href: string;
  label: string;
  icon: any;
  emergency?: boolean;
  highlight?: boolean;
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string; role: "USER" | "STAFF" | "ADMIN" } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const fetchSessionRole = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setUser(null);
          setLoading(false);
          return;
        }

        // Fetch authoritative server-verified profile role
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const authData = await res.json();
          if (authData?.authenticated && authData.user) {
            setUser(authData.user);
          } else {
            setUser(null);
          }
        }
      } catch (err) {
        console.error("Navbar auth sync error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSessionRole();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      fetchSessionRole();
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      router.push("/login");
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  // Base navigation links based on verified role
  const getNavLinks = (): NavLinkItem[] => {
    if (!user) {
      return [
        { href: "/demo", label: "2-Min Demo", icon: PlayCircle, highlight: true },
        { href: "/events", label: "Events & Seats", icon: Ticket },
        { href: "/software", label: "Software Hub", icon: Layers },
      ];
    }

    if (user.role === "ADMIN") {
      return [
        { href: "/admin", label: "Command Center", icon: LayoutDashboard },
        { href: "/admin/audit", label: "Audit Chain", icon: ShieldCheck },
        { href: "/admin/units", label: "Seat Units", icon: Tv },
        { href: "/staff", label: "Staff Map", icon: ShieldAlert },
        { href: "/events", label: "Events", icon: Ticket },
      ];
    }

    if (user.role === "STAFF") {
      return [
        { href: "/staff", label: "Staff Map", icon: ShieldAlert },
        { href: "/staff/scan", label: "Gate Scanner", icon: QrCode },
        { href: "/events", label: "Events", icon: Ticket },
      ];
    }

    // Standard Passenger (USER)
    return [
      { href: "/events", label: "Events & Seats", icon: Ticket },
      { href: "/tickets", label: "My Tickets", icon: QrCode },
      { href: "/sos", label: "Emergency SOS", icon: ShieldAlert, emergency: true },
    ];
  };

  const navLinks = getNavLinks();

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
              const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    link.emergency
                      ? isActive
                        ? "bg-rose-600 text-white font-bold shadow-md shadow-rose-600/30"
                        : "text-rose-400 hover:text-white hover:bg-rose-600/30 font-semibold"
                      : link.highlight
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

          {/* User Session / Login Portals */}
          <div className="flex items-center gap-2">
            {!loading && user ? (
              <div className="flex items-center gap-2">
                {/* Verified Role Badge */}
                <div
                  className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border ${
                    user.role === "ADMIN"
                      ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                      : user.role === "STAFF"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                  }`}
                >
                  {user.role === "ADMIN" ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  ) : user.role === "STAFF" ? (
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  <span>{user.role === "ADMIN" ? "Admin" : user.role === "STAFF" ? "Staff" : "Passenger"}</span>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : !loading ? (
              <div className="flex items-center gap-2">
                {/* Passenger Login */}
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </Link>

                {/* Staff / Admin Portal Quick Links (Desktop) */}
                <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-400 pl-1 border-l border-slate-800">
                  <Link
                    href="/staff/login"
                    className="px-2 py-1 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-900 transition-colors"
                  >
                    Staff
                  </Link>
                  <Link
                    href="/admin/login"
                    className="px-2 py-1 rounded-lg text-slate-400 hover:text-purple-400 hover:bg-slate-900 transition-colors"
                  >
                    Admin
                  </Link>
                </div>
              </div>
            ) : null}

            {/* Mobile Menu Toggle Button */}
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
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden glass-panel border-b border-slate-800 px-4 pt-3 pb-6 space-y-4">
          {/* User Session Info if Logged In */}
          {user && (
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">{user.email || "Authenticated User"}</div>
                <div className="text-[11px] text-indigo-400 font-semibold">{user.role} Role</div>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold border border-rose-500/30 transition-all flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" />
                <span>Logout</span>
              </button>
            </div>
          )}

          {/* Navigation Links */}
          <div className="grid grid-cols-1 gap-2">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-medium ${
                    link.emergency
                      ? "bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold"
                      : link.highlight
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold"
                      : isActive
                      ? "bg-slate-800 text-white border border-slate-700"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Separate Login Portals Navigation if Unauthenticated */}
          {!user && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                Access Portals
              </span>
              <div className="grid grid-cols-3 gap-2">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold text-center"
                >
                  Passenger
                </Link>
                <Link
                  href="/staff/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-xl bg-amber-600/10 border border-amber-500/30 text-amber-400 text-xs font-bold text-center"
                >
                  Staff
                </Link>
                <Link
                  href="/admin/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-xl bg-purple-600/10 border border-purple-500/30 text-purple-400 text-xs font-bold text-center"
                >
                  Admin
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
