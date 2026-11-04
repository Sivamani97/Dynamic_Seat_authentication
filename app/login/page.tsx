"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, ArrowRight, RefreshCw, Eye, EyeOff, Ticket, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function PassengerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message || "Invalid email or password.");
        setLoading(false);
        return;
      }

      if (data?.user) {
        // Verify authoritative role from server to guide redirect
        try {
          const res = await fetch("/api/auth/me");
          const authData = await res.json();
          const role = authData?.user?.role;

          if (role === "ADMIN") {
            router.push(redirectTarget || "/admin");
            return;
          } else if (role === "STAFF") {
            const dest = redirectTarget && !redirectTarget.startsWith("/admin") ? redirectTarget : "/staff";
            router.push(dest);
            return;
          }
        } catch {
          // If role lookup network fails, continue to passenger destination
        }

        const destination =
          redirectTarget && !redirectTarget.startsWith("/admin") && !redirectTarget.startsWith("/staff")
            ? redirectTarget
            : "/tickets";
        router.push(destination);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 shadow-md shadow-indigo-500/10">
            <Ticket className="w-6 h-6" />
          </div>
          <div className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Passenger Portal
          </div>
          <h1 className="text-2xl font-black text-white">SmartSeat Passenger Login</h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Access your 30-second dynamic rotating QR tickets, manage reservations, and trigger SOS assistance.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center font-medium flex items-center justify-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="passenger-email" className="text-xs font-semibold text-slate-300 block mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="passenger-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="passenger@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="passenger-password" className="text-xs font-semibold text-slate-300 block mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="passenger-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 transition-all"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            <span>{loading ? "Authenticating..." : "Sign In to Tickets"}</span>
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-slate-400 border-t border-slate-800/80">
          New to SmartSeat?{" "}
          <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2">
            Create Passenger Account
          </Link>
        </div>

        {/* Links to Other Dedicated Role Portals */}
        <div className="pt-2 grid grid-cols-2 gap-2 text-center text-[11px] text-slate-400">
          <Link
            href="/staff/login"
            className="p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-amber-400 hover:text-amber-300 font-medium transition-colors"
          >
            Staff & Usher Login →
          </Link>
          <Link
            href="/admin/login"
            className="p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-purple-400 hover:text-purple-300 font-medium transition-colors"
          >
            Admin Command Login →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-24 text-slate-400 text-xs">Loading SmartSeat Passenger Portal...</div>}>
      <PassengerLoginForm />
    </Suspense>
  );
}
